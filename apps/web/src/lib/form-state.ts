/** État renvoyé par les actions serveur aux formulaires. */
export interface FormState {
  status: 'idle' | 'ok' | 'error';
  /** Message global, déjà traduit. */
  message?: string;
  /** Erreurs par champ, déjà traduites. */
  fieldErrors?: Record<string, string>;
}

export const initialFormState: FormState = { status: 'idle' };

export function formError(message: string, fieldErrors?: Record<string, string>): FormState {
  return { status: 'error', message, fieldErrors };
}

export function formOk(message: string): FormState {
  return { status: 'ok', message };
}
