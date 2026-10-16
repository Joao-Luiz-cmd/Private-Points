import { validatePassword } from '../password';

describe('validatePassword', () => {
  it('aceita o exemplo da especificação', () => {
    expect(validatePassword('Private@123')).toEqual({ ok: true, missing: [] });
  });

  it('aponta cada regra faltante', () => {
    expect(validatePassword('Ab1!').missing).toEqual(['MIN_LENGTH']);
    expect(validatePassword('private@123').missing).toEqual(['UPPERCASE']);
    expect(validatePassword('PRIVATE@123').missing).toEqual(['LOWERCASE']);
    expect(validatePassword('Private@abc').missing).toEqual(['DIGIT']);
    expect(validatePassword('Private1234').missing).toEqual(['SYMBOL']);
  });

  it('espaço não conta como símbolo', () => {
    expect(validatePassword('Private 1234').missing).toEqual(['SYMBOL']);
  });

  it('reporta várias regras de uma vez', () => {
    const r = validatePassword('abc');
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['MIN_LENGTH', 'UPPERCASE', 'DIGIT', 'SYMBOL']);
  });

  it('aceita letras acentuadas como maiúscula/minúscula', () => {
    expect(validatePassword('Ação@2026').ok).toBe(true);
  });
});
