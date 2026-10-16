import {
  DisabledCaptchaProvider,
  buildCaptchaUrl,
  isCaptchaConfigured,
  parseCaptchaMessage,
} from '../captcha';

const cfg = { siteKey: '0x4AAA-test', pageUrl: 'https://captcha.example.invalid/turnstile.html' };

describe('captcha (abstração)', () => {
  it('monta a URL a partir da CONFIGURAÇÃO (nada hardcoded) com sitekey e action', () => {
    const url = new URL(buildCaptchaUrl(cfg, 'signup'));
    expect(url.origin).toBe('https://captcha.example.invalid');
    expect(url.searchParams.get('sitekey')).toBe('0x4AAA-test');
    expect(url.searchParams.get('action')).toBe('signup');
  });

  it('exige https (http só em host local) e configuração completa', () => {
    expect(() => buildCaptchaUrl({ ...cfg, pageUrl: 'http://captcha.example.invalid/x' }, 'login')).toThrow('https');
    expect(buildCaptchaUrl({ ...cfg, pageUrl: 'http://127.0.0.1:8888/t.html' }, 'login')).toContain('127.0.0.1');
    expect(() => buildCaptchaUrl({ siteKey: '', pageUrl: cfg.pageUrl }, 'login')).toThrow('not configured');
    expect(isCaptchaConfigured({ siteKey: '', pageUrl: '' })).toBe(false);
  });

  it('aceita só mensagens bem formadas da WebView', () => {
    expect(parseCaptchaMessage('{"type":"token","token":"abc"}')).toEqual({ kind: 'token', token: 'abc' });
    expect(parseCaptchaMessage('{"type":"error","code":"timeout"}')).toEqual({ kind: 'error', code: 'timeout' });
    expect(parseCaptchaMessage('{"type":"expired"}')).toEqual({ kind: 'expired' });
    for (const bad of ['', 'not json', '[]', 'null', '{"type":"token"}', '{"type":"token","token":""}', '{"type":"x"}']) {
      expect(parseCaptchaMessage(bad)).toBeNull();
    }
    expect(parseCaptchaMessage(JSON.stringify({ type: 'token', token: 'a'.repeat(5000) }))).toBeNull();
  });

  it('provedor desabilitado não produz token', async () => {
    const p = new DisabledCaptchaProvider();
    expect(p.enabled).toBe(false);
    expect(await p.getToken()).toBeNull();
  });
});
