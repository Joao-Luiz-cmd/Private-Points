import { validateUsername, normalizeUsername, USERNAME_REGEX } from '../username';

describe('validateUsername', () => {
  it('aceita A-Z a-z 0-9 _ - entre 3 e 20 caracteres', () => {
    for (const ok of ['abc', 'Abc_123', 'a-b', 'USER_NAME-01', 'a'.repeat(20)]) {
      const r = validateUsername(ok);
      expect(r.ok).toBe(true);
    }
  });

  it('separa display e normalizado (lowercase)', () => {
    const r = validateUsername('Private_Points');
    expect(r).toEqual({ ok: true, display: 'Private_Points', normalized: 'private_points' });
    expect(normalizeUsername('AbC')).toBe('abc');
  });

  it('usernames que diferem só por caixa têm o mesmo normalizado (base do UNIQUE)', () => {
    const a = validateUsername('JoaoSilva');
    const b = validateUsername('joaosilva');
    expect(a.ok && b.ok && a.normalized === b.normalized).toBe(true);
  });

  it('rejeita vazio, curto e longo com o erro correto', () => {
    expect(validateUsername('')).toEqual({ ok: false, error: 'REQUIRED' });
    expect(validateUsername('ab')).toEqual({ ok: false, error: 'TOO_SHORT' });
    expect(validateUsername('a'.repeat(21))).toEqual({ ok: false, error: 'TOO_LONG' });
  });

  it('rejeita espaços, acentos e caracteres especiais (sem corrigir em silêncio)', () => {
    for (const bad of ['a b c', ' abc', 'abc ', 'José', 'ção', 'user@name', 'user.name', 'a!b', 'nome😀x']) {
      expect(validateUsername(bad)).toEqual({ ok: false, error: 'INVALID_CHARACTERS' });
    }
  });

  it('a regex exportada é exatamente a da especificação', () => {
    expect(USERNAME_REGEX.source).toBe('^[A-Za-z0-9_-]{3,20}$');
  });
});
