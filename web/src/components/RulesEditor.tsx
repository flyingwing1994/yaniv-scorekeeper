import { useState } from 'react';
import { BUILT_IN_PRESETS, normalizeRules, rulesEqual } from '../lib/rules';
import { activePresets, upsertPreset, useStore } from '../lib/store';
import type { RulePreset, Rules } from '../lib/types';
import { Button, Label, NumberInput, Segmented, TextInput, Toggle } from './ui';

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
  const [empty, setEmpty] = useState(false);
  return (
    <div className="border-b border-line-soft py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold">{label}</div>
          {hint && <div className="text-xs text-muted">{hint}</div>}
        </div>
        <NumberInput
          ariaLabel={label}
          className="w-24"
          disabled={disabled}
          max={max}
          value={empty ? '' : String(value)}
          onChange={v => {
            setEmpty(v === '');
            if (v !== '') onChange(Number(v));
          }}
        />
      </div>
      {presets && (
        <div className="mt-2 flex gap-px">
          {presets.map(p => (
            <button
              key={p.value}
              type="button"
              disabled={disabled}
              onClick={() => { setEmpty(false); onChange(p.value); }}
              className={`border px-3 py-1.5 font-mono text-xs ${value === p.value ? 'border-fg bg-fg text-bg' : 'border-line text-muted'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-5">
      <div className="border-b border-line pb-2"><Label>{title}</Label></div>
      <div className="space-y-3 pt-1">{children}</div>
    </div>
  );
}

export function RulesEditor({ rules, onChange, disabled }: { rules: Rules; onChange: (r: Rules) => void; disabled?: boolean }) {
  const set = <K extends keyof Rules>(k: K, v: Rules[K]) => onChange(normalizeRules({ ...rules, [k]: v }));

  return (
    <div>
      <Group title="Afvallen en einde">
        <NumberRow
          label="Afvalgrens"
          hint="0 = geen grens, potje handmatig beëindigen"
          value={rules.scoreLimit}
          disabled={disabled}
          onChange={v => set('scoreLimit', v)}
          presets={[100, 150, 200, 0].map(v => ({ value: v, label: v ? `${v}` : 'geen' }))}
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
      </Group>

      <Group title="Yaniv roepen">
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
      </Group>

      <Group title="Bonus bij veelvoud">
        <Toggle disabled={disabled} checked={rules.halvingEnabled} onChange={v => set('halvingEnabled', v)} label="Bonus als je score precies op een veelvoud uitkomt" />
        {rules.halvingEnabled && (
          <>
            <Segmented
              disabled={disabled}
              value={rules.halvingType}
              onChange={v => set('halvingType', v)}
              options={[
                { value: 'half', label: 'Halveren (÷2)' },
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
      </Group>

      <Group title="Assaf">
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
            { value: false, label: 'Assaf-roeper 0 punten (officieel)' },
            { value: true, label: 'Assaf-roeper eigen hand' }
          ]}
        />
      </Group>

      <Group title="Invoercontrole">
        <NumberRow
          label="Max. punten per hand"
          hint="Hogere invoer wordt als tikfout geweigerd"
          value={rules.maxHandPoints}
          disabled={disabled}
          onChange={v => set('maxHandPoints', v)}
        />
      </Group>
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
    <div className="space-y-3">
      <Segmented
        value={match?.id ?? '__custom'}
        onChange={id => { const p = presets.find(x => x.id === id); if (p) onPick(normalizeRules(p.rules)); }}
        options={[
          ...presets.map(p => ({ value: p.id, label: p.name })),
          ...(match ? [] : [{ value: '__custom', label: 'Aangepast' }])
        ]}
        columns={Math.min(3, presets.length + (match ? 0 : 1))}
      />
      {!match && naming === null && (
        <button type="button" onClick={() => setNaming('')} className="text-[13px] font-semibold text-accent">
          Deze regels opslaan als regelset
        </button>
      )}
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
          <TextInput autoFocus value={naming} onChange={e => setNaming(e.target.value)} placeholder="Naam, bijv. Vakantieregels" maxLength={40} className="flex-1" />
          <Button type="submit" disabled={!naming.trim()}>Opslaan</Button>
          <Button type="button" variant="ghost" onClick={() => setNaming(null)}>Annuleer</Button>
        </form>
      )}
    </div>
  );
}
