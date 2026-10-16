/**
 * Abstração do captcha (D25). O provedor real (Turnstile em WebView) é UI; aqui ficam as partes puras:
 * montagem da URL da página hospedada (vem de CONFIG — nenhum domínio/segredo hardcoded) e parse
 * estrito das mensagens da WebView. O token é de uso único e curto: nunca persistir nem logar.
 */
export type CaptchaAction = 'signup' | 'login' | 'reset_password' | 'recover_account';

export interface CaptchaProvider {
  /** false quando não configurado (ex.: dev local sem Turnstile). */
  readonly enabled: boolean;
  /** Obtém um token NOVO (um por tentativa). Retorna null se desabilitado. */
  getToken(action: CaptchaAction): Promise<string | null>;
}

export interface CaptchaConfig {
  siteKey: string;
  /** URL HTTPS da página hospedada no domínio próprio (definido depois). */
  pageUrl: string;
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '10.0.2.2'];

export function isCaptchaConfigured(cfg: CaptchaConfig): boolean {
  return cfg.siteKey.trim() !== '' && cfg.pageUrl.trim() !== '';
}

/** https obrigatório (http só para host local). Devolve a URL final da WebView. */
export function buildCaptchaUrl(cfg: CaptchaConfig, action: CaptchaAction): string {
  if (!isCaptchaConfigured(cfg)) throw new Error('Captcha not configured');
  const url = new URL(cfg.pageUrl);
  const isLocal = LOCAL_HOSTS.includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) {
    throw new Error('Captcha page must be served over https');
  }
  url.searchParams.set('sitekey', cfg.siteKey);
  url.searchParams.set('action', action);
  return url.toString();
}

/** A WebView só é confiável para o token; nada mais sai dela. */
export type CaptchaMessage =
  | { kind: 'token'; token: string }
  | { kind: 'error'; code: string }
  | { kind: 'expired' };

const MAX_TOKEN_LENGTH = 4096;

export function parseCaptchaMessage(raw: string): CaptchaMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (data === null || typeof data !== 'object') return null;
  const msg = data as Record<string, unknown>;
  if (msg.type === 'token' && typeof msg.token === 'string') {
    const token = msg.token;
    if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
    return { kind: 'token', token };
  }
  if (msg.type === 'error' && typeof msg.code === 'string') {
    return { kind: 'error', code: msg.code.slice(0, 64) };
  }
  if (msg.type === 'expired') return { kind: 'expired' };
  return null;
}

/** Provedor usado quando não há configuração: não bloqueia dev local; Auth em produção exige captcha. */
export class DisabledCaptchaProvider implements CaptchaProvider {
  readonly enabled = false;
  getToken(): Promise<string | null> {
    return Promise.resolve(null);
  }
}
