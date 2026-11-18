import type { Game, Player, Round, Rules } from './types';

export type GamePlayer = Pick<Player, 'id' | 'name' | 'color'>;

export function isAssafRound(round: Round): boolean {
  return Boolean(round.assafById && round.assafById !== round.callerId);
}

/** Winnaar van de ronde: de Yaniv-roeper, of bij een Assaf degene die Assaf riep. */
export function roundWinnerId(round: Round): string {
  return isAssafRound(round) ? (round.assafById as string) : round.callerId;
}

/** Punten die elke speler in deze ronde erbij krijgt (vóór bonus/halvering). */
export function roundScores(round: Round, rules: Rules): Record<string, number> {
  if (round.fixedScores) return { ...round.fixedScores };
  const assaf = isAssafRound(round);
  const out: Record<string, number> = {};
  for (const [pid, rawHand] of Object.entries(round.hands)) {
    const hand = Math.max(0, Math.round(Number(rawHand) || 0));
    if (!assaf) {
      out[pid] = pid === round.callerId ? 0 : hand;
    } else if (pid === round.assafById) {
      out[pid] = rules.assafWinnerGetsHandPoints ? hand : 0;
    } else if (pid === round.callerId) {
      out[pid] = hand + rules.assafPenalty;
    } else {
      out[pid] = hand;
    }
  }
  return out;
}

export function isOverLimit(total: number, rules: Rules): boolean {
  if (rules.scoreLimit <= 0) return false;
  return rules.eliminationBoundary === 'at_or_over' ? total >= rules.scoreLimit : total > rules.scoreLimit;
}

export interface EnrichedRound extends Round {
  roundNumber: number;
  winnerId: string;
  scores: Record<string, number>;
  afterTotals: Record<string, number>;
  bonusEvents: Record<string, string>;
  newlyEliminated: string[];
}

export interface Standing extends GamePlayer {
  score: number;
  isOut: boolean;
  eliminatedRound: number | null;
  roundsWon: number;
  assafsSuffered: number;
}

export interface GameState {
  rounds: EnrichedRound[];
  standings: Standing[];
  totals: Record<string, number>;
  eliminatedInRound: Record<string, number>;
  alive: GamePlayer[];
  isOver: boolean;
  champion: Standing | null;
}

export function computeGameState(game: Pick<Game, 'players' | 'rounds' | 'rules' | 'status'>): GameState {
  const { players, rules } = game;
  const totals: Record<string, number> = {};
  const eliminatedInRound: Record<string, number> = {};
  players.forEach(p => { totals[p.id] = 0; });

  const rounds: EnrichedRound[] = game.rounds.map((round, idx) => {
    const scores = roundScores(round, rules);
    const enriched: EnrichedRound = {
      ...round,
      roundNumber: idx + 1,
      winnerId: roundWinnerId(round),
      scores,
      afterTotals: {},
      bonusEvents: {},
      newlyEliminated: []
    };
    for (const p of players) {
      const pid = p.id;
      if (eliminatedInRound[pid]) {
        enriched.afterTotals[pid] = totals[pid];
        continue;
      }
      const added = scores[pid] ?? 0;
      let next = totals[pid] + added;
      // Bonus alleen als je er niet al door afgaat: wie over de grens gaat, wordt niet gered.
      if (
        rules.halvingEnabled &&
        added > 0 &&
        next > 0 &&
        next % rules.halvingEvery === 0 &&
        !isOverLimit(next, rules)
      ) {
        if (rules.halvingType === 'subtract50') {
          next = Math.max(0, next - 50);
          enriched.bonusEvents[pid] = '−50';
        } else {
          next = Math.floor(next / 2);
          enriched.bonusEvents[pid] = '÷2';
        }
      }
      totals[pid] = next;
      enriched.afterTotals[pid] = next;
      if (isOverLimit(next, rules)) {
        eliminatedInRound[pid] = idx + 1;
        enriched.newlyEliminated.push(pid);
      }
    }
    return enriched;
  });

  const standings: Standing[] = players
    .map(p => ({
      ...p,
      score: totals[p.id] ?? 0,
      isOut: Boolean(eliminatedInRound[p.id]),
      eliminatedRound: eliminatedInRound[p.id] ?? null,
      roundsWon: rounds.filter(r => r.winnerId === p.id).length,
      assafsSuffered: rounds.filter(r => isAssafRound(r) && r.callerId === p.id).length
    }))
    .sort((a, b) => {
      if (a.isOut !== b.isOut) return a.isOut ? 1 : -1;
      if (a.isOut && b.isOut && a.eliminatedRound !== b.eliminatedRound) {
        return (b.eliminatedRound ?? 0) - (a.eliminatedRound ?? 0);
      }
      return a.score - b.score;
    });

  const alive = players.filter(p => !eliminatedInRound[p.id]);
  const eliminatedCount = Object.keys(eliminatedInRound).length;
  const reachedEnd =
    rules.scoreLimit > 0 &&
    rounds.length > 0 &&
    (rules.gameEndMode === 'first_out' ? eliminatedCount >= 1 : alive.length <= 1);
  const isOver = reachedEnd || game.status === 'finished';
  const champion = isOver && rounds.length > 0 ? standings[0] ?? null : null;

  return { rounds, standings, totals, eliminatedInRound, alive, isOver, champion };
}

