import { useState } from 'react';
import { PresetPicker, RulesEditor } from '../components/RulesEditor';
import { Button, Icon, Page, Section, Swatch, TextInput, TopBar } from '../components/ui';
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
      <TopBar kicker="Nieuw" title="Potje opzetten" back="/" />
      <Page>
        <Section title="Spelers" aside={`${selected.length} gekozen`}>
          {players.length === 0 && <p className="py-3 text-sm text-muted">Nog geen spelers. Voeg ze hieronder toe.</p>}
          <div className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3">
            {players.map(p => {
              const pos = selected.indexOf(p.id);
              const active = pos >= 0;
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  aria-pressed={active}
                  className={`flex min-h-12 items-center justify-between gap-2 px-3 text-left text-[15px] font-semibold ${active ? 'bg-fg text-bg' : 'bg-bg text-muted'}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Swatch color={p.color} size={8} />
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className="font-mono text-xs">{active ? String(pos + 1).padStart(2, '0') : ''}</span>
                </button>
              );
            })}
          </div>
          <form className="mt-3 flex" onSubmit={e => { e.preventDefault(); addPlayer(); }}>
            <TextInput value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nieuwe speler" maxLength={24} className="flex-1 border-r-0" />
            <Button type="submit" variant="secondary" disabled={!newName.trim()} className="disabled:text-faint"><Icon name="plus" size={16} /> Toevoegen</Button>
          </form>
          <p className="mt-2 text-xs text-muted">De volgorde waarin je kiest is de speelvolgorde.</p>
        </Section>

        <Section title="Regels">
          <PresetPicker rules={rules} onPick={setRules} />
          <ul className="mt-3">
            {describeRules(rules).map(l => <li key={l} className="border-b border-line-soft py-2 text-[13px] text-muted">{l}</li>)}
          </ul>
          <Button variant="secondary" className="mt-3 w-full" onClick={() => setShowRules(v => !v)}>
            {showRules ? 'Regels inklappen' : 'Regels aanpassen'}
          </Button>
          {showRules && <RulesEditor rules={rules} onChange={setRules} />}
        </Section>

        <Button
          className="mt-8 w-full py-4 text-[15px]"
          disabled={selected.length < 2}
          onClick={() => navigate(`/g/${createGame(selected, rules)}`, true)}
        >
          {selected.length < 2 ? 'Kies minstens 2 spelers' : `Start potje met ${selected.length}`}
        </Button>
      </Page>
    </>
  );
}
