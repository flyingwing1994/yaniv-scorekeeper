import { useEffect, useMemo, useState } from 'react';
import { RulesEditor } from '../components/RulesEditor';
import { Avatar, Button, Card, Label, Modal, Page, TopBar } from '../components/ui';
import { BUILT_IN_PRESETS, describeRules, HOUSE_RULES } from '../lib/rules';
import { computeGameState } from '../lib/scoring';
import {
  activePlayers, activePresets, deletePlayer, deletePreset, fetchRemoteGames, getState, PLAYER_COLORS,
  scheduleSync, setPin, upsertPlayer, upsertPreset, useStore
} from '../lib/store';
import type { Game, Player, Rules } from '../lib/types';
import { GameRow } from './HomeScreen';

export function PlayersScreen() {
  const library = useStore(s => s.library);
  const players = activePlayers(library);
  const [editing, setEditing] = useState<Partial<Player> | null>(null);

  return (
    <>
      <TopBar title="Spelers" back="/" right={<Button className="px-3 py-1.5 text-xs" onClick={() => setEditing({ name: '' })}>＋ Speler</Button>} />
      <Page>
        <Card className="space-y-2">
          {players.length === 0 && <p className="text-sm text-slate-400">Nog geen spelers.</p>}
          {players.map(p => (
            <button key={p.id} onClick={() => setEditing(p)} className="flex w-full items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3 text-left">
              <Avatar name={p.name} color={p.color} size={32} />
              <span className="flex-1 font-bold text-white">{p.name}</span>
              <span className="text-slate-500">✎</span>
            </button>
          ))}
        </Card>
        <p className="px-1 text-xs text-slate-500">Spelers worden gedeeld via de server, dus ze staan ook op de andere telefoons. Lopende potjes houden de namen zoals ze bij de start waren.</p>
      </Page>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? 'Speler aanpassen' : 'Nieuwe speler'}>
        {editing && (
          <form
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault();
              if (!editing.name?.trim()) return;
              upsertPlayer({ ...editing, name: editing.name });
              setEditing(null);
            }}
          >
            <input
              autoFocus
              value={editing.name ?? ''}
              maxLength={24}
              onChange={e => setEditing({ ...editing, name: e.target.value })}
              placeholder="Naam"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-indigo-400"
            />
            <div>
              <Label>Kleur</Label>
              <div className="flex flex-wrap gap-2">
                {PLAYER_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Kleur ${c}`}
                    onClick={() => setEditing({ ...editing, color: c })}
                    className={`h-9 w-9 rounded-full border-2 ${editing.color === c ? 'border-white' : 'border-transparent'}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={!editing.name?.trim()}>Opslaan</Button>
            {editing.id && (
              <Button type="button" variant="danger" className="w-full" onClick={() => {
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
      <TopBar title="Regelsets" back="/" right={<Button className="px-3 py-1.5 text-xs" onClick={() => setEditing({ name: '', rules: HOUSE_RULES })}>＋ Regelset</Button>} />
      <Page>
        {[...BUILT_IN_PRESETS, ...custom].map(p => (
          <Card key={p.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-white">{p.name} {p.builtIn && <span className="text-xs font-normal text-slate-500">(standaard)</span>}</h2>
              <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => setEditing({ id: p.builtIn ? undefined : p.id, name: p.builtIn ? `${p.name} (kopie)` : p.name, rules: p.rules })}>
                {p.builtIn ? 'Kopiëren' : 'Bewerken'}
              </Button>
            </div>
            <ul className="space-y-0.5 text-xs text-slate-400">{describeRules(p.rules).map(l => <li key={l}>• {l}</li>)}</ul>
          </Card>
        ))}
      </Page>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? 'Regelset bewerken' : 'Nieuwe regelset'}>
        {editing && (
          <div className="space-y-4">
            <input
              value={editing.name}
              maxLength={40}
              onChange={e => setEditing({ ...editing, name: e.target.value })}
              placeholder="Naam van de regelset"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-indigo-400"
            />
            <RulesEditor rules={editing.rules} onChange={rules => setEditing({ ...editing, rules })} />
            <Button className="w-full" disabled={!editing.name.trim()} onClick={() => { upsertPreset(editing); setEditing(null); }}>Opslaan</Button>
            {editing.id && (
              <Button variant="danger" className="w-full" onClick={() => {
                if (confirm('Regelset verwijderen?')) { deletePreset(editing.id as string); setEditing(null); }
              }}>Verwijderen</Button>
            )}
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
      <TopBar title="Historie & statistieken" back="/" />
      <Page>
        {error && <p className="text-xs text-amber-300">{error}</p>}
        {stats.length > 0 && (
          <Card>
            <Label>Klassement (afgelopen potjes)</Label>
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-full min-w-max text-left text-xs">
                <thead className="text-slate-400">
                  <tr><th className="py-1.5">Speler</th><th className="text-center">Potjes</th><th className="text-center">👑</th><th className="text-center">Win%</th><th className="text-center">🏆 rondes</th><th className="text-center">⚡ geassaft</th><th className="text-center">Gem. eind</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {stats.map(s => (
                    <tr key={s.id}>
                      <td className="py-2"><span className="flex items-center gap-2 font-bold text-white"><Avatar name={s.name} color={s.color} size={20} />{s.name}</span></td>
                      <td className="text-center">{s.played}</td>
                      <td className="text-center font-bold text-amber-300">{s.wins}</td>
                      <td className="text-center">{Math.round((s.wins / s.played) * 100)}%</td>
                      <td className="text-center">{s.roundsWon}</td>
                      <td className="text-center">{s.assafs}</td>
                      <td className="text-center">{Math.round(s.totalScore / s.played)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        <Card className="space-y-2">
          <Label>Potjes</Label>
          {remote === null && !error && <p className="text-sm text-slate-400">Laden…</p>}
          {games.length === 0 && (remote !== null || error) && <p className="text-sm text-slate-400">Nog geen potjes.</p>}
          {games.map(g => <GameRow key={g.id} game={g} editable={Boolean(tokens[g.id])} />)}
        </Card>
      </Page>
    </>
  );
}

export function SettingsScreen() {
  const pin = useStore(s => s.pin);
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
      <TopBar title="Instellingen" back="/" />
      <Page>
        <Card className="space-y-3">
          <Label>Synchronisatie</Label>
          <div className="text-sm text-slate-300">
            Status: <b>{sync.status}</b>{sync.message ? `: ${sync.message}` : ''}
            <br />Wachtend: {pending} · Laatste sync: {sync.lastSync ? new Date(sync.lastSync).toLocaleTimeString('nl-NL') : 'nog niet'}
          </div>
          <Button variant="secondary" className="w-full" onClick={() => scheduleSync(0)}>↻ Nu synchroniseren</Button>
        </Card>

        <Card className="space-y-3">
          <Label>Server-PIN {sync.pinRequired ? '(vereist door server)' : '(niet ingesteld op server)'}</Label>
          <p className="text-xs text-slate-400">Als de server een <code>APP_PIN</code> heeft, is die nodig om te kunnen opslaan. Meekijken kan altijd zonder PIN.</p>
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setPin(pinText.trim()); }}>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pinText}
              onChange={e => setPinText(e.target.value)}
              placeholder="PIN"
              className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-indigo-400"
            />
            <Button type="submit">Opslaan</Button>
          </form>
        </Card>

        <Card className="space-y-3">
          <Label>App &amp; data</Label>
          <p className="text-xs text-slate-400">
            Installeren: open het deelmenu van je browser en kies <b>Zet op beginscherm</b>. De app werkt daarna ook offline; scores worden gesynchroniseerd zodra er weer verbinding is.
          </p>
          <Button variant="secondary" className="w-full" onClick={exportData}>⬇ Back-up downloaden (JSON)</Button>
        </Card>
      </Page>
    </>
  );
}
