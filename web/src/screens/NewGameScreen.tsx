import { useState } from 'react';
import { PresetPicker, RulesEditor } from '../components/RulesEditor';
import { Avatar, Button, Card, Label, Page, TopBar } from '../components/ui';
import { describeRules } from '../lib/rules';
import { navigate } from '../lib/router';
import { activePlayers, createGame, upsertPlayer, useStore } from '../lib/store';
import type { Rules } from '../lib/types';

export function NewGameScreen() {
  const library = useStore(s => s.library);
  const lastRules = useStore(s => s.lastRules);
  const lastPlayerIds = useStore(s => s.lastPlayerIds);
  const players = activePlayers(library);
  const [selected, setSelected] = useState<string[]>(() => lastPlayerIds.filter(id => players.some(p => p.id === id)));
  const [rules, setRules] = useState<Rules>(lastRules);
  const [showRules, setShowRules] = useState(false);
  const [newName, setNewName] = useState('');

  const toggle = (id: string) => setSelected(sel => (sel.includes(id) ? sel.filter(i => i !== id) : [...sel, id]));
  const addPlayer = () => {
    const name = newName.trim();
    if (!name) return;
    const existing = players.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!selected.includes(existing.id)) toggle(existing.id);
    } else {
      const id = upsertPlayer({ name });
      setSelected(sel => [...sel, id]);
    }
    setNewName('');
  };

  return (
    <>
      <TopBar title="Nieuw potje" back="/" />
      <Page>
        <Card className="space-y-3">
          <Label>1 · Spelers ({selected.length}) · volgorde = speelvolgorde</Label>
          {players.length === 0 && <p className="text-sm text-slate-400">Nog geen spelers. Voeg ze hieronder toe.</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {players.map(p => {
              const pos = selected.indexOf(p.id);
              const active = pos >= 0;
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className={`flex items-center justify-between gap-2 rounded-2xl border px-3 py-2.5 text-sm font-bold ${
                    active ? 'border-transparent text-white' : 'border-slate-800 bg-slate-950 text-slate-400'
                  }`}
                  style={active ? { background: `linear-gradient(90deg, ${p.color}, ${p.color}aa)` } : undefined}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {!active && <Avatar name={p.name} color={p.color} size={22} />}
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className="shrink-0">{active ? pos + 1 : '+'}</span>
                </button>
              );
            })}
          </div>
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); addPlayer(); }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nieuwe speler"
              maxLength={24}
              className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400"
            />
            <Button type="submit" variant="secondary" disabled={!newName.trim()}>＋ Toevoegen</Button>
          </form>
        </Card>

        <Card className="space-y-3">
          <Label>2 · Regels</Label>
          <PresetPicker rules={rules} onPick={setRules} />
          <ul className="space-y-1 text-xs text-slate-400">
            {describeRules(rules).map(l => <li key={l}>• {l}</li>)}
          </ul>
          <Button variant="secondary" className="w-full" onClick={() => setShowRules(v => !v)}>
            {showRules ? 'Regels inklappen' : '⚙️ Regels aanpassen'}
          </Button>
          {showRules && <RulesEditor rules={rules} onChange={setRules} />}
        </Card>

        <Button
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 py-4 text-base"
          disabled={selected.length < 2}
          onClick={() => navigate(`/g/${createGame(selected, rules)}`, true)}
        >
          {selected.length < 2 ? 'Kies minstens 2 spelers' : `▶ Start potje (${selected.length} spelers)`}
        </Button>
      </Page>
    </>
  );
}
