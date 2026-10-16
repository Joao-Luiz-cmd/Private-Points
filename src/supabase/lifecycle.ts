import { AppState } from 'react-native';
import { supabase } from './client';

/** Renova o token só com o app ativo (recomendação do Supabase para React Native). */
export function bindAuthRefreshToAppState(): () => void {
  const apply = (state: string) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  };
  apply(AppState.currentState);
  const sub = AppState.addEventListener('change', apply);
  return () => sub.remove();
}
