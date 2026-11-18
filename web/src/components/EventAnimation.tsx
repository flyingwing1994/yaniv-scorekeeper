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
    const t = setTimeout(() => setEvent(null), ev.type === 'champion' ? 4200 : 2700);
    return () => clearTimeout(t);
  }, [game, state]);
  return event;
}

const SYMBOLS: Record<ScreenEvent['type'], string[]> = {
  round: ['🎉', '🃏', '✨', '💚'],
  assaf: ['⚡', '🔥', '💥', '😱'],
  eliminated: ['💀', '🪦', '🔥', '❌'],
  champion: ['👑', '🏆', '🎉', '⭐']
};

export function EventAnimation({ event }: { event: ScreenEvent | null }) {
  if (!event) return null;
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const particles = reduced ? [] : Array.from({ length: 28 }, (_, i) => ({
    id: i,
    left: `${(i * 3.7) % 100}%`,
    delay: `${(i % 7) * 0.08}s`,
    duration: `${1.6 + (i % 5) * 0.25}s`,
    size: 16 + (i % 4) * 6
  }));

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden px-4" aria-live="polite">
      {event.type === 'assaf' && <div className="anim-flash absolute inset-0 bg-amber-500" />}
      {event.type === 'eliminated' && <div className="anim-flash absolute inset-0 bg-rose-600" />}
      {event.type === 'champion' && <div className="anim-flash absolute inset-0 bg-gradient-to-t from-amber-500/30 via-transparent to-amber-400/20" />}
      {event.type === 'round' && <div className="anim-flash absolute inset-0 bg-emerald-500/20" />}

      {particles.map(p => (
        <div
          key={p.id}
          className="absolute select-none"
          style={{ left: p.left, top: '-40px', fontSize: p.size, animation: `particleDrop ${p.duration} ease-in ${p.delay} forwards` }}
        >
          {SYMBOLS[event.type][p.id % 4]}
        </div>
      ))}

      {event.type === 'round' && (
        <div className="anim-banner-fly flex flex-col items-center rounded-3xl border-2 border-emerald-400 bg-emerald-950/90 px-8 py-5 text-center shadow-[0_0_60px_rgba(16,185,129,0.6)] backdrop-blur-md">
          <div className="mb-1 animate-bounce text-4xl">🏆</div>
          <span className="text-xs font-black uppercase tracking-widest text-emerald-300">Ronde {event.roundNumber}</span>
          <div className="text-3xl font-black tracking-tight text-white">YANIV VOOR {event.winner.toUpperCase()}!</div>
          {event.bonuses.length > 0 && (
            <div className="mt-2 rounded-full border border-indigo-400 bg-indigo-500/30 px-3 py-1 text-xs font-bold text-indigo-200">
              ✨ Bonus: {event.bonuses.join(', ')}
            </div>
          )}
        </div>
      )}

      {event.type === 'assaf' && (
        <div className="anim-banner-fly anim-shake flex flex-col items-center rounded-3xl border-2 border-amber-400 bg-amber-950/95 px-8 py-6 text-center shadow-[0_0_70px_rgba(245,158,11,0.75)] backdrop-blur-md">
          <div className="mb-1 animate-bounce text-5xl">⚡</div>
          <div className="text-4xl font-black tracking-tight text-amber-300">ASSAF!</div>
          <div className="mt-1 text-base font-extrabold text-white">{event.winner} pakt {event.victim}</div>
          <div className="mt-1 text-xs font-bold text-rose-300">{event.victim} krijgt +{event.penalty} strafpunten</div>
        </div>
      )}

      {event.type === 'eliminated' && (
        <div className="anim-banner-fly anim-shake flex flex-col items-center rounded-3xl border-2 border-rose-500 bg-rose-950/95 px-8 py-6 text-center shadow-[0_0_80px_rgba(244,63,94,0.8)] backdrop-blur-md">
          <div className="mb-1 animate-pulse text-5xl">💀</div>
          <span className="text-xs font-black uppercase tracking-widest text-rose-300">Over de {event.limit} punten</span>
          <div className="mt-0.5 text-3xl font-black text-white">
            {event.names.join(' & ').toUpperCase()} {event.names.length > 1 ? 'ZIJN' : 'IS'} AF! 💀
          </div>
        </div>
      )}

      {event.type === 'champion' && (
        <div className="anim-banner-long flex flex-col items-center rounded-3xl border-2 border-amber-300 bg-gradient-to-b from-amber-900/95 to-slate-950/95 px-10 py-7 text-center shadow-[0_0_90px_rgba(251,191,36,0.85)] backdrop-blur-md">
          <div className="mb-2 animate-bounce text-6xl">👑</div>
          <span className="text-xs font-black uppercase tracking-widest text-amber-300">Potje afgelopen</span>
          <div className="mt-1 text-4xl font-black text-white">{event.name} WINT! 🏆</div>
          <div className="mt-1 text-sm font-bold text-amber-200">Eindscore: {event.score} punten</div>
        </div>
      )}
    </div>
  );
}
