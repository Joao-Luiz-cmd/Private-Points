import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Configuração por ambiente. Somente valores PÚBLICOS por design vão para `extra`
 * (URL, chave publishable, site key do Turnstile). service_role e segredos NUNCA entram aqui.
 * Escolha o ambiente com APP_ENV=development|staging|production (ou arquivos .env.*).
 */
const APP_ENV = process.env.APP_ENV ?? 'development';
// dev/staging instaláveis lado a lado com produção
const idSuffix = APP_ENV === 'production' ? '' : `.${APP_ENV}`;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_ENV === 'production' ? 'Private Points' : `Private Points (${APP_ENV})`,
  slug: 'private-points',
  scheme: 'privatepoints',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  icon: './assets/icon.png',
  backgroundColor: '#080a0f',
  // TODO(domínio): identificadores provisórios; definir os finais quando houver domínio próprio.
  ios: { supportsTablet: false, bundleIdentifier: `com.privatepoints.app${idSuffix}` },
  android: {
    package: `com.privatepoints.app${idSuffix}`,
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#080a0f' },
  },
  plugins: ['expo-secure-store', 'expo-dev-client'],
  extra: {
    APP_ENV,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
    TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY,
    TURNSTILE_PAGE_URL: process.env.TURNSTILE_PAGE_URL,
  },
});
