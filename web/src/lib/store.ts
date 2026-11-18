import { useSyncExternalStore } from 'react';
import { HOUSE_RULES, normalizeRules } from './rules';
import { computeGameState, newGameCode, newId, newSecret } from './scoring';
import type { Game, Library, Player, RulePreset, Rules } from './types';

export type ThemePref = 'system' | 'light' | 'dark';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error' | 'pin';

export interface AppState {
  library: Library;
  games: Record<string, Game>;
  /** Bewerk-sleutels voor potjes die dit toestel mag bijwerken. */
  tokens: Record<string, string>;
  currentGameId: string | null;
  lastRules: Rules;
  lastPlayerIds: string[];
  pin: string;
  theme: ThemePref;
  dirtyLibrary: boolean;
  dirtyGames: string[];
  sync: { status: SyncStatus; message?: string; lastSync?: number; pinRequired?: boolean };
}

const STORAGE_KEY = 'yaniv.v2';
const LEGACY_KEY = 'yaniv_scorekeeper_github_v1';

export const PLAYER_COLORS = [
  '#ec4899', '#a855f7', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#14b8a6', '#6366f1', '#84cc16', '#f97316',
  '#06b6d4', '#e11d48'
];

function emptyState(): AppState {
  return {
    library: { players: [], presets: [] },
    games: {},
    tokens: {},
    currentGameId: null,
    lastRules: HOUSE_RULES,
    lastPlayerIds: [],
    pin: '',
    theme: 'system',
    dirtyLibrary: false,
    dirtyGames: [],
    sync: { status: 'idle' }
  };
}

/** Zet data uit de eerste versie (vaste 5 spelers, localStorage) om naar het nieuwe model. */
function migrateLegacy(state: AppState): AppState {
  let raw: string | null = null;
  try { raw = localStorage.getItem(LEGACY_KEY); } catch { /* geen storage */ }
  if (!raw) return state;
  try {
    const old = JSON.parse(raw);
    const legacyPlayers: [string, string, string][] = [
      ['shirley', 'Shirley', '#ec4899'], ['annelies', 'Annelies', '#a855f7'], ['wichard', 'Wichard', '#3b82f6'],
      ['mathijs', 'Mathijs', '#10b981'], ['michiel', 'Michiel', '#f59e0b']
    ];
    const now = Date.now();
    state.library.players = legacyPlayers.map(([id, name, color]) => ({ id, name, color, updatedAt: now }));
    state.dirtyLibrary = true;
    state.lastRules = normalizeRules({
      scoreLimit: old.maxScoreLimit,
      eliminationBoundary: old.eliminationBoundary,
      gameEndMode: old.gameEndMode,
      yanivCallLimit: old.yanivCallLimit,
      halvingEnabled: old.enableHalvingRule,
      halvingType: old.halvingType,
      halvingEvery: old.halvingTrigger === 'every100' ? 100 : 50,
      assafPenalty: old.assafPenalty,
      assafWinnerGetsHandPoints: old.assafWinnerGetsHandPoints
    });
    state.lastPlayerIds = Array.isArray(old.selectedPlayerIds) ? old.selectedPlayerIds : [];
    if (old.gameStarted && Array.isArray(old.rounds) && old.rounds.length > 0) {
      const id = newGameCode();
      const game: Game = {
        id,
        createdAt: now,
        updatedAt: now,
        version: 1,
        status: 'active',
        rules: state.lastRules,
        players: state.library.players.filter(p => state.lastPlayerIds.includes(p.id)).map(({ id, name, color }) => ({ id, name, color })),
        rounds: old.rounds.map((r: { winnerId: string; assafPlayerId: string | null; scores: Record<string, number> }) => ({
          id: newId(),
          at: new Date(now).toISOString(),
          callerId: r.assafPlayerId ?? r.winnerId,
          assafById: r.assafPlayerId ? r.winnerId : null,
          hands: {},
          fixedScores: r.scores
        }))
      };
      game.status = computeGameState(game).isOver ? 'finished' : 'active';
      state.games[id] = game;
      state.tokens[id] = newSecret();
      state.currentGameId = id;
      state.dirtyGames = [id];
    }
    localStorage.removeItem(LEGACY_KEY);
  } catch { /* corrupte oude data negeren */ }
  return state;
}

