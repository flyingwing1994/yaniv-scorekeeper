import { useEffect, useMemo, useState } from 'react';
import { RulesEditor } from '../components/RulesEditor';
import { Button, Icon, IconButton, Label, Modal, Page, Row, Section, Segmented, Swatch, TextInput, TopBar } from '../components/ui';
import { BUILT_IN_PRESETS, describeRules, HOUSE_RULES } from '../lib/rules';
import { computeGameState } from '../lib/scoring';
import {
  activePlayers, activePresets, deletePlayer, deletePreset, fetchRemoteGames, getState, PLAYER_COLORS,
  scheduleSync, setPin, setTheme, upsertPlayer, upsertPreset, useStore, type ThemePref
} from '../lib/store';
import type { Game, Player, Rules } from '../lib/types';
import { GameRow } from './HomeScreen';

export function PlayersScreen() {
  const library = useStore(s => s.library);
  const players = activePlayers(library);
  const [editing, setEditing] = useState<Partial<Player> | null>(null);

  return (
    <>
      <TopBar kicker="Beheer" title="Spelers" back="/" right={<IconButton icon="plus" label="Speler toevoegen" onClick={() => setEditing({ name: '' })} />} />
      <Page>
        <Section title={`${players.length} spelers`}>
          {players.length === 0 && <p className="py-3 text-sm text-muted">Nog geen spelers.</p>}
          {players.map(p => (
            <Row key={p.id} onClick={() => setEditing(p)}>
              <Swatch color={p.color} size={12} />
              <span className="flex-1 text-[15px] font-semibold">{p.name}</span>
              <Icon name="edit" size={16} className="text-faint" />
            </Row>
          ))}
          <p className="mt-3 text-xs text-muted">Spelers worden via de server gedeeld met de andere telefoons. Lopende potjes houden de namen zoals ze bij de start waren.</p>
        </Section>
      </Page>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? 'Speler aanpassen' : 'Nieuwe speler'}>
        {editing && (
          <form
            className="grid gap-4"
            onSubmit={e => {
              e.preventDefault();
              if (!editing.name?.trim()) return;
              upsertPlayer({ ...editing, name: editing.name });
              setEditing(null);
            }}
          >
            <TextInput autoFocus value={editing.name ?? ''} maxLength={24} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Naam" />
            <div>
              <div className="pb-2"><Label>Kleur</Label></div>
              <div className="grid grid-cols-6 gap-2">
                {PLAYER_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Kleur ${c}`}
                    aria-pressed={editing.color === c}
                    onClick={() => setEditing({ ...editing, color: c })}
                    className={`h-10 border-2 ${editing.color === c ? 'border-fg' : 'border-transparent'}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <Button type="submit" disabled={!editing.name?.trim()}>Opslaan</Button>
            {editing.id && (
              <Button type="button" variant="danger" onClick={() => {
                if (confirm(`${editing.name} verwijderen uit de spelerslijst?`)) { deletePlayer(editing.id as string); setEditing(null); }
              }}>Verwijderen</Button>
            )}
          </form>
        )}
      </Modal>
    </>
  );
}

