import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Info, X } from 'lucide-react';

export function Card({ title, action, children, className = '', icon }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-title">
          <h3>
            {icon}
            {title}
          </h3>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Anel de progresso. Excesso (>100%) aparece como volta extra tracejada, não como "cheio". */
export function Ring({ pct, color, size = 112, stroke = 10, children }: { pct: number; color: string; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const over = Math.max(0, Math.min(100, pct - 100));
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(clamped / 100) * c} ${c}`} style={{ transition: 'stroke-dasharray .5s ease' }} />
        {over > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bad)" strokeWidth={stroke / 2.5} strokeDasharray={`${(over / 100) * c} ${c}`} />}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  );
}

export function Progress({ value, max, color, label, unit = 'g', hint }: { value: number; max: number; color: string; label: string; unit?: string; hint?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="macro-row">
      <span className="small" style={{ fontWeight: 600 }}>
        <span className="swatch" style={{ background: color, display: 'inline-block', marginRight: 6 }} />
        {label}
      </span>
      <span className="small tabular">
        <b>{Math.round(value)}</b>
        <span className="muted"> / {Math.round(max)} {unit}</span>
        {hint && <span className="muted"> · {hint}</span>}
      </span>
      <div className={`bar ${pct > 100 ? 'over' : ''}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemax={max} aria-label={label}>
        <span style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
    </div>
  );
}

export function Stat({ label, value, unit, sub }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value tabular">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {sub && <div className="xs muted">{sub}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ScalePicker({ value, onChange, min = 1, max = 5, labels }: { value: number | null; onChange: (v: number) => void; min?: number; max?: number; labels?: [string, string] }) {
  const items = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div>
      <div className="scale" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map((i) => (
          <button key={i} type="button" className={value === i ? 'on' : ''} onClick={() => onChange(i)} aria-pressed={value === i}>
            {i}
          </button>
        ))}
      </div>
      {labels && (
        <div className="row between xs muted" style={{ marginTop: 4 }}>
          <span>{labels[0]}</span>
          <span>{labels[1]}</span>
        </div>
      )}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="grabber" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Campo rotulado. Para um único input usa <label>; para grupos de botões (escalas, segmentos)
 * usa role="group" — botões dentro de <label> herdariam o rótulo e confundiriam leitores de tela.
 */
export function Field({ label, children, group }: { label: string; children: ReactNode; group?: boolean }) {
  if (group)
    return (
      <div className="field" role="group" aria-label={label}>
        <span>{label}</span>
        {children}
      </div>
    );
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Input numérico que aceita vírgula decimal (teclado brasileiro). */
export function NumInput({ value, onChange, placeholder, step = 'any', ...rest }: { value: number | null | undefined; onChange: (v: number | null) => void; placeholder?: string; step?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(value == null ? '' : String(value).replace('.', ','));
  useEffect(() => {
    const parsed = parseFloat(text.replace(',', '.'));
    if ((value ?? null) !== (Number.isNaN(parsed) ? null : parsed)) setText(value == null ? '' : String(value).replace('.', ','));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      {...rest}
      className={`input num ${rest.className ?? ''}`}
      inputMode="decimal"
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d,.-]/g, '');
        setText(t);
        const n = parseFloat(t.replace(',', '.'));
        onChange(t === '' || Number.isNaN(n) ? null : n);
      }}
    />
  );
}

export function Disclaimer({ children }: { children: ReactNode }) {
  return (
    <p className="disclaimer">
      <Info size={14} />
      <span>{children}</span>
    </p>
  );
}

export function Loading() {
  return (
    <div className="page-loading">
      <div className="spinner" />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty small">{children}</div>;
}

// ---------- Toast ----------
type ToastMsg = { text: string; error?: boolean; id: number };
const ToastCtx = createContext<(text: string, error?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const show = useCallback((text: string, error = false) => setMsg({ text, error, id: Date.now() }), []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.error ? 4500 : 2600);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className={`toast ${msg.error ? 'error' : ''}`} role="status" key={msg.id}>
          {msg.text}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export function StatusChip({ status }: { status: 'boa' | 'moderada' | 'baixa' | null | undefined }) {
  if (!status) return <span className="chip">Sem check-in</span>;
  const map = { boa: ['good', '🟢 Boa'], moderada: ['warn', '🟡 Moderada'], baixa: ['bad', '🔴 Baixa'] } as const;
  const [cls, label] = map[status];
  return <span className={`chip ${cls}`}>{label}</span>;
}
