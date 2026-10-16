import { create } from 'zustand';
import type { AccessState } from '@/domain/access/route';

/**
 * Estado de acesso é DERIVADO do servidor (get_home / sessão vigente) — a Fase 2 o alimenta.
 * Este store nunca decide autorização por conta própria.
 */
interface SessionStore {
  access: AccessState;
  setAccess: (access: AccessState) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  access: 'LOADING',
  setAccess: (access) => set({ access }),
}));