export function PresetsScreen() {
  const library = useStore(s => s.library);
  const custom = activePresets(library);
  const [editing, setEditing] = useState<{ id?: string; name: string; rules: Rules } | null>(null);

  return (
    <>
      <TopBar kicker="Beheer" title="Regelsets" back="/" right={<IconButton icon="plus" label="Regelset toevoegen" onClick={() => setEditing({ name: '', rules: HOUSE_RULES })} />} />
      <Page>
        {[...BUILT_IN_PRESETS, ...custom].map(p => (
          <Section key={p.id} title={p.builtIn ? 'Standaard' : 'Eigen set'}>
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h2 className="text-xl font-extrabold tracking-tight">{p.name}</h2>
              <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => setEditing({ id: p.builtIn ? undefined : p.id, name: p.builtIn ? `${p.name} (kopie)` : p.name, rules: p.rules })}>
                {p.builtIn ? 'Kopiëren' : 'Bewerken'}
              </Button>
            </div>
            <ul>{describeRules(p.rules).map(l => <li key={l} className="border-b border-line-soft py-2 text-[13px] text-muted">{l}</li>)}</ul>
          </Section>
        ))}
      </Page>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? 'Regelset bewerken' : 'Nieuwe regelset'}>
        {editing && (
          <div>
            <TextInput value={editing.name} maxLength={40} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Naam van de regelset" className="w-full" />
            <RulesEditor rules={editing.rules} onChange={rules => setEditing({ ...editing, rules })} />
            <div className="mt-6 grid gap-2">
              <Button disabled={!editing.name.trim()} onClick={() => { upsertPreset(editing); setEditing(null); }}>Opslaan</Button>
              {editing.id && (
                <Button variant="danger" onClick={() => {
                  if (confirm('Regelset verwijderen?')) { deletePreset(editing.id as string); setEditing(null); }
                }}>Verwijderen</Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

interface PlayerStats { id: string; name: string; color: string; played: number; wins: number; roundsWon: number; assafs: number; totalScore: number }

export function HistoryScreen() {
  const localGames = useStore(s => s.games);
  const tokens = useStore(s => s.tokens);
  const [remote, setRemote] = useState<Game[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRemoteGames().then(setRemote).catch(() => setError('Server niet bereikbaar: alleen potjes op dit toestel.'));
  }, []);

  const games = useMemo(() => {
    const map = new Map<string, Game>();
    for (const g of remote ?? []) map.set(g.id, g);
    for (const g of Object.values(localGames)) {
      const r = map.get(g.id);
      if (!r || g.version >= r.version) map.set(g.id, g);
    }
    return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [remote, localGames]);

  const stats = useMemo(() => {
    const out = new Map<string, PlayerStats>();
    for (const g of games) {
      if (g.status !== 'finished' || g.rounds.length === 0) continue;
      const s = computeGameState(g);
      for (const st of s.standings) {
        const cur = out.get(st.id) ?? { id: st.id, name: st.name, color: st.color, played: 0, wins: 0, roundsWon: 0, assafs: 0, totalScore: 0 };
        cur.played++;
        cur.roundsWon += st.roundsWon;
        cur.assafs += st.assafsSuffered;
        cur.totalScore += st.score;
        if (s.champion?.id === st.id) cur.wins++;
        out.set(st.id, cur);
      }
    }
    return [...out.values()].sort((a, b) => b.wins - a.wins || b.wins / b.played - a.wins / a.played);
  }, [games]);

  return (
    <>
      <TopBar kicker="Beheer" title="Historie" back="/" />
      <Page>
        {error && <p className="mt-4 border-l-2 border-accent pl-3 text-[13px]">{error}</p>}
        {stats.length > 0 && (
          <Section title="Klassement" aside="afgelopen potjes">
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-full min-w-max text-right">
                <thead>
                  <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                    <th className="py-2 text-left">Speler</th><th className="px-2">Potjes</th><th className="px-2">Winst</th><th className="px-2">Win %</th><th className="px-2">Rondes</th><th className="px-2">Assaf</th><th className="pl-2">Gem.</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s, i) => (
                    <tr key={s.id} className="border-b border-line-soft text-[15px]">
                      <td className="py-2.5 text-left"><span className="flex items-center gap-2 font-semibold"><Swatch color={s.color} size={8} />{s.name}</span></td>
                      <td className="px-2 font-mono text-sm text-muted">{s.played}</td>
                      <td className={`px-2 font-extrabold ${i === 0 ? 'text-accent' : ''}`}>{s.wins}</td>
                      <td className="px-2 font-mono text-sm">{Math.round((s.wins / s.played) * 100)}</td>
                      <td className="px-2 font-mono text-sm text-muted">{s.roundsWon}</td>
                      <td className="px-2 font-mono text-sm text-muted">{s.assafs}</td>
                      <td className="pl-2 font-mono text-sm text-muted">{Math.round(s.totalScore / s.played)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}
        <Section title="Potjes" aside={games.length ? `${games.length}` : undefined}>
          {remote === null && !error && <p className="py-3 text-sm text-muted">Laden…</p>}
          {games.length === 0 && (remote !== null || error) && <p className="py-3 text-sm text-muted">Nog geen potjes.</p>}
          {games.map(g => <GameRow key={g.id} game={g} editable={Boolean(tokens[g.id])} />)}
        </Section>
      </Page>
    </>
  );
}

const STATUS_LABEL = { idle: 'in orde', syncing: 'bezig', offline: 'offline', error: 'fout', pin: 'PIN nodig' } as const;

export function SettingsScreen() {
  const pin = useStore(s => s.pin);
  const theme = useStore(s => s.theme);
  const sync = useStore(s => s.sync);
  const pending = useStore(s => s.dirtyGames.length + (s.dirtyLibrary ? 1 : 0));
  const [pinText, setPinText] = useState(pin);

  const exportData = () => {
    const { sync: _s, tokens: _t, pin: _p, ...data } = getState();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `yaniv-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <TopBar kicker="Beheer" title="Instellingen" back="/" />
      <Page>
        <Section title="Thema">
          <Segmented<ThemePref>
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: 'Systeem' },
              { value: 'light', label: 'Dag' },
              { value: 'dark', label: 'Nacht' }
            ]}
          />
          <p className="mt-2 text-xs text-muted">Bij Systeem wisselt de app mee met de dag/nachtstand van je telefoon.</p>
        </Section>

        <Section title="Synchronisatie">
          <dl className="font-mono text-[13px]">
            {[
              ['Status', STATUS_LABEL[sync.status]],
              ['Wachtend', String(pending)],
              ['Laatste sync', sync.lastSync ? new Date(sync.lastSync).toLocaleTimeString('nl-NL') : 'nog niet']
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-line-soft py-2.5"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
          {sync.message && <p className="mt-2 text-xs text-muted">{sync.message}</p>}
          <Button variant="secondary" className="mt-3 w-full" onClick={() => scheduleSync(0)}>Nu synchroniseren</Button>
        </Section>

        <Section title="Server-PIN" aside={sync.pinRequired ? 'vereist' : 'niet ingesteld'}>
          <p className="mb-3 text-xs text-muted">Als de server een <code className="font-mono">APP_PIN</code> heeft, is die nodig om op te slaan. Meekijken kan altijd zonder PIN.</p>
          <form className="flex" onSubmit={e => { e.preventDefault(); setPin(pinText.trim()); }}>
            <TextInput type="password" inputMode="numeric" autoComplete="off" value={pinText} onChange={e => setPinText(e.target.value)} placeholder="PIN" className="flex-1 border-r-0" />
            <Button type="submit">Bewaar PIN</Button>
          </form>
        </Section>

        <Section title="App en data">
          <p className="mb-3 text-xs text-muted">
            Installeren: kies in het deelmenu van je browser <b className="text-fg">Zet op beginscherm</b>. De app werkt daarna ook offline en synchroniseert zodra er weer verbinding is.
          </p>
          <Button variant="secondary" className="w-full" onClick={exportData}>Back-up downloaden (JSON)</Button>
        </Section>
      </Page>
    </>
  );
}
