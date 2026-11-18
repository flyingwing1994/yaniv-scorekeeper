import { useMemo, useState } from 'react';
import { Button, Icon, Page, Row, Section, TextInput, TopBar } from '../components/ui';
import { navigate } from '../lib/router';
import { computeGameState } from '../lib/scoring';
import { useStore } from '../lib/store';
import type { Game } from '../lib/types';

export function GameRow({ game, editable }: { game: Game; editable: boolean }) {
  const state = useMemo(() => computeGameState(game), [game]);
  const top = state.standings[0];
  const finished = game.status === 'finished';
  return (
    <Row onClick={() => navigate(`/g/${game.id}`)}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="font-mono font-semibold text-accent">{game.id}</span>
          <span className="font-mono text-xs text-muted">{finished ? 'afgelopen' : `ronde ${game.rounds.length + 1}`}</span>
          {!editable && <span className="font-mono text-xs text-faint">meekijken</span>}
        </div>
        <div className="truncate text-[15px] font-semibold">{game.players.map(p => p.name).join(', ')}</div>
      </div>
      {top && game.rounds.length > 0 && (
        <div className="shrink-0 text-right">
          <div className="text-[11px] text-muted">{finished ? 'winnaar' : 'leider'}</div>
          <div className="text-sm font-bold">{top.name} <span className="font-mono text-muted">{top.score}</span></div>
        </div>
      )}
      <Icon name="chevron" size={16} className="shrink-0 text-faint" />
    </Row>
  );
}

export function HomeScreen() {
  const games = useStore(s => s.games);
  const tokens = useStore(s => s.tokens);
  const currentId = useStore(s => s.currentGameId);
  const [code, setCode] = useState('');
  const current = currentId ? games[currentId] : undefined;
  const ongoing = current?.status === 'active' ? current : undefined;
  const recent = Object.values(games)
    .filter(g => g.id !== ongoing?.id)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5);

  return (
    <>
      <TopBar kicker="Scorekeeper" title="Yaniv" />
      <Page>
        {ongoing && (
          <Section title="Lopend potje">
            <GameRow game={ongoing} editable={Boolean(tokens[ongoing.id])} />
            <Button className="mt-3 w-full py-4" onClick={() => navigate(`/g/${ongoing.id}`)}>Verder spelen</Button>
          </Section>
        )}

        <Section title="Spelen">
          <div className="grid gap-3">
            <Button variant={ongoing ? 'secondary' : 'primary'} className="w-full py-4" onClick={() => navigate('/new')}>
              <Icon name="plus" size={18} /> Nieuw potje
            </Button>
            <form
              className="flex"
              onSubmit={e => {
                e.preventDefault();
                const c = code.trim().toUpperCase();
                if (/^[A-Z0-9]{6}$/.test(c)) navigate(`/g/${c}`);
              }}
            >
              <TextInput
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="SPELCODE"
                aria-label="Spelcode om mee te kijken"
                autoCapitalize="characters"
                className="flex-1 border-r-0 text-center font-mono text-lg tracking-[0.3em]"
              />
              <Button type="submit" variant="secondary" disabled={code.length !== 6} className="disabled:text-faint">Meekijken</Button>
            </form>
          </div>
        </Section>

        {recent.length > 0 && (
          <Section title="Recent op dit toestel" aside={<button onClick={() => navigate('/history')} className="uppercase">Alles</button>}>
            {recent.map(g => <GameRow key={g.id} game={g} editable={Boolean(tokens[g.id])} />)}
          </Section>
        )}

        <Section title="Beheer">
          {[
            ['/players', 'Spelers', 'Namen en kleuren'],
            ['/presets', 'Regelsets', 'Thuisregels, officieel en eigen sets'],
            ['/history', 'Historie', 'Alle potjes en het klassement'],
            ['/settings', 'Instellingen', 'Thema, PIN, synchronisatie']
          ].map(([to, label, sub]) => (
            <Row key={to} onClick={() => navigate(to)}>
              <div className="flex-1">
                <div className="text-[15px] font-semibold">{label}</div>
                <div className="text-xs text-muted">{sub}</div>
              </div>
              <Icon name="chevron" size={16} className="text-faint" />
            </Row>
          ))}
        </Section>
      </Page>
    </>
  );
}
