import { useEffect, type ReactNode } from 'react';
import { navigate } from '../lib/router';
import { scheduleSync, useStore } from '../lib/store';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'gold';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-indigo-600 text-white active:bg-indigo-700 disabled:bg-slate-800 disabled:text-slate-500',
  secondary: 'bg-slate-800 text-slate-100 border border-slate-700 active:bg-slate-700',
  danger: 'bg-rose-600 text-white active:bg-rose-700',
  ghost: 'text-slate-300 active:bg-slate-800',
  gold: 'bg-amber-500 text-slate-950 active:bg-amber-600'
};

export function Button({
  variant = 'primary', className = '', children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...rest}
      className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-800 bg-slate-900 p-4 ${className}`}>{children}</section>;
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-xs font-bold uppercase tracking-wide text-indigo-400">{children}</div>;
}

export function Segmented<T extends string | number | boolean>({
  value, options, onChange, disabled
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 4)}, minmax(0, 1fr))` }}>
      {options.map(o => (
        <button
          key={String(o.value)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`rounded-xl border px-2 py-2 text-xs font-bold ${
            value === o.value ? 'border-indigo-400 bg-indigo-600 text-white' : 'border-slate-800 bg-slate-950 text-slate-400'
          } disabled:opacity-50`}
        >
          {o.label}
        </button>
      ))}
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
      className={`rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-right text-lg font-bold text-white outline-none focus:border-indigo-400 disabled:opacity-50 ${className}`}
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
      className="flex w-full items-center justify-between gap-3 py-1 text-left text-sm text-slate-200 disabled:opacity-50"
    >
      <span>{label}</span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-700'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-800 bg-slate-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-black text-white">{title}</h2>
          <button onClick={onClose} aria-label="Sluiten" className="rounded-lg px-2 py-1 text-slate-400">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Avatar({ name, color, size = 28 }: { name: string; color: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-black text-white"
      style={{ width: size, height: size, fontSize: size * 0.45, background: `linear-gradient(135deg, ${color}, ${color}99)` }}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

export function SyncBadge() {
  const sync = useStore(s => s.sync);
  const pending = useStore(s => s.dirtyGames.length + (s.dirtyLibrary ? 1 : 0));
  const map = {
    idle: pending ? ['⏳', 'Wacht op sync', 'text-amber-300'] : ['✓', 'Gesynchroniseerd', 'text-emerald-400'],
    syncing: ['↻', 'Synchroniseren…', 'text-sky-300'],
    offline: ['●', 'Offline, lokaal bewaard', 'text-amber-300'],
    error: ['!', 'Sync-fout', 'text-rose-400'],
    pin: ['🔒', 'PIN nodig', 'text-rose-400']
  } as const;
  const [icon, text, color] = map[sync.status];
  return (
    <button
      onClick={() => (sync.status === 'pin' ? navigate('/settings') : scheduleSync(0))}
      className={`text-xs font-semibold ${color}`}
      title={sync.message}
    >
      {icon} {text}
    </button>
  );
}

export function TopBar({ title, back, right }: { title: ReactNode; back?: string; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {back !== undefined && (
            <button onClick={() => navigate(back)} aria-label="Terug" className="-ml-2 rounded-lg px-2 py-1 text-xl text-slate-300">‹</button>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-lg font-black text-white">{title}</h1>
            <SyncBadge />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">{right}</div>
      </div>
    </header>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-3xl space-y-4 px-4 pb-[max(6rem,env(safe-area-inset-bottom))] pt-4">{children}</main>;
}