function load(): AppState {
  const base = emptyState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...base, ...parsed, lastRules: normalizeRules(parsed.lastRules), sync: { status: 'idle' } };
    }
  } catch { /* leeg beginnen */ }
  return migrateLegacy(base);
}

let state: AppState = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    const { sync: _sync, ...rest } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch { /* opslag vol of geblokkeerd */ }
}

function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>), opts: { persist?: boolean; sync?: boolean } = {}) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  if (opts.persist !== false) persist();
  listeners.forEach(l => l());
  if (opts.sync) scheduleSync();
}

export function getState() {
  return state;
}

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => selector(state)
  );
}

// ---------- Bibliotheek: spelers & regelsets ----------

export function upsertPlayer(player: Partial<Player> & { name: string }): string {
  const now = Date.now();
  const id = player.id ?? newId();
  setState(s => {
    const existing = s.library.players.find(p => p.id === player.id);
    const usedColors = new Set(s.library.players.filter(p => !p.deleted).map(p => p.color));
    const color = player.color ?? existing?.color ?? PLAYER_COLORS.find(c => !usedColors.has(c)) ?? PLAYER_COLORS[s.library.players.length % PLAYER_COLORS.length];
    const next: Player = { ...existing, ...player, id, name: player.name.trim(), color, updatedAt: now };
    const players = existing ? s.library.players.map(p => (p.id === next.id ? next : p)) : [...s.library.players, next];
    return { library: { ...s.library, players }, dirtyLibrary: true };
  }, { sync: true });
  return id;
}

export function deletePlayer(id: string) {
  setState(s => ({
    library: { ...s.library, players: s.library.players.map(p => (p.id === id ? { ...p, deleted: true, updatedAt: Date.now() } : p)) },
    lastPlayerIds: s.lastPlayerIds.filter(pid => pid !== id),
    dirtyLibrary: true
  }), { sync: true });
}

export function upsertPreset(preset: { id?: string; name: string; rules: Rules }): string {
  const id = preset.id ?? newId();
  setState(s => {
    const next: RulePreset = { id, name: preset.name.trim(), rules: normalizeRules(preset.rules), updatedAt: Date.now() };
    const exists = s.library.presets.some(p => p.id === id);
    const presets = exists ? s.library.presets.map(p => (p.id === id ? next : p)) : [...s.library.presets, next];
    return { library: { ...s.library, presets }, dirtyLibrary: true };
  }, { sync: true });
  return id;
}

export function deletePreset(id: string) {
  setState(s => ({
    library: { ...s.library, presets: s.library.presets.map(p => (p.id === id ? { ...p, deleted: true, updatedAt: Date.now() } : p)) },
    dirtyLibrary: true
  }), { sync: true });
}

function mergeItems<T extends { id: string; updatedAt: number }>(local: T[], remote: T[]): T[] {
  const map = new Map(local.map(i => [i.id, i]));
  for (const r of remote) {
    const l = map.get(r.id);
    if (!l || (r.updatedAt ?? 0) > (l.updatedAt ?? 0)) map.set(r.id, r);
  }
  return [...map.values()];
}

// ---------- Potjes ----------

export function canEdit(id: string) {
  return Boolean(state.tokens[id]);
}

export function createGame(playerIds: string[], rules: Rules, fallback: Game['players'] = []): string {
  const id = newGameCode();
  const now = Date.now();
  const lib = state.library.players.filter(p => !p.deleted);
  const players = playerIds
    .map(pid => lib.find(p => p.id === pid) ?? fallback.find(p => p.id === pid))
    .filter((p): p is Game['players'][number] => Boolean(p))
    .map(({ id, name, color }) => ({ id, name, color }));
  const game: Game = { id, createdAt: now, updatedAt: now, version: 1, status: 'active', rules: normalizeRules(rules), players, rounds: [] };
  setState(s => ({
    games: { ...s.games, [id]: game },
    tokens: { ...s.tokens, [id]: newSecret() },
    currentGameId: id,
    lastRules: game.rules,
    lastPlayerIds: playerIds,
    dirtyGames: [...new Set([...s.dirtyGames, id])]
  }), { sync: true });
  return id;
}

