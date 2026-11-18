import { useMemo, useState } from 'react';
import type { GamePlayer, GameState, RoundDraft } from '../lib/scoring';
import { checkRound, isAssafRound, roundScores } from '../lib/scoring';
import type { Round, Rules } from '../lib/types';
import { Avatar, Button, Label, NumberInput } from './ui';

export function StandingsGrid({ state, rules }: { state: GameState; rules: Rules }) {
  const started = state.rounds.length > 0;
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
      {state.standings.map((p, idx) => {
        const leader = idx === 0 && started && !p.isOut;
        const left = rules.scoreLimit > 0 ? rules.scoreLimit - p.score + (rules.eliminationBoundary === 'over' ? 0 : -1) : null;
        return (
          <div
            key={p.id}
            className={`rounded-xl border p-3 ${
              p.isOut ? 'border-rose-900/40 bg-rose-950/20 opacity-60' : leader ? 'border-amber-500/50 bg-amber-500/15' : 'border-slate-800 bg-slate-950'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>#{idx + 1}{leader ? ' 👑' : ''}</span>
              {p.isOut ? <span className="font-bold text-rose-400">💀 Af (R{p.eliminatedRound})</span> : <span>🏆 {p.roundsWon}</span>}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Avatar name={p.name} color={p.color} size={22} />
              <span className={`truncate text-sm font-bold ${p.isOut ? 'text-slate-400 line-through' : 'text-white'}`}>{p.name}</span>
            </div>
            <div className="mt-1 text-2xl font-black text-white">
              {p.score} <span className="text-xs font-normal text-slate-500">pt</span>
            </div>
            {left !== null && !p.isOut && (
              <div className={`text-[11px] ${left <= 20 ? 'font-bold text-rose-300' : 'text-slate-500'}`}>nog {Math.max(0, left)} pt marge</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function draftFromRound(round: Round): RoundDraft {
  return {
    callerId: round.callerId,
    assafById: round.assafById,
    hands: Object.fromEntries(Object.entries(round.hands).map(([k, v]) => [k, String(v)]))
  };
}

export function RoundForm({
  alive, rules, initial, base, submitLabel, onSubmit, extra
}: {
  alive: GamePlayer[];
  rules: Rules;
  initial?: RoundDraft;
  base?: Pick<Round, 'id' | 'at'>;
  submitLabel: string;
  onSubmit: (round: Round) => void;
  extra?: React.ReactNode;
}) {
  const [draft, setDraft] = useState<RoundDraft>(initial ?? { callerId: null, assafById: null, hands: {} });
  const [confirming, setConfirming] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const check = useMemo(() => checkRound(draft, alive, rules, base), [draft, alive, rules, base]);
  const preview = check.round ? roundScores(check.round, rules) : null;

  const update = (patch: Partial<RoundDraft>) => {
    setDraft(d => ({ ...d, ...patch }));
    setConfirming(false);
    setShowIssues(false);
  };

  const submit = () => {
    setShowIssues(true);
    if (!check.round) return;
    if (check.warnings.length && !confirming) { setConfirming(true); return; }
    onSubmit(check.round);
    setDraft({ callerId: null, assafById: null, hands: {} });
    setConfirming(false);
    setShowIssues(false);
  };

  const caller = draft.callerId;
  const isAssaf = Boolean(draft.assafById && draft.assafById !== caller);

  return (
    <div className="space-y-5">
      <div>
        <Label>1 · Wie riep Yaniv?</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {alive.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => update({ callerId: p.id, assafById: draft.assafById === p.id ? null : draft.assafById })}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold ${
                caller === p.id ? 'border-emerald-500 bg-emerald-500/20 text-emerald-200' : 'border-slate-800 bg-slate-950 text-slate-300'
              }`}
            >
              <Avatar name={p.name} color={p.color} size={22} />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      {caller && (
        <div>
          <Label>2 · Assaf? (iemand had evenveel of minder)</Label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => update({ assafById: null })}
              className={`rounded-xl border px-3 py-1.5 text-xs font-bold ${!isAssaf ? 'border-indigo-400 bg-indigo-600 text-white' : 'border-slate-800 bg-slate-950 text-slate-400'}`}
            >
              Geen Assaf
            </button>
            {alive.filter(p => p.id !== caller).map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => update({ assafById: p.id })}
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold ${draft.assafById === p.id ? 'border-amber-400 bg-amber-500 text-slate-950' : 'border-slate-800 bg-slate-950 text-slate-400'}`}
              >
                ⚡ {p.name}
              </button>
            ))}
          </div>
          {isAssaf && (
            <p className="mt-2 text-xs text-amber-200">
              {alive.find(p => p.id === caller)?.name} krijgt hand + {rules.assafPenalty} straf;{' '}
              {alive.find(p => p.id === draft.assafById)?.name} krijgt {rules.assafWinnerGetsHandPoints ? 'eigen hand' : '0 pt'}.
            </p>
          )}
        </div>
      )}

      {caller && (
        <div className="space-y-2">
          <Label>3 · Punten in de hand</Label>
          {alive.map(p => {
            const isCaller = p.id === caller;
            const optional = isCaller && !isAssaf;
            return (
              <div key={p.id} className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 ${isCaller ? 'border-emerald-800/50 bg-emerald-950/25' : 'border-slate-800 bg-slate-950'}`}>
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar name={p.name} color={p.color} size={28} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-white">{p.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {isCaller ? (isAssaf ? '🗣 riep Yaniv, ⚡ geassaft' : `🗣 riep Yaniv${rules.yanivLimitMode !== 'off' ? ` (≤ ${rules.yanivCallLimit}), optioneel` : ''}`) : draft.assafById === p.id ? '⚡ riep Assaf' : ''}
                      {preview && preview[p.id] !== undefined && <span className="ml-1 text-slate-300">→ +{preview[p.id]}</span>}
                    </div>
                  </div>
                </div>
                <NumberInput
                  ariaLabel={`Punten ${p.name}`}
                  className="w-24"
                  placeholder={optional ? '–' : '0'}
                  max={rules.maxHandPoints}
                  value={draft.hands[p.id] ?? ''}
                  onChange={v => update({ hands: { ...draft.hands, [p.id]: v } })}
                />
              </div>
            );
          })}
        </div>
      )}

      {showIssues && (check.errors.length > 0 || check.warnings.length > 0) && (
        <div className="space-y-1 rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs">
          {check.errors.map(e => <div key={e} className="text-rose-300">⛔ {e}</div>)}
          {check.warnings.map(w => <div key={w} className="text-amber-200">⚠️ {w}</div>)}
        </div>
      )}

      <Button
        className="w-full py-3.5 text-base"
        variant={confirming ? 'gold' : 'primary'}
        disabled={!caller}
        onClick={submit}
      >
        {!caller ? 'Kies eerst wie Yaniv riep' : confirming ? 'Toch opslaan' : submitLabel}
      </Button>
      {extra}
    </div>
  );
}

