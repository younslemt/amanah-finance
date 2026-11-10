import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

const inputClass = 'mt-1 w-full rounded-lg border border-line bg-ivory px-3 py-2.5 text-ink outline-none focus:border-primary-700';

/**
 * Champs étiquetés par imbrication (<label> englobant) : aucun identifiant n'est
 * nécessaire, donc aucun doublon possible quand plusieurs formulaires d'une page
 * ont des champs de même nom.
 */
export function Field({ label, name, hint, ...rest }: { label: string; name: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-sm font-medium">
        {label}
        <input name={name} className={inputClass} {...rest} />
      </label>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export function SelectField({ label, name, children, ...rest }: { label: string; name: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <select name={name} className={inputClass} {...rest}>{children}</select>
    </label>
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
