/** Validação pura da configuração de ambiente (testável sem Expo). Falha cedo e com mensagem clara. */
export type AppEnv = 'development' | 'staging' | 'production';

export interface AppConfig {
  appEnv: AppEnv;
  supabaseUrl: string;
  supabasePublishableKey: string;
  turnstileSiteKey: string;
  turnstilePageUrl: string;
}

const ENVS: readonly AppEnv[] = ['development', 'staging', 'production'];
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '10.0.2.2'];

function str(extra: Record<string, unknown>, key: string): string {
  const v = extra[key];
  return typeof v === 'string' ? v.trim() : '';
}

/** Spec 46: nenhuma chave administrativa no app. Barra service_role/secret por prefixo e por JWT. */
export function assertNotAdminKey(key: string): void {
  if (key.startsWith('sb_secret_')) {
    throw new Error('Config: chave secreta do Supabase não pode estar no app.');
  }
  const parts = key.split('.');
  if (parts.length === 3 && parts[1]) {
    let role: unknown;
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
      role = (JSON.parse(json) as { role?: unknown }).role;
    } catch {
      return; // JWT ilegível: nada a barrar
    }
    if (role === 'service_role') throw new Error('Config: service_role não pode estar no app.');
  }
}

export function parseConfig(extra: Record<string, unknown> | undefined): AppConfig {
  const src = extra ?? {};
  const appEnv = str(src, 'APP_ENV') as AppEnv;
  if (!ENVS.includes(appEnv)) throw new Error(`Config: APP_ENV inválido (${ENVS.join(' | ')}).`);

  const supabaseUrl = str(src, 'SUPABASE_URL');
  let host: string;
  try {
    host = new URL(supabaseUrl).hostname;
  } catch {
    throw new Error('Config: SUPABASE_URL ausente ou inválida.');
  }
  const isLocal = LOCAL_HOSTS.includes(host);
  if (!supabaseUrl.startsWith('https://') && !(appEnv === 'development' && isLocal)) {
    throw new Error('Config: SUPABASE_URL deve ser https (http só em development local).');
  }

  const supabasePublishableKey = str(src, 'SUPABASE_PUBLISHABLE_KEY');
  if (!supabasePublishableKey) throw new Error('Config: SUPABASE_PUBLISHABLE_KEY ausente.');
  assertNotAdminKey(supabasePublishableKey);

  return {
    appEnv,
    supabaseUrl,
    supabasePublishableKey,
    turnstileSiteKey: str(src, 'TURNSTILE_SITE_KEY'),
    turnstilePageUrl: str(src, 'TURNSTILE_PAGE_URL'),
  };
}
