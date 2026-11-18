import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../lib/scoring';
import { isAssafRound } from '../lib/scoring';
import type { Game } from '../lib/types';

export type ScreenEvent =
  | { type: 'round'; roundNumber: number; winner: string; bonuses: string[] }
  | { type: 'assaf'; victim: string; winner: string; penalty: number }
  | { type: 'eliminated'; names: string[]; limit: number }
  | { type: 'champion'; name: string; score: number };

/** Bepaal welke animatie hoort bij de laatst toegevoegde ronde. */
export function eventForLastRound(game: Game, state: GameState): ScreenEvent | null {
  const last = state.rounds[state.rounds.length - 1];
  if (!last) return null;
  const name = (id: string) => game.players.find(p => p.id === id)?.name ?? '?';
  if (state.isOver && state.champion) return { type: 'champion', name: state.champion.name, score: state.champion.score };
  if (last.newlyEliminated.length) return { type: 'eliminated', names: last.newlyEliminated.map(name), limit: game.rules.scoreLimit };
  if (isAssafRound(last)) return { type: 'assaf', victim: name(last.callerId), winner: name(last.winnerId), penalty: game.rules.assafPenalty };
  return {
    type: 'round',
    roundNumber: last.roundNumber,
    winner: name(last.winnerId),
    bonuses: Object.entries(last.bonusEvents).map(([id, label]) => `${name(id)} ${label}`)
  };
}

/** Speelt een animatie af wanneer het aantal rondes toeneemt (ook bij live meekijken). */
export function useRoundAnimation(game: Game | undefined, state: GameState | null) {
  const [event, setEvent] = useState<ScreenEvent | null>(null);
  const seen = useRef<{ id: string; rounds: number } | null>(null);
  useEffect(() => {
    if (!game || !state) return;
    const prev = seen.current;
    seen.current = { id: game.id, rounds: game.rounds.length };
    if (!prev || prev.id !== game.id || game.rounds.length <= prev.rounds) return;
    const ev = eventForLastRound(game, state);
    if (!ev) return;
    setEvent(ev);
    const t = setTimeout(() => setEvent(null), DURATION[ev.type]);
    return () => clearTimeout(t);
  }, [game, state]);
  return event;
}

const DURATION: Record<ScreenEvent['type'], number> = { round: 2200, assaf: 2600, eliminated: 2800, champion: 4200 };

export function EventAnimation({ event }: { event: ScreenEvent | null }) {
  if (!event) return null;
  const dur = { '--dur': `${DURATION[event.type]}ms` } as React.CSSProperties;

  let kicker = '';
  let title = '';
  let detail = '';
  let tone = 'text-fg';
  switch (event.type) {
    case 'round':
      kicker = `Ronde ${event.roundNumber}`;
      title = `Yaniv: ${event.winner}`;
      detail = event.bonuses.length ? `Bonus ${event.bonuses.join(', ')}` : '';
      break;
    case 'assaf':
      kicker = 'Assaf';
      title = `${event.winner} pakt ${event.victim}`;
      detail = `${event.victim} krijgt ${event.penalty} strafpunten`;
      tone = 'text-accent';
      break;
    case 'eliminated':
      kicker = `Over de ${event.limit}`;
      title = `${event.names.join(' en ')} ${event.names.length > 1 ? 'liggen' : 'ligt'} eruit`;
      tone = 'text-danger';
      break;
    case 'champion':
      kicker = 'Potje afgelopen';
      title = `${event.name} wint`;
      detail = `Eindscore ${event.score}`;
      tone = 'text-accent';
      break;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-4" aria-live="polite" style={dur}>
      <div className="anim-overlay absolute inset-0 bg-overlay" />
      <div className="anim-banner relative w-full max-w-md border border-line bg-bg px-6 pb-5 pt-5">
        <div className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${tone}`}>{kicker}</div>
        <div className="mt-1 text-[34px] font-extrabold leading-[1.05] tracking-[-0.03em]">{title}</div>
        {detail && <div className="mt-2 font-mono text-[13px] text-muted">{detail}</div>}
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-raised">
          <div className={`anim-stripe h-full ${event.type === 'eliminated' ? 'bg-danger' : 'bg-accent'}`} />
        </div>
      </div>
    </div>
  );
}
