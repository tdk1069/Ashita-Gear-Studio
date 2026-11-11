/* Small shared building blocks. Styling lives in styles/app.css (component classes) and Tailwind utilities. */
import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode, ReactElement } from 'react';

export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(' ');

export function Window({ title, actions, children, className, bodyClass }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }): ReactElement {
  return (
    <section className={cx('win', className)}>
      {(title || actions) && (
        <header>
          {title && <h2>{title}</h2>}
          {actions && <div className="ml-auto flex flex-wrap items-center gap-1.5">{actions}</div>}
        </header>
      )}
      {bodyClass === undefined ? children : <div className={bodyClass}>{children}</div>}
    </section>
  );
}

type BtnProps = { children: ReactNode; onClick?: () => void; variant?: 'default' | 'primary' | 'ghost' | 'danger'; small?: boolean; disabled?: boolean; title?: string; label?: string; className?: string };
export function Btn({ children, onClick, variant = 'default', small, disabled, title, label, className }: BtnProps): ReactElement {
  return (
    <button type="button" className={cx('btn', variant === 'primary' && 'primary', variant === 'ghost' && 'ghost', variant === 'danger' && 'danger', small && 'small', className)}
      onClick={onClick} disabled={disabled} title={title} aria-label={label}>{children}</button>
  );
}
export const IconBtn = (p: Omit<BtnProps, 'small' | 'variant'> & { label: string }): ReactElement => <Btn {...p} variant="ghost" className={cx('icon-btn', p.className)} />;

/** A delete button that asks for a second click before acting. */
export function ConfirmBtn({ label = 'Delete', armedLabel = 'Click again to delete', onConfirm, small = true }: { label?: string; armedLabel?: string; onConfirm: () => void; small?: boolean }): ReactElement {
  const [armed, setArmed] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  return (
    <button type="button" className={cx('btn danger', small && 'small', armed && 'armed')} onClick={() => {
      if (armed) { setArmed(false); onConfirm(); return; }
      setArmed(true);
      t.current = setTimeout(() => setArmed(false), 3000);
    }}>{armed ? armedLabel : label}</button>
  );
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }): ReactElement {
  return <label className={cx('field', className)}><span>{label}</span>{children}</label>;
}

export function TextInput({ value, onChange, label, placeholder, list, type = 'text', className, mono, id }: {
  value: string | number; onChange: (v: string) => void; label?: string; placeholder?: string; list?: string; type?: 'text' | 'number'; className?: string; mono?: boolean; id?: string;
}): ReactElement {
  return <input id={id} type={type} className={cx(mono && 'font-mono text-[13px]', className)} aria-label={label} placeholder={placeholder} list={list} value={value} onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} />;
}

export function TextArea({ value, onChange, label, rows = 3, placeholder, mono = true, readOnly, id }: {
  value: string; onChange?: (v: string) => void; label?: string; rows?: number; placeholder?: string; mono?: boolean; readOnly?: boolean; id?: string;
}): ReactElement {
  return <textarea id={id} rows={rows} className={mono ? '' : 'prose-area'} aria-label={label} placeholder={placeholder} readOnly={readOnly} spellCheck={false} value={value} onChange={e => onChange?.(e.target.value)} />;
}

export function Select({ value, onChange, options, label, className, placeholder }: {
  value: string; onChange: (v: string) => void; options: readonly (string | readonly [string, string])[]; label?: string; className?: string; placeholder?: string;
}): ReactElement {
  const opts = options.map(o => (typeof o === 'string' ? ([o, o] as const) : o));
  const hasValue = opts.some(o => o[0] === value);
  return (
    <select className={className} aria-label={label} value={value} onChange={e => onChange(e.target.value)}>
      {(!hasValue || placeholder) && <option value={hasValue ? '' : value}>{hasValue ? placeholder : value || placeholder || 'Choose…'}</option>}
      {opts.map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
    </select>
  );
}

export function Check({ checked, onChange, children, title }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; title?: string }): ReactElement {
  return <label className="toggle" title={title}><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />{children}</label>;
}

export function Badge({ children, tone }: { children: ReactNode; tone?: 'err' | 'warn' }): ReactElement {
  return <span className={cx('badge', tone)}>{children}</span>;
}

export function Dialog({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, textarea, select, button');
    first?.focus();
    return () => { prev?.focus?.(); };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const f = Array.from(ref.current.querySelectorAll<HTMLElement>('input, textarea, select, button, [href]')).filter(x => !x.hasAttribute('disabled'));
      if (!f.length) return;
      const first = f[0]!, last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="win dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <header><h2 id={titleId}>{title}</h2></header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}