export interface RoundDraft {
  callerId: string | null;
  assafById: string | null;
  hands: Record<string, string>;
}

export interface RoundCheck {
  errors: string[];
  warnings: string[];
  round: Round | null;
}

/** Controleer een ingevoerde ronde tegen de regels. Fouten blokkeren, waarschuwingen vragen bevestiging. */
export function checkRound(
  draft: RoundDraft,
  alive: GamePlayer[],
  rules: Rules,
  base?: Pick<Round, 'id' | 'at'>
): RoundCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const name = (id: string) => alive.find(p => p.id === id)?.name ?? '?';

  if (!draft.callerId || !alive.some(p => p.id === draft.callerId)) {
    return { errors: ['Kies wie Yaniv riep.'], warnings, round: null };
  }
  const callerId = draft.callerId;
  const assafById = draft.assafById && draft.assafById !== callerId && alive.some(p => p.id === draft.assafById)
    ? draft.assafById
    : null;

  const hands: Record<string, number> = {};
  const missing: string[] = [];
  for (const p of alive) {
    const raw = draft.hands[p.id];
    if (raw === undefined || raw === '') {
      hands[p.id] = 0;
      // De roeper zonder assaf scoort sowieso 0; daar is invoer alleen nodig voor de Yaniv-limiet.
      if (p.id !== callerId || assafById) missing.push(p.name);
      continue;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      errors.push(`Ongeldige punten voor ${p.name}.`);
      continue;
    }
    if (n > rules.maxHandPoints) errors.push(`${p.name}: ${n} pt is meer dan het maximum van ${rules.maxHandPoints}.`);
    hands[p.id] = n;
  }

  const callerEntered = draft.hands[callerId] !== undefined && draft.hands[callerId] !== '';
  const callerHand = hands[callerId];
  if (rules.yanivLimitMode !== 'off' && callerEntered && callerHand > rules.yanivCallLimit) {
    const msg = `${name(callerId)} had ${callerHand} pt; Yaniv mag pas bij ≤ ${rules.yanivCallLimit}.`;
    (rules.yanivLimitMode === 'block' ? errors : warnings).push(msg);
  }
  if (assafById && callerEntered && hands[assafById] > callerHand) {
    warnings.push(`${name(assafById)} heeft méér punten (${hands[assafById]}) dan ${name(callerId)} (${callerHand}); is dit wel een Assaf?`);
  }
  if (!assafById && callerEntered) {
    const couldAssaf = alive.filter(p => p.id !== callerId && draft.hands[p.id] !== undefined && draft.hands[p.id] !== '' && hands[p.id] <= callerHand);
    if (couldAssaf.length > 0) {
      warnings.push(`${couldAssaf.map(p => p.name).join(', ')} had evenveel of minder dan ${name(callerId)}: vergeten Assaf te markeren?`);
    }
  }
  if (missing.length > 0) warnings.push(`Geen punten ingevuld voor ${missing.join(', ')} (telt als 0).`);

  const round: Round | null = errors.length
    ? null
    : {
        id: base?.id ?? newId(),
        at: base?.at ?? new Date().toISOString(),
        callerId,
        assafById,
        hands
      };
  return { errors, warnings, round };
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newGameCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function newSecret(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
