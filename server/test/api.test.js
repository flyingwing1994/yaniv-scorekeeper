// Black-box-tests voor de server: start server.js als apart proces met een tijdelijke
// database en een tijdelijke map met statische bestanden. Draaien: cd server && npm test
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server.js');

function vrijePoort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/** Start de server; geeft { base, stop } terug. */
async function startServer({ pin = '' } = {}) {
  const tmp = await mkdtemp(path.join(tmpdir(), 'yaniv-test-'));
  const publicDir = path.join(tmp, 'public');
  await mkdir(path.join(publicDir, 'assets'), { recursive: true });
  await writeFile(path.join(publicDir, 'index.html'), '<!doctype html><title>yaniv</title>');
  await writeFile(path.join(publicDir, 'assets', 'app.js'), 'console.log(1)');
  const port = await vrijePoort();
  const proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', SERVER], {
    env: { ...process.env, PORT: String(port), DATA_DIR: path.join(tmp, 'data'), PUBLIC_DIR: publicDir, APP_PIN: pin },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server startte niet:\n${log}`)), 10000);
    const lees = chunk => {
      log += chunk;
      if (log.includes('luistert')) { clearTimeout(timer); resolve(); }
    };
    proc.stdout.on('data', lees);
    proc.stderr.on('data', lees);
    proc.on('exit', code => { clearTimeout(timer); reject(new Error(`Server stopte (code ${code}):\n${log}`)); });
  });
  return {
    base: `http://127.0.0.1:${port}`,
    async stop() {
      proc.removeAllListeners('exit');
      const klaar = new Promise(r => proc.once('exit', r));
      proc.kill('SIGTERM');
      await klaar;
      await rm(tmp, { recursive: true, force: true });
    }
  };
}

