// Yaniv Scorekeeper server: API + live updates (SSE) + statische PWA.
// Geen externe dependencies: Node >= 22.13 (node:http, node:sqlite).
import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';

const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const APP_PIN = process.env.APP_PIN || '';
const MAX_BODY = 1024 * 1024;

const db = openDb(DATA_DIR);

/** @type {Map<string, Set<http.ServerResponse>>} */
const subscribers = new Map();

const sha256 = s => createHash('sha256').update(String(s)).digest('hex');

function safeEqual(a, b) {
  const ba = Buffer.from(sha256(a));
  const bb = Buffer.from(sha256(b));
  return timingSafeEqual(ba, bb);
}

function send(res, status, body, headers = {}) {
  const data = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(data);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Body te groot'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('Ongeldige JSON'), { status: 400 });
  }
}

function requirePin(req) {
  if (!APP_PIN) return;
  const given = req.headers['x-app-pin'];
  if (typeof given !== 'string' || !safeEqual(given, APP_PIN)) {
    throw Object.assign(new Error('PIN vereist'), { status: 401 });
  }
}

const GAME_ID = /^[A-Z0-9]{6}$/;

function validateGame(game, id) {
  const ok =
    game && typeof game === 'object' &&
    game.id === id &&
    Number.isInteger(game.version) && game.version >= 1 &&
    (game.status === 'active' || game.status === 'finished') &&
    Array.isArray(game.players) && game.players.length >= 2 && game.players.length <= 30 &&
    Array.isArray(game.rounds) && game.rounds.length <= 5000 &&
    game.rules && typeof game.rules === 'object';
  if (!ok) throw Object.assign(new Error('Ongeldig potje'), { status: 400 });
}

function broadcast(game) {
  const subs = subscribers.get(game.id);
  if (!subs) return;
  const payload = `event: game\ndata: ${JSON.stringify(game)}\n\n`;
  for (const res of subs) res.write(payload);
}

function subscribe(req, res, id) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 3000\n\n');
  const current = db.getGame(id);
  if (current) res.write(`event: game\ndata: ${JSON.stringify(current.game)}\n\n`);
  else res.write('event: missing\ndata: {}\n\n');

  if (!subscribers.has(id)) subscribers.set(id, new Set());
  subscribers.get(id).add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    const set = subscribers.get(id);
    set?.delete(res);
    if (set && set.size === 0) subscribers.delete(id);
  });
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const method = req.method;

  if (parts[1] === 'health') return send(res, 200, { ok: true, pinRequired: Boolean(APP_PIN) });

  if (parts[1] === 'pin' && method === 'POST') {
    requirePin(req);
    return send(res, 200, { ok: true });
  }

  if (parts[1] === 'library') {
    if (method === 'GET') return send(res, 200, db.getLibrary());
    if (method === 'PUT') {
      requirePin(req);
      const body = await readJson(req);
      db.mergeLibrary(body);
      return send(res, 200, db.getLibrary());
    }
  }

  if (parts[1] === 'games') {
    const id = parts[2]?.toUpperCase();
    if (!id) {
      if (method === 'GET') {
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 30));
        return send(res, 200, db.listGames(limit));
      }
    } else {
      if (!GAME_ID.test(id)) return send(res, 400, { error: 'Ongeldige code' });

      if (parts[3] === 'events' && method === 'GET') return subscribe(req, res, id);

      if (!parts[3] && method === 'GET') {
        const row = db.getGame(id);
        return row ? send(res, 200, row.game) : send(res, 404, { error: 'Potje niet gevonden' });
      }

      if (!parts[3] && method === 'PUT') {
        requirePin(req);
        const token = req.headers['x-edit-token'];
        if (typeof token !== 'string' || token.length < 16) return send(res, 401, { error: 'Bewerk-sleutel ontbreekt' });
        const game = await readJson(req);
        validateGame(game, id);
        const existing = db.getGame(id);
        if (!existing) {
          db.insertGame(game, sha256(token));
        } else {
          if (!safeEqual(sha256(token), existing.tokenHash)) return send(res, 403, { error: 'Geen bewerkrechten voor dit potje' });
          if (game.version <= existing.game.version) return send(res, 409, { error: 'Verouderde versie', game: existing.game });
          db.updateGame(game);
        }
        broadcast(game);
        return send(res, 200, { ok: true, version: game.version });
      }

      if (!parts[3] && method === 'DELETE') {
        requirePin(req);
        const existing = db.getGame(id);
        if (!existing) return send(res, 204);
        const token = req.headers['x-edit-token'];
        if (typeof token !== 'string' || !safeEqual(sha256(token), existing.tokenHash)) {
          return send(res, 403, { error: 'Geen bewerkrechten voor dit potje' });
        }
        db.deleteGame(id);
        const subs = subscribers.get(id);
        subs?.forEach(s => s.write('event: missing\ndata: {}\n\n'));
        return send(res, 204);
      }
    }
  }

  return send(res, 404, { error: 'Niet gevonden' });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, { error: 'Verboden' });

  let target = file;
  try {
    const st = await stat(target);
    if (!st.isFile()) throw new Error('not a file');
  } catch {
    // SPA-fallback voor routes zonder extensie.
    if (path.extname(rel)) return send(res, 404, { error: 'Niet gevonden' });
    target = path.join(PUBLIC_DIR, 'index.html');
  }
  const ext = path.extname(target);
  const immutable = target.includes(`${path.sep}assets${path.sep}`);
  const body = await readFile(target);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Methode niet toegestaan' });
    return await serveStatic(req, res, url);
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'Serverfout' : err.message });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Yaniv Scorekeeper luistert op :${PORT} (data: ${DATA_DIR}, PIN ${APP_PIN ? 'aan' : 'uit'})`);
});

const shutdown = () => {
  for (const set of subscribers.values()) set.forEach(r => r.end());
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
