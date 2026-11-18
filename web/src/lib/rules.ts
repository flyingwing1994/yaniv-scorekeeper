import type { RulePreset, Rules } from './types';

/** De standaardregels zoals ze in de eerste versie van de app stonden. */
export const HOUSE_RULES: Rules = {
  scoreLimit: 200,
  eliminationBoundary: 'over',
  gameEndMode: 'last_standing',
  yanivCallLimit: 7,
  yanivLimitMode: 'warn',
  halvingEnabled: true,
  halvingType: 'half',
  halvingEvery: 50,
  assafPenalty: 30,
  assafWinnerGetsHandPoints: true,
  maxHandPoints: 60
};

export const OFFICIAL_RULES: Rules = {
  ...HOUSE_RULES,
  halvingType: 'subtract50',
  assafWinnerGetsHandPoints: false,
  yanivLimitMode: 'block'
};

export const BUILT_IN_PRESETS: RulePreset[] = [
  { id: 'builtin-house', name: 'Thuisregels', rules: HOUSE_RULES, builtIn: true, updatedAt: 0 },
  { id: 'builtin-official', name: 'Officieel', rules: OFFICIAL_RULES, builtIn: true, updatedAt: 0 }
];

/** Vul ontbrekende velden aan (bijv. oudere data) en klem waarden binnen redelijke grenzen. */
export function normalizeRules(input: Partial<Rules> | undefined): Rules {
  const r = { ...HOUSE_RULES, ...(input ?? {}) };
  const int = (v: unknown, min: number, max: number, fallback: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  return {
    scoreLimit: int(r.scoreLimit, 0, 10000, HOUSE_RULES.scoreLimit),
    eliminationBoundary: r.eliminationBoundary === 'at_or_over' ? 'at_or_over' : 'over',
    gameEndMode: r.gameEndMode === 'first_out' ? 'first_out' : 'last_standing',
    yanivCallLimit: int(r.yanivCallLimit, 0, 100, HOUSE_RULES.yanivCallLimit),
    yanivLimitMode: ['off', 'warn', 'block'].includes(r.yanivLimitMode) ? r.yanivLimitMode : 'warn',
    halvingEnabled: Boolean(r.halvingEnabled),
    halvingType: r.halvingType === 'subtract50' ? 'subtract50' : 'half',
    halvingEvery: int(r.halvingEvery, 1, 10000, 50),
    assafPenalty: int(r.assafPenalty, 0, 1000, HOUSE_RULES.assafPenalty),
    assafWinnerGetsHandPoints: Boolean(r.assafWinnerGetsHandPoints),
    maxHandPoints: int(r.maxHandPoints, 1, 1000, HOUSE_RULES.maxHandPoints)
  };
}

export function rulesEqual(a: Rules, b: Rules): boolean {
  return (Object.keys(a) as (keyof Rules)[]).every(k => a[k] === b[k]);
}

export function describeRules(r: Rules): string[] {
  const lines: string[] = [];
  lines.push(
    r.scoreLimit > 0
      ? `Af ${r.eliminationBoundary === 'over' ? 'boven' : 'op of boven'} ${r.scoreLimit} pt`
      : 'Geen afvalgrens (handmatig beëindigen)'
  );
  if (r.scoreLimit > 0) lines.push(r.gameEndMode === 'first_out' ? 'Einde bij eerste afvaller' : 'Laatste overlevende wint');
  if (r.yanivLimitMode !== 'off') lines.push(`Yaniv bij ≤ ${r.yanivCallLimit} pt (${r.yanivLimitMode === 'block' ? 'verplicht' : 'waarschuwing'})`);
  if (r.halvingEnabled) lines.push(`${r.halvingType === 'half' ? 'Halveren ÷2' : '−50'} bij veelvoud van ${r.halvingEvery}`);
  lines.push(`Assaf: +${r.assafPenalty} straf, assaf-roeper krijgt ${r.assafWinnerGetsHandPoints ? 'eigen hand' : '0 pt'}`);
  return lines;
}
