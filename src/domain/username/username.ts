/** Regras de username (spec 6). O servidor revalida (trigger `handle_new_user`); isto é só UX. */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const USERNAME_REGEX = /^[A-Za-z0-9_-]{3,20}$/;

export type UsernameError = 'REQUIRED' | 'TOO_SHORT' | 'TOO_LONG' | 'INVALID_CHARACTERS';

export type UsernameValidation =
  | { ok: true; display: string; normalized: string }
  | { ok: false; error: UsernameError };

/** Normalizado = lowercase (UNIQUE global, case-insensitive). Só chamar com username já válido. */
export function normalizeUsername(display: string): string {
  return display.toLowerCase();
}

/** Não faz trim: espaços são proibidos e devem ser rejeitados, não corrigidos em silêncio. */
export function validateUsername(input: string): UsernameValidation {
  if (input.length === 0) return { ok: false, error: 'REQUIRED' };
  if (input.length < USERNAME_MIN_LENGTH) return { ok: false, error: 'TOO_SHORT' };
  if (input.length > USERNAME_MAX_LENGTH) return { ok: false, error: 'TOO_LONG' };
  if (!USERNAME_REGEX.test(input)) return { ok: false, error: 'INVALID_CHARACTERS' };
  return { ok: true, display: input, normalized: normalizeUsername(input) };
}
