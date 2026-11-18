import { describe, expect, it } from 'vitest';
import { checkRound, computeGameState, roundScores } from './scoring';
import { HOUSE_RULES, normalizeRules } from './rules';
import type { Game, Round, Rules } from './types';

const players = [
  { id: 'a', name: 'Anna', color: '#f00' },
  { id: 'b', name: 'Bram', color: '#0f0' },
  { id: 'c', name: 'Cas', color: '#00f' }
];

const r = (callerId: string, hands: Record<string, number>, assafById: string | null = null): Round => ({
  id: Math.random().toString(36),
  at: '2026-01-01T00:00:00Z',
  callerId,
  assafById,
  hands
});

const game = (rounds: Round[], rules: Partial<Rules> = {}, status: Game['status'] = 'active') => ({
  players,
  rounds,
  rules: normalizeRules(rules),
  status
});

describe('roundScores', () => {
  it('geeft de Yaniv-roeper 0 en de rest hun hand', () => {
    expect(roundScores(r('a', { a: 5, b: 12, c: 20 }), HOUSE_RULES)).toEqual({ a: 0, b: 12, c: 20 });
  });

  it('bestraft de roeper bij Assaf en volgt de regel voor de assaf-roeper', () => {
    const round = r('a', { a: 6, b: 4, c: 20 }, 'b');
    expect(roundScores(round, HOUSE_RULES)).toEqual({ a: 36, b: 4, c: 20 });
    expect(roundScores(round, { ...HOUSE_RULES, assafWinnerGetsHandPoints: false, assafPenalty: 25 })).toEqual({ a: 31, b: 0, c: 20 });
  });

  it('gebruikt fixedScores van gemigreerde rondes', () => {
    expect(roundScores({ ...r('a', {}), fixedScores: { a: 0, b: 7 } }, HOUSE_RULES)).toEqual({ a: 0, b: 7 });
  });
});

describe('computeGameState', () => {
  it('halveert bij een veelvoud van 50', () => {
    const s = computeGameState(game([r('a', { a: 0, b: 30, c: 10 }), r('a', { a: 0, b: 20, c: 10 })]));
    expect(s.totals.b).toBe(25);
    expect(s.rounds[1].bonusEvents.b).toBe('÷2');
  });

  it('trekt 50 af bij subtract50 en respecteert halvingEvery', () => {
    const rules = { halvingType: 'subtract50' as const, halvingEvery: 100 };
    const s = computeGameState(game([r('a', { a: 0, b: 50, c: 10 }), r('a', { a: 0, b: 50, c: 10 })], rules));
    expect(s.totals.b).toBe(50);
    expect(s.rounds[0].bonusEvents.b).toBeUndefined();
  });

  it('geeft geen bonus zonder halveren', () => {
    const s = computeGameState(game([r('a', { a: 0, b: 50, c: 10 })], { halvingEnabled: false }));
    expect(s.totals.b).toBe(50);
  });

  it('redt niemand met een bonus die al over de grens is', () => {
    const s = computeGameState(game([r('a', { a: 0, b: 40, c: 0 }), r('a', { a: 0, b: 60, c: 0 })], { scoreLimit: 90 }));
    expect(s.totals.b).toBe(100);
    expect(s.eliminatedInRound.b).toBe(2);
  });

  it('halveert precies op de grens bij "boven", maar niet bij "op of boven"', () => {
    const rounds = [r('a', { a: 0, b: 60, c: 0 }), r('a', { a: 0, b: 40, c: 0 })];
    expect(computeGameState(game(rounds, { scoreLimit: 100 })).totals.b).toBe(50);
    const s = computeGameState(game(rounds, { scoreLimit: 100, eliminationBoundary: 'at_or_over' }));
    expect(s.totals.b).toBe(100);
    expect(s.standings.find(p => p.id === 'b')?.isOut).toBe(true);
  });

  it('eindigt bij eerste afvaller of bij laatste overlevende', () => {
    const rounds = [r('a', { a: 0, b: 120, c: 10 })];
    expect(computeGameState(game(rounds, { scoreLimit: 100, gameEndMode: 'first_out' })).isOver).toBe(true);
    const ls = computeGameState(game(rounds, { scoreLimit: 100 }));
    expect(ls.isOver).toBe(false);
    expect(ls.alive.map(p => p.id)).toEqual(['a', 'c']);
    const done = computeGameState(game([...rounds, r('a', { a: 0, c: 80 })], { scoreLimit: 100 }));
    expect(done.isOver).toBe(false);
    const done2 = computeGameState(game([...rounds, r('a', { a: 0, c: 120 })], { scoreLimit: 100 }));
    expect(done2.isOver).toBe(true);
    expect(done2.champion?.id).toBe('a');
  });

  it('negeert punten van afgevallen spelers en eindigt nooit vanzelf zonder grens', () => {
    const s = computeGameState(game([r('a', { a: 0, b: 900, c: 3 })], { scoreLimit: 0 }));
    expect(s.isOver).toBe(false);
    const finished = computeGameState(game([r('a', { a: 0, b: 900, c: 3 })], { scoreLimit: 0 }, 'finished'));
    expect(finished.isOver).toBe(true);
    expect(finished.champion?.id).toBe('a');
  });

  it('telt gewonnen rondes en geleden assafs', () => {
    const s = computeGameState(game([r('a', { a: 5, b: 3, c: 9 }, 'b'), r('c', { a: 4, b: 3, c: 1 })]));
    const by = Object.fromEntries(s.standings.map(p => [p.id, p]));
    expect(by.b.roundsWon).toBe(1);
    expect(by.c.roundsWon).toBe(1);
    expect(by.a.assafsSuffered).toBe(1);
  });
});

describe('checkRound', () => {
  it('vereist een roeper', () => {
    expect(checkRound({ callerId: null, assafById: null, hands: {} }, players, HOUSE_RULES).errors).toHaveLength(1);
  });

  it('waarschuwt of blokkeert boven de Yaniv-limiet', () => {
    const draft = { callerId: 'a', assafById: null, hands: { a: '9', b: '20', c: '15' } };
    const warn = checkRound(draft, players, HOUSE_RULES);
    expect(warn.errors).toHaveLength(0);
    expect(warn.warnings.some(w => w.includes('Yaniv mag pas'))).toBe(true);
    const block = checkRound(draft, players, { ...HOUSE_RULES, yanivLimitMode: 'block' });
    expect(block.round).toBeNull();
  });

  it('blokkeert onrealistische handpunten', () => {
    const c = checkRound({ callerId: 'a', assafById: null, hands: { a: '3', b: '500', c: '4' } }, players, HOUSE_RULES);
    expect(c.errors.length).toBe(1);
  });

  it('signaleert een gemiste Assaf en lege invoer', () => {
    const c = checkRound({ callerId: 'a', assafById: null, hands: { a: '5', b: '4' } }, players, HOUSE_RULES);
    expect(c.warnings.some(w => w.includes('Assaf'))).toBe(true);
    expect(c.warnings.some(w => w.includes('Cas'))).toBe(true);
    expect(c.round?.hands).toEqual({ a: 5, b: 4, c: 0 });
  });
});
