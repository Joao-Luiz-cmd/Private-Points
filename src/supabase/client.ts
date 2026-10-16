import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { config } from '@/config/env';
import { createChunkedStorage } from '@/security/chunkedStorage';

const secureBackend = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

/**
 * Cliente ANÔNIMO/publishable, com o JWT do usuário. Nunca service_role (spec 46).
 * Toda operação crítica passa por RPC/Edge Function; o cliente só lê o que a RLS permite.
 */
export const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
  auth: {
    storage: createChunkedStorage(secureBackend),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
