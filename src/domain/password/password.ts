/** Política de senha (spec 8). Validação de UX; a política real é imposta pelo Supabase Auth. */
export const PASSWORD_MIN_LENGTH = 8;

export type PasswordRule = 'MIN_LENGTH' | 'UPPERCASE' | 'LOWERCASE' | 'DIGIT' | 'SYMBOL';

const RULES: ReadonlyArray<readonly [PasswordRule, (p: string) => boolean]> = [
  ['MIN_LENGTH', (p) => p.length >= PASSWORD_MIN_LENGTH],
  ['UPPERCASE', (p) => /\p{Lu}/u.test(p)],
  ['LOWERCASE', (p) => /\p{Ll}/u.test(p)],
  ['DIGIT', (p) => /[0-9]/.test(p)],
  ['SYMBOL', (p) => /[^\p{L}\p{N}\s]/u.test(p)],
];

export interface PasswordValidation {
  ok: boolean;
  missing: PasswordRule[];
}

export function validatePassword(password: string): PasswordValidation {
  const missing = RULES.filter(([, test]) => !test(password)).map(([rule]) => rule);
  return { ok: missing.length === 0, missing };
}
