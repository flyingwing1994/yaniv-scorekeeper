import { useEffect, type ReactNode } from 'react';
import { navigate } from '../lib/router';
import { scheduleSync, useStore } from '../lib/store';

// ---------- Iconen (lijn, 20px) ----------

const PATHS = {
  back: 'M12.5 4.5 7 10l5.5 5.5',
  close: 'M5 5l10 10M15 5 5 15',
  more: 'M4.5 10h.01M10 10h.01M15.5 10h.01',
  share: 'M10 3v9M6.5 6.5 10 3l3.5 3.5M4 11v5h12v-5',
  edit: 'M4 16h3l8.5-8.5-3-3L4 13v3Z',
  undo: 'M7 5 3.5 8.5 7 12M4 8.5h7.5a4.5 4.5 0 0 1 0 9H9',
  plus: 'M10 4v12M4 10h12',
  chevron: 'M7.5 4.5 13 10l-5.5 5.5'
} as const;

export function Icon({ name, size = 20, className = '' }: { name: keyof typeof PATHS; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path d={PATHS[name]} stroke="currentColor" strokeWidth={name === 'more' ? 2.6 : 1.7} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------- Knoppen & vormen ----------

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg font-extrabold tracking-wide uppercase active:opacity-85 disabled:bg-raised disabled:text-faint disabled:normal-case disabled:tracking-normal disabled:font-semibold',
  secondary: 'border border-line text-fg font-semibold active:bg-raised',
  danger: 'border border-danger/60 text-danger font-semibold active:bg-danger/10',
  ghost: 'text-muted font-semibold active:text-fg'
};

export function Button({
  variant = 'primary', className = '', children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 px-4 py-3 text-sm transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function IconButton({ icon, label, onClick }: { icon: keyof typeof PATHS; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="flex h-10 w-10 items-center justify-center border border-line text-fg active:bg-raised">
      <Icon name={icon} />
    </button>
  );
}

export function Section({ title, aside, children, className = '' }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      {(title || aside) && (
        <div className="flex items-baseline justify-between gap-3 pb-2 pt-6">
          <Label>{title}</Label>
          {aside && <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{children}</div>;
}

/** Aaneengesloten knoppengrid met haarlijnen. */
export function Segmented<T extends string | number | boolean>({
  value, options, onChange, disabled, columns
}: {
  value: T;
  options: { value: T; label: ReactNode; tone?: 'accent' }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  columns?: number;
}) {
  const cols = columns ?? Math.min(options.length, 4);
  return (
    <div className="grid gap-px border border-line bg-line" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {options.map(o => {
        const on = value === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`min-h-11 px-2 py-2 text-[13px] font-semibold leading-tight disabled:opacity-50 ${
              on ? (o.tone === 'accent' ? 'bg-accent text-accent-fg' : 'bg-fg text-bg') : 'bg-bg text-muted active:bg-raised'
            }`}
          >
            {o.label}
          </button>
        );
      })}
      {Array.from({ length: (cols - (options.length % cols)) % cols }, (_, i) => <span key={`fill-${i}`} className="bg-bg" aria-hidden="true" />)}
    </div>
  );
}

export function NumberInput({
  value, onChange, min = 0, max, className = '', placeholder, disabled, ariaLabel
}: {
  value: number | string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      pattern="[0-9]*"
      min={min}
      max={max}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      onFocus={e => e.target.select()}
      onChange={e => onChange(e.target.value.replace(/[^0-9]/g, ''))}
      className={`h-11 border border-line bg-transparent px-3 text-right text-xl font-bold text-fg outline-none placeholder:text-faint focus:border-fg disabled:opacity-50 ${className}`}
    />
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-11 min-w-0 border border-line bg-transparent px-3 text-[15px] text-fg outline-none placeholder:text-faint focus:border-fg ${props.className ?? ''}`}
    />
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 py-2 text-left text-[15px] text-fg disabled:opacity-50"
    >
      <span>{label}</span>
      <span className={`relative h-6 w-11 shrink-0 border transition-colors ${checked ? 'border-accent bg-accent' : 'border-line bg-raised'}`}>
        <span className={`absolute top-[3px] h-4 w-4 transition-all ${checked ? 'left-[23px] bg-accent-fg' : 'left-[3px] bg-muted'}`} />
      </span>
    </button>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-overlay sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto border-t border-line bg-bg px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:border"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-line pb-3">
          <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
          <button onClick={onClose} aria-label="Sluiten" className="-mr-2 p-2 text-muted"><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Kleine vierkante kleurmarkering per speler. */
export function Swatch({ color, size = 10 }: { color: string; size?: number }) {
  return <span className="inline-block shrink-0" style={{ width: size, height: size, background: color }} aria-hidden="true" />;
}

export function SyncBadge() {
  const sync = useStore(s => s.sync);
  const pending = useStore(s => s.dirtyGames.length + (s.dirtyLibrary ? 1 : 0));
  const map = {
    idle: pending ? ['Wacht op sync', 'bg-faint'] : ['Gesynchroniseerd', 'bg-ok'],
    syncing: ['Synchroniseren', 'bg-muted'],
    offline: ['Offline, lokaal bewaard', 'bg-faint'],
    error: ['Sync-fout', 'bg-danger'],
    pin: ['PIN nodig', 'bg-danger']
  } as const;
  const [text, dot] = map[sync.status];
  return (
    <button
      onClick={() => (sync.status === 'pin' ? navigate('/settings') : scheduleSync(0))}
      className="flex items-center gap-1.5 font-mono text-[11px] text-muted"
      title={sync.message}
    >
      <span className={`h-1.5 w-1.5 ${dot}`} />
      {text}
    </button>
  );
}

export function TopBar({ title, kicker, back, right }: { title: ReactNode; kicker?: ReactNode; back?: string; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-end justify-between gap-3 px-4 pb-3 pt-4">
        <div className="flex min-w-0 items-end gap-1">
          {back !== undefined && (
            <button onClick={() => navigate(back)} aria-label="Terug" className="-ml-2 mb-0.5 p-1.5 text-fg">
              <Icon name="back" size={22} />
            </button>
          )}
          <div className="min-w-0">
            {kicker && <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{kicker}</div>}
            <h1 className="truncate text-[28px] font-extrabold leading-tight tracking-[-0.03em]">{title}</h1>
            <SyncBadge />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pb-1">{right}</div>
      </div>
    </header>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-3xl px-4 pb-[max(6rem,env(safe-area-inset-bottom))]">{children}</main>;
}

/** Lijstregel met haarlijn, voor navigatie en overzichten. */
export function Row({ children, onClick, className = '' }: { children: ReactNode; onClick?: () => void; className?: string }) {
  const cls = `flex w-full min-h-14 items-center gap-3 border-b border-line-soft py-2 text-left ${className}`;
  return onClick ? <button onClick={onClick} className={cls}>{children}</button> : <div className={cls}>{children}</div>;
}
