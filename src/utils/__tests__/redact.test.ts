import { REDACTED, redact } from '../redact';

describe('redact', () => {
  it('oculta chaves sensíveis em qualquer profundidade', () => {
    const out = redact({
      email_domain: 'x.com',
      password: 'Private@123',
      nested: { access_token: 'abc', refreshToken: 'def', ok: 1 },
      list: [{ apiKey: 'k' }, { senha: 's' }],
    });
    expect(out).toEqual({
      email_domain: 'x.com',
      password: REDACTED,
      nested: { access_token: REDACTED, refreshToken: REDACTED, ok: 1 },
      list: [{ apiKey: REDACTED }, { senha: REDACTED }],
    });
  });

  it('oculta strings com formato de JWT mesmo em chaves inocentes', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcDEF123_-xyz';
    expect(redact({ note: jwt })).toEqual({ note: REDACTED });
  });

  it('preserva valores comuns e limita profundidade', () => {
    expect(redact({ event: 'TASK_STARTED', n: 3, ok: true, nil: null })).toEqual({
      event: 'TASK_STARTED',
      n: 3,
      ok: true,
      nil: null,
    });
    let deep: Record<string, unknown> = { v: 1 };
    for (let i = 0; i < 20; i++) deep = { n: deep };
    expect(JSON.stringify(redact(deep)).includes('[TRUNCATED]')).toBe(true);
  });
});
