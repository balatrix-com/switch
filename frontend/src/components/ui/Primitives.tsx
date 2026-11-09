import { LoaderCircle, X } from 'lucide-react';
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import './primitives.css';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'default' | 'compact';
  loading?: boolean;
};

export function UiButton({ variant = 'secondary', size = 'default', loading = false, className = '', children, disabled, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={`button ${variant} ${size === 'compact' ? 'compact' : ''} ${className}`} disabled={disabled || loading} aria-busy={loading} {...props}>
    {loading && <LoaderCircle size={16} className="spin" aria-hidden="true" />}{children}
  </button>;
}

export function UiBadge({ tone = 'neutral', children }: { tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'; children: ReactNode }) {
  return <span className={`ui-badge ui-badge-${tone}`}>{children}</span>;
}

export function UiInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ui-input ${className}`} {...props} />;
}

export function UiSelect({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`ui-input ui-select ${className}`} {...props}>{children}</select>;
}

export function UiField({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return <label className="ui-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}{error && <small className="ui-field-error" role="alert">{error}</small>}</label>;
}

export function UiTabs({ tabs, value, onChange, label }: { tabs: { value: string; label: string; count?: number }[]; value: string; onChange: (value: string) => void; label: string }) {
  return <div className="ui-tabs" role="tablist" aria-label={label}>{tabs.map((tab, index) => <button key={tab.value} type="button" role="tab" tabIndex={value === tab.value ? 0 : -1} aria-selected={value === tab.value} className={value === tab.value ? 'active' : ''} onClick={() => onChange(tab.value)} onKeyDown={(event) => {
    const nextIndex = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (nextIndex < 0) return;
    event.preventDefault(); onChange(tabs[nextIndex].value);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
  }}>{tab.label}{tab.count !== undefined && <span className="ui-tab-count">{tab.count}</span>}</button>)}</div>;
}

export function UiSkeleton({ rows = 4 }: { rows?: number }) {
  return <div className="ui-skeleton" role="status" aria-label="Loading data">{Array.from({ length: rows }, (_, index) => <span key={index} />)}</div>;
}

export function UiDialog({ title, description, children, onClose, size = 'default' }: { title: string; description?: string; children: ReactNode; onClose: () => void; size?: 'default' | 'wide' }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]'));
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) { event.preventDefault(); focusable[0].focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLElement>('[autofocus], input, select, textarea, button')?.focus();
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow; previous?.focus(); };
  }, []);
  return createPortal(<div className="ui-dialog-layer"><button className="ui-dialog-scrim" onClick={onClose} aria-label="Close dialog" /><section ref={dialogRef} className={`ui-dialog ui-dialog-${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId}><header><div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div><UiButton variant="ghost" className="ui-icon-action" aria-label="Close dialog" onClick={onClose}><X size={18} /></UiButton></header>{children}</section></div>, document.body);
}

export function UiConfirmDialog({ title, description, confirmLabel, onConfirm, onClose, busy = false }: { title: string; description: string; confirmLabel: string; onConfirm: () => void; onClose: () => void; busy?: boolean }) {
  return <UiDialog title={title} description={description} onClose={onClose}><footer className="ui-dialog-actions"><UiButton onClick={onClose}>Cancel</UiButton><UiButton variant="danger" loading={busy} onClick={onConfirm}>{confirmLabel}</UiButton></footer></UiDialog>;
}

export function UiDrawer({ title, eyebrow, children, onClose, className = '' }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void; className?: string }) {
  const titleId = useId();
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]'));
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) { event.preventDefault(); focusable[0].focus(); }
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    drawerRef.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus();
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); previous?.focus(); };
  }, []);
  return createPortal(<div className="drawer-layer"><button type="button" className="drawer-scrim" onClick={onClose} aria-label="Close drawer" /><aside ref={drawerRef} className={`drawer ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId}><div className="drawer-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2 id={titleId}>{title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close drawer"><X size={20} /></button></div>{children}</aside></div>, document.body);
}