export function HistoryTable({
  state, players, onEdit
}: {
  state: GameState;
  players: GamePlayer[];
  onEdit?: (roundIndex: number) => void;
}) {
  if (state.rounds.length === 0) return <p className="py-6 text-center text-sm text-slate-500">Nog geen rondes gespeeld.</p>;
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-max border-separate border-spacing-0 text-left text-xs">
        <thead>
          <tr className="text-slate-400">
            <th className="sticky left-0 z-10 bg-slate-900 py-2 pr-2">#</th>
            {players.map(p => (
              <th key={p.id} className="min-w-[64px] px-1 py-2 text-center">
                <div className="flex flex-col items-center gap-1">
                  <Avatar name={p.name} color={p.color} size={20} />
                  <span className="max-w-[72px] truncate">{p.name}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {state.rounds.map((r, idx) => (
            <tr key={r.id} className="border-t border-slate-800">
              <td className="sticky left-0 z-10 border-t border-slate-800 bg-slate-900 py-2 pr-2 font-bold text-slate-400">
                {onEdit ? (
                  <button onClick={() => onEdit(idx)} className="rounded-md border border-slate-700 px-1.5 py-0.5 text-slate-300" aria-label={`Ronde ${r.roundNumber} bewerken`}>
                    R{r.roundNumber} ✎
                  </button>
                ) : `R${r.roundNumber}`}
                {isAssafRound(r) && <div className="text-[10px] text-amber-300">⚡ Assaf</div>}
              </td>
              {players.map(p => {
                const played = r.scores[p.id] !== undefined;
                const caller = r.callerId === p.id;
                const winner = r.winnerId === p.id;
                return (
                  <td key={p.id} className={`border-t border-slate-800 px-1 py-2 text-center ${winner ? 'bg-emerald-500/10' : ''}`}>
                    {played ? (
                      <>
                        <div className={`font-bold ${winner ? 'text-emerald-300' : caller ? 'text-rose-300' : 'text-slate-200'}`}>
                          {winner ? '🏆 ' : ''}+{r.scores[p.id]}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {r.afterTotals[p.id]}
                          {r.bonusEvents[p.id] && <span className="ml-0.5 text-indigo-300">{r.bonusEvents[p.id]}</span>}
                          {r.newlyEliminated.includes(p.id) && ' 💀'}
                        </div>
                      </>
                    ) : (
                      <span className="text-slate-700">–</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