const TOKEN = 'bewerksleutel-0123456789';
const potje = (id, version = 1, extra = {}) => ({
  id, version, status: 'active', createdAt: 1,
  players: [{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Bram' }],
  rounds: [], rules: {}, ...extra
});

async function api(base, pad, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(base + pad, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const tekst = await res.text();
  return { status: res.status, data: tekst ? JSON.parse(tekst) : undefined, headers: res.headers };
}

describe('server zonder PIN', () => {
  let s;
  before(async () => { s = await startServer(); });
  after(async () => { await s.stop(); });

  test('health meldt ok en geen PIN', async () => {
    const r = await api(s.base, '/api/health');
    assert.equal(r.status, 200);
    assert.deepEqual(r.data, { ok: true, pinRequired: false });
  });

  test('bibliotheek: opslaan, ophalen, nieuwste wint, ingebouwde sets genegeerd', async () => {
    let r = await api(s.base, '/api/library', {
      method: 'PUT',
      body: {
        players: [{ id: 'p1', name: 'Anna', updatedAt: 10 }],
        presets: [{ id: 'huis', name: 'Thuisregels', builtIn: true, updatedAt: 10 }]
      }
    });
    assert.equal(r.status, 200);
    assert.deepEqual(r.data.players.map(p => p.name), ['Anna']);
    assert.equal(r.data.presets.length, 0);

    await api(s.base, '/api/library', { method: 'PUT', body: { players: [{ id: 'p1', name: 'Oud', updatedAt: 5 }] } });
    await api(s.base, '/api/library', { method: 'PUT', body: { players: [{ id: 'p1', name: 'Anne', updatedAt: 20 }] } });
    r = await api(s.base, '/api/library');
    assert.deepEqual(r.data.players.map(p => p.name), ['Anne']);
  });

  test('potje: aanmaken, ophalen, bijwerken en in de lijst', async () => {
    const id = 'ABC123';
    let r = await api(s.base, `/api/games/${id}`, { method: 'PUT', body: potje(id), headers: { 'X-Edit-Token': TOKEN } });
    assert.equal(r.status, 200);
    assert.equal(r.data.version, 1);

    r = await api(s.base, `/api/games/${id.toLowerCase()}`);
    assert.equal(r.status, 200, 'code is hoofdletterongevoelig');
    assert.equal(r.data.id, id);

    r = await api(s.base, `/api/games/${id}`, { method: 'PUT', body: potje(id, 2, { status: 'finished' }), headers: { 'X-Edit-Token': TOKEN } });
    assert.equal(r.status, 200);

    r = await api(s.base, '/api/games?limit=5');
    assert.ok(r.data.some(g => g.id === id && g.version === 2 && g.status === 'finished'));
  });

  test('potje: bewerkrechten, versies en invoer worden gecontroleerd', async () => {
    const id = 'XYZ789';
    await api(s.base, `/api/games/${id}`, { method: 'PUT', body: potje(id, 3), headers: { 'X-Edit-Token': TOKEN } });

    let r = await api(s.base, `/api/games/${id}`, { method: 'PUT', body: potje(id, 4), headers: { 'X-Edit-Token': 'andere-sleutel-0123456' } });
    assert.equal(r.status, 403, 'andere sleutel');

    r = await api(s.base, `/api/games/${id}`, { method: 'PUT', body: potje(id, 3), headers: { 'X-Edit-Token': TOKEN } });
    assert.equal(r.status, 409, 'zelfde versie is verouderd');
    assert.equal(r.data.game.version, 3);

    r = await api(s.base, `/api/games/${id}`, { method: 'PUT', body: potje(id, 4) });
    assert.equal(r.status, 401, 'zonder sleutel');

    r = await api(s.base, `/api/games/${id}`, { method: 'PUT', body: potje('ANDERS', 4), headers: { 'X-Edit-Token': TOKEN } });
    assert.equal(r.status, 400, 'id in body moet bij de URL passen');

    r = await api(s.base, `/api/games/${id}`, { method: 'PUT', body: potje(id, 4, { players: [{ id: 'a' }] }), headers: { 'X-Edit-Token': TOKEN } });
    assert.equal(r.status, 400, 'minstens twee spelers');

    r = await api(s.base, '/api/games/TE-LANG');
    assert.equal(r.status, 400, 'ongeldige code');

    r = await api(s.base, '/api/games/ONBEKD');
    assert.equal(r.status, 404);
  });

  test('potje verwijderen kan alleen met de juiste sleutel', async () => {
    const id = 'DEL001';
    await api(s.base, `/api/games/${id}`, { method: 'PUT', body: potje(id), headers: { 'X-Edit-Token': TOKEN } });

    let r = await api(s.base, `/api/games/${id}`, { method: 'DELETE', headers: { 'X-Edit-Token': 'verkeerde-sleutel-012345' } });
    assert.equal(r.status, 403);

    r = await api(s.base, `/api/games/${id}`, { method: 'DELETE', headers: { 'X-Edit-Token': TOKEN } });
    assert.equal(r.status, 204);
    r = await api(s.base, `/api/games/${id}`);
    assert.equal(r.status, 404);
  });

  test('live meekijken stuurt de huidige stand', async () => {
    const id = 'LIVE01';
    await api(s.base, `/api/games/${id}`, { method: 'PUT', body: potje(id), headers: { 'X-Edit-Token': TOKEN } });
    const ctrl = new AbortController();
    const res = await fetch(`${s.base}/api/games/${id}/events`, { signal: ctrl.signal });
    assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    const lezer = res.body.getReader();
    let tekst = '';
    while (!tekst.includes('event: game')) tekst += new TextDecoder().decode((await lezer.read()).value);
    ctrl.abort();
    assert.match(tekst, /"id":"LIVE01"/);
  });

  test('statische bestanden, SPA-fallback en geen toegang buiten de map', async () => {
    let res = await fetch(`${s.base}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<title>yaniv<\/title>/);

    res = await fetch(`${s.base}/potje/ABC123`);
    assert.equal(res.status, 200, 'route zonder extensie valt terug op index.html');
    await res.text();

    res = await fetch(`${s.base}/assets/app.js`);
    assert.match(res.headers.get('cache-control'), /immutable/);
    await res.text();

    res = await fetch(`${s.base}/bestaat-niet.js`);
    assert.equal(res.status, 404);
    await res.text();

    res = await fetch(`${s.base}/..%2f..%2fserver.js`);
    assert.equal(res.status, 403, 'pad buiten de publieke map');
    await res.text();

    res = await fetch(`${s.base}/`, { method: 'POST' });
    assert.equal(res.status, 405);
    await res.text();
  });
});

describe('server met PIN', () => {
  let s;
  before(async () => { s = await startServer({ pin: '4321' }); });
  after(async () => { await s.stop(); });

  test('health meldt dat een PIN nodig is', async () => {
    assert.equal((await api(s.base, '/api/health')).data.pinRequired, true);
  });

  test('opslaan vraagt de PIN, meekijken niet', async () => {
    const body = { players: [{ id: 'p1', name: 'Anna', updatedAt: 1 }] };
    assert.equal((await api(s.base, '/api/library', { method: 'PUT', body })).status, 401, 'zonder PIN');
    assert.equal((await api(s.base, '/api/library', { method: 'PUT', body, headers: { 'X-App-Pin': '0000' } })).status, 401, 'verkeerde PIN');
    assert.equal((await api(s.base, '/api/library', { method: 'PUT', body, headers: { 'X-App-Pin': '4321' } })).status, 200, 'juiste PIN');
    assert.equal((await api(s.base, '/api/library')).status, 200, 'lezen zonder PIN');

    const id = 'PIN001';
    let r = await api(s.base, `/api/games/${id}`, { method: 'PUT', body: potje(id), headers: { 'X-Edit-Token': TOKEN } });
    assert.equal(r.status, 401, 'potje opslaan zonder PIN');
    r = await api(s.base, `/api/games/${id}`, { method: 'PUT', body: potje(id), headers: { 'X-Edit-Token': TOKEN, 'X-App-Pin': '4321' } });
    assert.equal(r.status, 200);
  });

  test('PIN controleren via /api/pin', async () => {
    assert.equal((await api(s.base, '/api/pin', { method: 'POST', headers: { 'X-App-Pin': '4321' } })).status, 200);
    assert.equal((await api(s.base, '/api/pin', { method: 'POST', headers: { 'X-App-Pin': 'fout' } })).status, 401);
  });
});
