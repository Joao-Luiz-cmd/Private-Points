import Constants from 'expo-constants';
import { parseConfig } from './parseConfig';

/** Lida uma vez na inicialização; `extra` é preenchido por app.config.ts (por ambiente). */
export const config = parseConfig(Constants.expoConfig?.extra as Record<string, unknown> | undefined);
