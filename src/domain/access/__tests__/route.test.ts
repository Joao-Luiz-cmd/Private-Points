import { resolveAccessRoute } from '../route';

describe('resolveAccessRoute', () => {
  it('só ACTIVE chega ao app principal', () => {
    expect(resolveAccessRoute('ACTIVE')).toBe('Main');
    for (const s of ['SIGNED_OUT', 'SESSION_REJECTED', 'PENDING_EMAIL', 'LOADING'] as const) {
      expect(resolveAccessRoute(s) === 'Main').toBe(false);
    }
  });
  it('conta não confirmada vai para confirmação, nunca para o app', () => {
    expect(resolveAccessRoute('PENDING_EMAIL')).toBe('Onboarding');
  });
  it('sessão rejeitada volta ao login', () => {
    expect(resolveAccessRoute('SESSION_REJECTED')).toBe('Auth');
  });
});

describe('resolveAccessRoute (falha fechada)', () => {
  it('estado inesperado em runtime nunca abre o app principal', () => {
    expect(resolveAccessRoute('HACKED' as never)).toBe('Auth');
  });
});
