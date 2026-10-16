import { assertNotAdminKey, parseConfig } from '../parseConfig';

const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role: string) => `${b64url({ alg: 'HS256' })}.${b64url({ role })}.sig`;

const base = {
  APP_ENV: 'staging',
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_xyz',
};

describe('parseConfig', () => {
  it('aceita configuração válida', () => {
    const c = parseConfig({ ...base, TURNSTILE_SITE_KEY: '0x4AAA', TURNSTILE_PAGE_URL: 'https://x.app/t' });
    expect(c.appEnv).toBe('staging');
    expect(c.turnstileSiteKey).toBe('0x4AAA');
  });

  it('exige APP_ENV válido, URL e chave', () => {
    expect(() => parseConfig({ ...base, APP_ENV: 'prod' })).toThrow('APP_ENV');
    expect(() => parseConfig({ ...base, SUPABASE_URL: '' })).toThrow('SUPABASE_URL');
    expect(() => parseConfig({ ...base, SUPABASE_PUBLISHABLE_KEY: '' })).toThrow('SUPABASE_PUBLISHABLE_KEY');
    expect(() => parseConfig(undefined)).toThrow('APP_ENV');
  });

  it('http só em development local', () => {
    expect(() => parseConfig({ ...base, SUPABASE_URL: 'http://abc.supabase.co' })).toThrow('https');
    expect(() => parseConfig({ ...base, APP_ENV: 'production', SUPABASE_URL: 'http://127.0.0.1:54321' })).toThrow('https');
    const dev = parseConfig({ ...base, APP_ENV: 'development', SUPABASE_URL: 'http://127.0.0.1:54321' });
    expect(dev.appEnv).toBe('development');
  });

  it('barra chaves administrativas no app (spec 46)', () => {
    expect(() => parseConfig({ ...base, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' })).toThrow('secreta');
    expect(() => parseConfig({ ...base, SUPABASE_PUBLISHABLE_KEY: jwt('service_role') })).toThrow('service_role');
    expect(() => assertNotAdminKey(jwt('anon'))).not.toThrow();
  });
});
