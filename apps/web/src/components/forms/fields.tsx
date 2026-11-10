import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

const inputClass = 'w-full rounded-lg border border-line bg-ivory px-3 py-2.5 text-ink outline-none focus:border-primary-700';

export function Field({ label, name, hint, ...rest }: { label: string; name: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <input id={id} name={name} className={inputClass} aria-describedby={hint ? `${id}-hint` : undefined} {...rest} />
      {hint ? <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export function SelectField({ label, name, children, ...rest }: { label: string; name: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <select id={id} name={name} className={inputClass} {...rest}>{children}</select>
    </div>
  );
}

export function Checkbox({ name, label, required }: { name: string; label: ReactNode; required?: boolean }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" name={name} value="yes" required={required} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary-700)]" />
      <span>{label}</span>
    </label>
  );
}