/** Wijzig een potje dat dit toestel mag bewerken. Status volgt automatisch uit de regels. */
export function updateGame(id: string, fn: (g: Game) => Game) {
  const current = state.games[id];
  if (!current || !state.tokens[id]) return;
  const changed = fn(current);
  const reachedEnd = computeGameState({ ...changed, status: 'active' }).isOver;
  const status = changed.endedManually || reachedEnd ? 'finished' : 'active';
  const next: Game = {
    ...changed,
    status,
    finishedAt: status === 'finished' ? changed.finishedAt ?? Date.now() : undefined,
    version: current.version + 1,
    updatedAt: Date.now()
  };
  setState(s => ({
    games: { ...s.games, [id]: next },
    dirtyGames: [...new Set([...s.dirtyGames, id])]
  }), { sync: true });
}

export function setCurrentGame(id: string | null) {
  setState({ currentGameId: id });
}

export function forgetGame(id: string) {
  setState(s => {
    const games = { ...s.games };
    const tokens = { ...s.tokens };
    delete games[id];
    delete tokens[id];
    return { games, tokens, currentGameId: s.currentGameId === id ? null : s.currentGameId, dirtyGames: s.dirtyGames.filter(g => g !== id) };
  });
}

export async function deleteGameEverywhere(id: string) {
  const token = state.tokens[id];
  if (token && navigator.onLine) {
    try {
      await fetch(`/api/games/${id}`, { method: 'DELETE', headers: authHeaders(token) });
    } catch { /* lokaal alsnog verwijderen */ }
  }
  forgetGame(id);
}

/** Ontvangen van server/live-stream: alleen overnemen als het nieuwer is dan wat we lokaal hebben. */
export function receiveGame(game: Game) {
  const local = state.games[game.id];
  const pendingLocal = state.dirtyGames.includes(game.id);
  if (local && (local.version > game.version || (pendingLocal && local.version >= game.version))) return;
  if (local && local.version === game.version && local.updatedAt === game.updatedAt) return;
  setState(s => ({ games: { ...s.games, [game.id]: { ...game, rules: normalizeRules(game.rules) } } }));
}

export function adoptEditToken(id: string, token: string) {
  if (!/^[a-f0-9]{16,}$/.test(token)) return;
  setState(s => ({ tokens: { ...s.tokens, [id]: token } }));
}

export function setPin(pin: string) {
  setState(s => ({ pin, sync: { ...s.sync, status: 'idle', message: undefined } }), { sync: true });
}

// ---------- Thema ----------

const THEME_COLORS = { light: '#f6f6f4', dark: '#0e0e0e' };

export function applyTheme(pref: ThemePref = state.theme) {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
  // Statusbalk-kleur: bij 'system' kiest de media-query in index.html, anders beide tags gelijk zetten.
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    const forDark = m.getAttribute('media')?.includes('dark');
    const color = pref === 'system' ? (forDark ? THEME_COLORS.dark : THEME_COLORS.light) : THEME_COLORS[pref];
    m.setAttribute('content', color);
  });
}

export function setTheme(theme: ThemePref) {
  setState({ theme });
  applyTheme(theme);
}

export function watchSystemTheme() {
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());
}

// ---------- Synchronisatie ----------

function authHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (state.pin) h['X-App-Pin'] = state.pin;
  if (token) h['X-Edit-Token'] = token;
  return h;
}

function setSync(sync: Partial<AppState['sync']>) {
  setState(s => ({ sync: { ...s.sync, ...sync } }), { persist: false });
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncing = false;
let syncAgain = false;

export function scheduleSync(delay = 400) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { void syncNow(); }, delay);
}

