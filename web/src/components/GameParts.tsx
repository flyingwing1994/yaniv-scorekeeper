import { useMemo, useState } from 'react';
import type { GamePlayer, GameState, RoundDraft } from '../lib/scoring';
import { checkRound, isAssafRound, roundScores } from '../lib/scoring';
import type { Round, Rules } from '../lib/types';
import { Button, Label, NumberInput, Segmented, Swatch } from './ui';

export function Standings({ state, rules }: { state: GameState; rules: Rules }) {
  const started = state.rounds.length > 0;
  const limit = rules.scoreLimit;
  return (
    <ol>
      {state.standings.map((p, idx) => {
        const lead = idx === 0 && started && !p.isOut;
        const pct = limit > 0 ? Math.min(100, (p.score / limit) * 100) : 0;
        const left = limit > 0 ? limit - p.score - (rules.eliminationBoundary === 'over' ? 0 : 1) : null;
        const danger = left !== null && !p.isOut && left <= 20;
        return (
          <li key={p.id} className={`grid min-h-[52px] grid-cols-[26px_1fr_auto] items-center gap-2 border-b border-line-soft ${p.isOut ? 'opacity-45' : ''}`}>
            <span className="font-mono text-xs text-faint">{String(idx + 1).padStart(2, '0')}</span>
            <div className="min-w-0 py-2">
              <div className="flex items-center gap-2">
                <Swatch color={p.color} size={8} />
                <span className={`truncate text-base font-semibold ${p.isOut ? 'line-through' : ''}`}>{p.name}</span>
                {p.isOut && <span className="font-mono text-[11px] text-danger">AF R{p.eliminatedRound}</span>}
                {!p.isOut && started && <span className="font-mono text-[11px] text-faint">{p.roundsWon}× gewonnen</span>}
              </div>
              {limit > 0 && (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="relative h-[3px] flex-1 bg-raised">
                    <span className={`absolute inset-y-0 left-0 ${lead ? 'bg-accent' : danger ? 'bg-danger' : 'bg-fg'}`} style={{ width: `${pct}%` }} />
                  </div>
                  {!p.isOut && <span className={`w-14 text-right font-mono text-[10px] ${danger ? 'text-danger' : 'text-faint'}`}>nog {Math.max(0, left ?? 0)}</span>}
                </div>
              )}
            </div>
            <span className={`min-w-[56px] text-right text-[28px] font-extrabold tracking-[-0.03em] ${lead ? 'text-accent' : ''}`}>{p.score}</span>
          </li>
        );
      })}
    </ol>
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
  const nameOf = (id: string | null) => alive.find(p => p.id === id)?.name ?? '';

  return (
    <div>
      <div className="flex items-baseline justify-between pb-2 pt-6">
        <Label>Yaniv geroepen door</Label>
      </div>
      <Segmented
        value={caller ?? ''}
        onChange={id => update({ callerId: id, assafById: draft.assafById === id ? null : draft.assafById })}
        options={alive.map(p => ({ value: p.id, label: p.name }))}
        columns={alive.length <= 4 ? alive.length : alive.length <= 6 ? 3 : 4}
      />

      {caller && (
        <>
          <div className="flex items-baseline justify-between pb-2 pt-5">
            <Label>Assaf</Label>
            <span className="text-[11px] text-faint">iemand met evenveel of minder punten</span>
          </div>
          <Segmented
            value={draft.assafById ?? ''}
            onChange={id => update({ assafById: id || null })}
            options={[{ value: '', label: 'Geen' }, ...alive.filter(p => p.id !== caller).map(p => ({ value: p.id, label: p.name, tone: 'accent' as const }))]}
            columns={alive.length <= 4 ? alive.length : alive.length <= 6 ? 3 : 4}
          />
          {isAssaf && (
            <p className="mt-2 text-[13px] text-muted">
              <b className="text-fg">{nameOf(caller)}</b> krijgt hand + {rules.assafPenalty}. <b className="text-fg">{nameOf(draft.assafById)}</b> krijgt {rules.assafWinnerGetsHandPoints ? 'de eigen hand' : '0 punten'}.
            </p>
          )}

          <div className="flex items-baseline justify-between pb-1 pt-5">
            <Label>Punten in de hand</Label>
            {preview && <span className="text-[11px] text-faint">rechts: erbij deze ronde</span>}
          </div>
          {alive.map(p => {
            const isCaller = p.id === caller;
            const optional = isCaller && !isAssaf;
            const note = isCaller
              ? isAssaf ? `riep Yaniv, +${rules.assafPenalty}` : rules.yanivLimitMode !== 'off' ? `riep Yaniv, max ${rules.yanivCallLimit}` : 'riep Yaniv'
              : draft.assafById === p.id ? 'riep Assaf' : '';
            return (
              <div key={p.id} className="flex min-h-14 items-center justify-between gap-3 border-b border-line-soft">
                <div className="flex min-w-0 items-center gap-2">
                  <Swatch color={p.color} size={8} />
                  <span className="truncate text-[15px] font-semibold">{p.name}</span>
                  {note && <span className={`font-mono text-[11px] ${isCaller && isAssaf ? 'text-accent' : 'text-muted'}`}>{note}</span>}
                </div>
                <div className="flex items-center gap-3">
                  {preview && preview[p.id] !== undefined && <span className="w-10 text-right font-mono text-xs text-muted">+{preview[p.id]}</span>}
                  <NumberInput
                    ariaLabel={`Punten ${p.name}`}
                    className="w-[72px]"
                    placeholder={optional ? '–' : '0'}
                    max={rules.maxHandPoints}
                    value={draft.hands[p.id] ?? ''}
                    onChange={v => update({ hands: { ...draft.hands, [p.id]: v } })}
                  />
                </div>
              </div>
            );
          })}
        </>
      )}

      {showIssues && (check.errors.length > 0 || check.warnings.length > 0) && (
        <div className="mt-4 space-y-1.5 border-l-2 border-accent pl-3 text-[13px]">
          {check.errors.map(e => <p key={e} className="text-danger">{e}</p>)}
          {check.warnings.map(w => <p key={w} className="text-fg">{w}</p>)}
        </div>
      )}

      <Button className="mt-5 w-full py-4 text-[15px]" disabled={!caller} onClick={submit}>
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
  if (state.rounds.length === 0) return <p className="py-10 text-center text-sm text-muted">Nog geen rondes gespeeld.</p>;
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-max border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            <th className="sticky left-0 z-10 bg-bg py-2 pr-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Ronde</th>
            {players.map(p => (
              <th key={p.id} className="min-w-[60px] px-1 py-2 text-right">
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold">
                  <Swatch color={p.color} size={6} />
                  <span className="max-w-[64px] truncate">{p.name}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {state.rounds.map((r, idx) => (
            <tr key={r.id} className="border-b border-line-soft">
              <td className="sticky left-0 z-10 bg-bg py-2 pr-3 align-top">
                {onEdit ? (
                  <button onClick={() => onEdit(idx)} className="font-mono text-xs text-fg underline decoration-line underline-offset-4" aria-label={`Ronde ${r.roundNumber} bewerken`}>
                    R{String(r.roundNumber).padStart(2, '0')}
                  </button>
                ) : <span className="font-mono text-xs">R{String(r.roundNumber).padStart(2, '0')}</span>}
                {isAssafRound(r) && <div className="font-mono text-[10px] text-accent">assaf</div>}
              </td>
              {players.map(p => {
                const played = r.scores[p.id] !== undefined;
                const winner = r.winnerId === p.id;
                const penalized = isAssafRound(r) && r.callerId === p.id;
                return (
                  <td key={p.id} className="px-1 py-2 text-right align-top">
                    {played ? (
                      <>
                        <div className={`text-[15px] font-bold ${winner ? 'text-accent' : penalized ? 'text-danger' : ''}`}>
                          {winner && r.scores[p.id] === 0 ? 'Y' : `+${r.scores[p.id]}`}
                        </div>
                        <div className="font-mono text-[10px] text-faint">
                          {r.bonusEvents[p.id] && <span className="mr-1 text-fg">{r.bonusEvents[p.id]}</span>}
                          {r.afterTotals[p.id]}
                          {r.newlyEliminated.includes(p.id) && <span className="ml-1 text-danger">af</span>}
                        </div>
                      </>
                    ) : (
                      <span className="text-faint">·</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-faint">Y = won de ronde met 0 punten. Oranje = rondewinnaar, rood = geassaft. Tik op een ronde om die aan te passen.</p>
    </div>
  );
}
