import { useState } from 'react';
import { BUILT_IN_PRESETS, normalizeRules, rulesEqual } from '../lib/rules';
import { activePresets, upsertPreset, useStore } from '../lib/store';
import type { RulePreset, Rules } from '../lib/types';
import { Button, Label, NumberInput, Segmented, Toggle } from './ui';

function NumberRow({
  label, hint, value, onChange, presets, disabled, max
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
  presets?: { value: number; label: string }[];
  disabled?: boolean;
  max?: number;
}) {
  const [text, setText] = useState<'' | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-slate-200">{label}</div>
          {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
        </div>
        <NumberInput
          ariaLabel={label}
          className="w-24"
          disabled={disabled}
          max={max}
          value={text === '' ? '' : String(value)}
          onChange={v => {
            setText(v === '' ? '' : null);
            if (v !== '') onChange(Number(v));
          }}
        />
      </div>
      {presets && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map(p => (
            <button
              key={p.value}
              type="button"
              disabled={disabled}
              onClick={() => { setText(null); onChange(p.value); }}
              className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${value === p.value ? 'border-indigo-400 bg-indigo-600 text-white' : 'border-slate-800 bg-slate-950 text-slate-400'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RulesEditor({ rules, onChange, disabled }: { rules: Rules; onChange: (r: Rules) => void; disabled?: boolean }) {
  const set = <K extends keyof Rules>(k: K, v: Rules[K]) => onChange(normalizeRules({ ...rules, [k]: v }));

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Label>Afvallen &amp; einde</Label>
        <NumberRow
          label="Afvalgrens"
          hint="0 = geen grens, potje handmatig beëindigen"
          value={rules.scoreLimit}
          disabled={disabled}
          onChange={v => set('scoreLimit', v)}
          presets={[100, 150, 200, 0].map(v => ({ value: v, label: v ? `${v}` : 'Geen' }))}
        />
        {rules.scoreLimit > 0 && (
          <>
            <Segmented
              disabled={disabled}
              value={rules.eliminationBoundary}
              onChange={v => set('eliminationBoundary', v)}
              options={[
                { value: 'over', label: `Af boven ${rules.scoreLimit}` },
                { value: 'at_or_over', label: `Af vanaf ${rules.scoreLimit}` }
              ]}
            />
            <Segmented
              disabled={disabled}
              value={rules.gameEndMode}
              onChange={v => set('gameEndMode', v)}
              options={[
                { value: 'last_standing', label: 'Laatste overlevende wint' },
                { value: 'first_out', label: 'Stop bij eerste afvaller' }
              ]}
            />
          </>
        )}
      </div>

      <div className="space-y-3">
        <Label>Yaniv roepen</Label>
        <NumberRow
          label="Maximaal in hand"
          hint="Yaniv mag bij dit aantal punten of minder"
          value={rules.yanivCallLimit}
          disabled={disabled}
          onChange={v => set('yanivCallLimit', v)}
          presets={[5, 7, 10].map(v => ({ value: v, label: `≤ ${v}` }))}
        />
        <Segmented
          disabled={disabled}
          value={rules.yanivLimitMode}
          onChange={v => set('yanivLimitMode', v)}
          options={[
            { value: 'off', label: 'Niet controleren' },
            { value: 'warn', label: 'Waarschuwen' },
            { value: 'block', label: 'Blokkeren' }
          ]}
        />
      </div>

      <div className="space-y-3">
        <Label>Bonus bij veelvoud</Label>
        <Toggle disabled={disabled} checked={rules.halvingEnabled} onChange={v => set('halvingEnabled', v)} label="Bonus als je score precies op een veelvoud uitkomt" />
        {rules.halvingEnabled && (
          <>
            <Segmented
              disabled={disabled}
              value={rules.halvingType}
              onChange={v => set('halvingType', v)}
              options={[
                { value: 'half', label: 'Halveren ÷2' },
                { value: 'subtract50', label: '50 aftrekken' }
              ]}
            />
            <NumberRow
              label="Veelvoud van"
              value={rules.halvingEvery}
              disabled={disabled}
              onChange={v => set('halvingEvery', v)}
              presets={[50, 100].map(v => ({ value: v, label: `${v}` }))}
            />
          </>
        )}
      </div>

      <div className="space-y-3">
        <Label>Assaf</Label>
        <NumberRow
          label="Strafpunten Yaniv-roeper"
          value={rules.assafPenalty}
          disabled={disabled}
          onChange={v => set('assafPenalty', v)}
          presets={[20, 25, 30].map(v => ({ value: v, label: `+${v}` }))}
        />
        <Segmented
          disabled={disabled}
          value={rules.assafWinnerGetsHandPoints}
          onChange={v => set('assafWinnerGetsHandPoints', v)}
          options={[
            { value: false, label: 'Assaf-roeper: 0 pt (officieel)' },
            { value: true, label: 'Assaf-roeper: eigen hand' }
          ]}
        />
      </div>

      <div className="space-y-3">
        <Label>Invoercontrole</Label>
        <NumberRow
          label="Max. punten per hand"
          hint="Hogere invoer wordt als tikfout geweigerd"
          value={rules.maxHandPoints}
          disabled={disabled}
          onChange={v => set('maxHandPoints', v)}
        />
      </div>
    </div>
  );
}

/** Kies een regelset of sla de huidige regels op als nieuwe regelset. */
export function PresetPicker({ rules, onPick }: { rules: Rules; onPick: (r: Rules) => void }) {
  const library = useStore(s => s.library);
  const presets: RulePreset[] = [...BUILT_IN_PRESETS, ...activePresets(library)];
  const match = presets.find(p => rulesEqual(normalizeRules(p.rules), rules));
  const [naming, setNaming] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {presets.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(normalizeRules(p.rules))}
            className={`rounded-xl border px-3 py-1.5 text-xs font-bold ${match?.id === p.id ? 'border-emerald-400 bg-emerald-600/25 text-emerald-200' : 'border-slate-800 bg-slate-950 text-slate-300'}`}
          >
            {match?.id === p.id ? '✓ ' : ''}{p.name}
          </button>
        ))}
        {!match && naming === null && (
          <button type="button" onClick={() => setNaming('')} className="rounded-xl border border-dashed border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-300">
            + Opslaan als regelset
          </button>
        )}
      </div>
      {naming !== null && (
        <form
          className="flex gap-2"
          onSubmit={e => {
            e.preventDefault();
            if (!naming.trim()) return;
            upsertPreset({ name: naming, rules });
            setNaming(null);
          }}
        >
          <input
            autoFocus
            value={naming}
            onChange={e => setNaming(e.target.value)}
            placeholder="Naam, bijv. Vakantieregels"
            maxLength={40}
            className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400"
          />
          <Button type="submit" disabled={!naming.trim()}>Opslaan</Button>
          <Button type="button" variant="ghost" onClick={() => setNaming(null)}>✕</Button>
        </form>
      )}
    </div>
  );
}
