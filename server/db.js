import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDb(dir) {
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'yaniv.sqlite'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS library_items (
      kind TEXT NOT NULL,
      id TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (kind, id)
    );
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL,
      version INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS games_updated ON games (updated_at DESC);
  `);

  const q = {
    libAll: db.prepare('SELECT kind, data FROM library_items'),
    libGet: db.prepare('SELECT updated_at FROM library_items WHERE kind = ? AND id = ?'),
    libPut: db.prepare(`INSERT INTO library_items (kind, id, updated_at, data) VALUES (?, ?, ?, ?)
      ON CONFLICT(kind, id) DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data`),
    gameGet: db.prepare('SELECT token_hash, data FROM games WHERE id = ?'),
    gameInsert: db.prepare(`INSERT INTO games (id, token_hash, version, status, created_at, updated_at, data)
      VALUES (?, ?, ?, ?, ?, ?, ?)`),
    gameUpdate: db.prepare('UPDATE games SET version = ?, status = ?, updated_at = ?, data = ? WHERE id = ?'),
    gameList: db.prepare('SELECT data FROM games ORDER BY updated_at DESC LIMIT ?'),
    gameDelete: db.prepare('DELETE FROM games WHERE id = ?')
  };

  const KINDS = { players: 'player', presets: 'preset' };

  return {
    getLibrary() {
      const out = { players: [], presets: [] };
      for (const row of q.libAll.all()) {
        const item = JSON.parse(row.data);
        if (row.kind === 'player') out.players.push(item);
        if (row.kind === 'preset') out.presets.push(item);
      }
      return out;
    },
    /** Per item: nieuwste updatedAt wint (verwijderen gaat via deleted-vlag). */
    mergeLibrary(body) {
      db.exec('BEGIN');
      try {
        for (const [key, kind] of Object.entries(KINDS)) {
          const items = Array.isArray(body?.[key]) ? body[key].slice(0, 500) : [];
          for (const item of items) {
            if (!item || typeof item.id !== 'string' || item.id.length > 100 || item.builtIn) continue;
            const updatedAt = Number(item.updatedAt) || 0;
            const existing = q.libGet.get(kind, item.id);
            if (existing && existing.updated_at >= updatedAt) continue;
            q.libPut.run(kind, item.id, updatedAt, JSON.stringify(item));
          }
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    getGame(id) {
      const row = q.gameGet.get(id);
      return row ? { tokenHash: row.token_hash, game: JSON.parse(row.data) } : null;
    },
    insertGame(game, tokenHash) {
      q.gameInsert.run(game.id, tokenHash, game.version, game.status, Number(game.createdAt) || Date.now(), Date.now(), JSON.stringify(game));
    },
    updateGame(game) {
      q.gameUpdate.run(game.version, game.status, Date.now(), JSON.stringify(game), game.id);
    },
    listGames(limit) {
      return q.gameList.all(limit).map(r => JSON.parse(r.data));
    },
    deleteGame(id) {
      q.gameDelete.run(id);
    },
    close() {
      db.close();
    }
  };
}
