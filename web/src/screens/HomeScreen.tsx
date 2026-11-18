import { useMemo, useState } from 'react';
import { Avatar, Button, Card, Label, Page, TopBar } from '../components/ui';
import { navigate } from '../lib/router';
import { computeGameState } from '../lib/scoring';
import { useStore } from '../lib/store';
import type { Game } from '../lib/types';

export function GameRow({ game, editable }: { game: Game; editable: boolean }) {
  const state = useMemo(() => computeGameState(game), [game]);
  const top = state.standings[0];
  return (
    <button onClick={() => navigate(`/g/${game.id}`)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3 text-left">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <span className="font-mono tracking-wider text-indigo-300">{game.id}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] ${game.status === 'finished' ? 'bg-slate-800 text-slate-400' : 'bg-emerald-600/30 text-emerald-300'}`}>
            {game.status === 'finished' ? 'Afgelopen' : `Bezig · R${game.rounds.length + 1}`}
          </span>
          {!editable && <span className="text-[10px] text-sky-300">👀</span>}
        </div>
        <div className="truncate text-xs text-slate-400">{game.players.map(p => p.name).join(', ')}</div>
      </div>
      {top && game.rounds.length > 0 && (
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-slate-300">
          {game.status === 'finished' ? '👑' : '🥇'} <Avatar name={top.name} color={top.color} size={20} /> {top.score}
        </div>
      )}
    </button>
  );
}

export function HomeScreen() {
  const games = useStore(s => s.games);
  const tokens = useStore(s => s.tokens);
  const currentId = useStore(s => s.currentGameId);
  const [code, setCode] = useState('');
  const current = currentId ? games[currentId] : undefined;
  const recent = Object.values(games)
    .filter(g => g.id !== current?.id || current?.status === 'finished')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5);

  return (
    <>
      <TopBar title="🃏 Yaniv Scorekeeper" />
      <Page>
        {current && current.status === 'active' && (
          <Card className="border-indigo-500/50 bg-indigo-950/30">
            <Label>Lopend potje</Label>
            <GameRow game={current} editable={Boolean(tokens[current.id])} />
            <Button className="mt-3 w-full py-3" onClick={() => navigate(`/g/${current.id}`)}>▶ Verder spelen</Button>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button className="bg-gradient-to-r from-indigo-600 to-purple-600 py-4 text-base" onClick={() => navigate('/new')}>
            ＋ Nieuw potje
          </Button>
          <form
            className="flex gap-2"
            onSubmit={e => {
              e.preventDefault();
              const c = code.trim().toUpperCase();
              if (/^[A-Z0-9]{6}$/.test(c)) navigate(`/g/${c}`);
            }}
          >
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder="CODE"
              aria-label="Spelcode om mee te kijken"
              autoCapitalize="characters"
              className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-center font-mono text-lg font-bold tracking-[0.3em] text-white outline-none focus:border-indigo-400"
            />
            <Button type="submit" variant="secondary" disabled={code.length !== 6}>👀 Meekijken</Button>
          </form>
        </div>

        {recent.length > 0 && (
          <Card className="space-y-2">
            <Label>Recent op dit toestel</Label>
            {recent.map(g => <GameRow key={g.id} game={g} editable={Boolean(tokens[g.id])} />)}
          </Card>
        )}

        <div className="grid grid-cols-2 gap-3">
          {[
            ['/players', '👥', 'Spelers'],
            ['/presets', '📜', 'Regelsets'],
            ['/history', '📊', 'Historie & stats'],
            ['/settings', '⚙️', 'Instellingen']
          ].map(([to, icon, label]) => (
            <button key={to} onClick={() => navigate(to)} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left">
              <div className="text-2xl">{icon}</div>
              <div className="mt-1 text-sm font-bold text-white">{label}</div>
            </button>
          ))}
        </div>
      </Page>
    </>
  );
}