export async function syncNow() {
  if (syncing) { syncAgain = true; return; }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setSync({ status: 'offline', message: 'Offline: wijzigingen worden later gesynchroniseerd' });
    return;
  }
  syncing = true;
  setSync({ status: 'syncing', message: undefined });
  try {
    const health = await fetch('/api/health').then(r => r.json()).catch(() => null);
    if (!health) throw Object.assign(new Error('Server niet bereikbaar'), { offline: true });
    setSync({ pinRequired: Boolean(health.pinRequired) });

    // Bibliotheek
    if (state.dirtyLibrary) {
      const sentAt = state.library;
      const res = await fetch('/api/library', { method: 'PUT', headers: authHeaders(), body: JSON.stringify(sentAt) });
      if (res.status === 401) throw Object.assign(new Error('PIN vereist om te synchroniseren'), { pin: true });
      if (!res.ok) throw new Error(`Bibliotheek: ${res.status}`);
      const remote: Library = await res.json();
      setState(s => ({
        library: { players: mergeItems(s.library.players, remote.players), presets: mergeItems(s.library.presets, remote.presets) },
        dirtyLibrary: s.library !== sentAt
      }));
    } else {
      const remote: Library = await fetch('/api/library').then(r => r.json());
      setState(s => ({ library: { players: mergeItems(s.library.players, remote.players), presets: mergeItems(s.library.presets, remote.presets) } }));
    }

    // Potjes
    for (const id of [...state.dirtyGames]) {
      const game = state.games[id];
      const token = state.tokens[id];
      if (!game || !token) {
        setState(s => ({ dirtyGames: s.dirtyGames.filter(g => g !== id) }));
        continue;
      }
      const res = await fetch(`/api/games/${id}`, { method: 'PUT', headers: authHeaders(token), body: JSON.stringify(game) });
      if (res.status === 401) throw Object.assign(new Error('PIN vereist om te synchroniseren'), { pin: true });
      if (res.status === 409) {
        // Een ander toestel met dezelfde bewerklink was sneller: neem die versie over.
        const body = await res.json();
        setState(s => ({
          games: { ...s.games, [id]: body.game },
          dirtyGames: s.dirtyGames.filter(g => g !== id),
          sync: { ...s.sync, message: `Potje ${id} is bijgewerkt vanaf een ander toestel` }
        }));
        continue;
      }
      if (res.status === 403) {
        setState(s => {
          const tokens = { ...s.tokens };
          delete tokens[id];
          return { tokens, dirtyGames: s.dirtyGames.filter(g => g !== id) };
        });
        continue;
      }
      if (!res.ok) throw new Error(`Potje ${id}: ${res.status}`);
      setState(s => ({
        dirtyGames: s.games[id]?.version === game.version ? s.dirtyGames.filter(g => g !== id) : s.dirtyGames
      }));
    }
    setSync({ status: 'idle', lastSync: Date.now(), message: undefined });
  } catch (err) {
    const e = err as Error & { pin?: boolean; offline?: boolean };
    if (e.pin) setSync({ status: 'pin', message: e.message });
    else if (e.offline || err instanceof TypeError) setSync({ status: 'offline', message: 'Server niet bereikbaar: lokaal opgeslagen' });
    else setSync({ status: 'error', message: e.message });
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; scheduleSync(100); }
  }
}

export async function fetchRemoteGames(): Promise<Game[]> {
  const res = await fetch('/api/games?limit=50');
  if (!res.ok) throw new Error('Kon potjes niet laden');
  return res.json();
}

export async function fetchGame(id: string): Promise<Game | null> {
  const res = await fetch(`/api/games/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Kon potje niet laden');
  const game: Game = await res.json();
  receiveGame(game);
  return game;
}

export function startBackgroundSync() {
  window.addEventListener('online', () => scheduleSync(0));
  window.addEventListener('offline', () => setSync({ status: 'offline', message: 'Offline: wijzigingen worden later gesynchroniseerd' }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(0); });
  setInterval(() => { if (state.dirtyLibrary || state.dirtyGames.length) scheduleSync(0); }, 20000);
  scheduleSync(0);
}

export function activePlayers(lib: Library) {
  return lib.players.filter(p => !p.deleted).sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

export function activePresets(lib: Library) {
  return lib.presets.filter(p => !p.deleted);
}
