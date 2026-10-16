import type { ServerState, TerminalServerState } from '../shared/types';
import { InvalidTransitionError, isTerminalServerState } from '../shared/types';

/**
 * Máquina do TIMER NORMAL (timers.md §3). Máquina PRÓPRIA (D12): não compartilha tabela de
 * transições com o Modo Foco. O cliente ESPELHA o servidor: estados terminais só entram por
 * SERVER_STATE/RESTORE (o cliente nunca decide COMPLETED — D20).
 */
export type NormalState = 'IDLE' | 'CREATED' | 'RUNNING' | 'BACKGROUND' | TerminalServerState;

export type NormalSignal =
  | { type: 'START_REQUESTED' }
  | { type: 'START_ACCEPTED' }
  | { type: 'START_REJECTED' }
  | { type: 'APP_BACKGROUNDED' }
  | { type: 'APP_FOREGROUNDED' }
  | { type: 'SERVER_STATE'; state: ServerState }
  | { type: 'RESTORE'; state: ServerState };

export function isNormalTerminal(state: NormalState): state is TerminalServerState {
  return state !== 'IDLE' && state !== 'CREATED' && state !== 'RUNNING' && state !== 'BACKGROUND';
}

export function normalTransition(state: NormalState, signal: NormalSignal): NormalState {
  const fail = (): never => {
    throw new InvalidTransitionError('NORMAL', state, signal.type);
  };

  // Estados terminais são imutáveis; repetir o MESMO veredito do servidor é idempotente.
  if (isNormalTerminal(state)) {
    if (signal.type === 'SERVER_STATE' && signal.state === state) return state;
    return fail();
  }

  switch (signal.type) {
    case 'START_REQUESTED':
      return state === 'IDLE' ? 'CREATED' : fail();
    case 'START_ACCEPTED':
      return state === 'CREATED' ? 'RUNNING' : fail();
    case 'START_REJECTED':
      return state === 'CREATED' ? 'IDLE' : fail();
    // Background NÃO interrompe o Timer Normal (spec 20/22/28/64).
    case 'APP_BACKGROUNDED':
      return state === 'RUNNING' ? 'BACKGROUND' : fail();
    case 'APP_FOREGROUNDED':
      return state === 'BACKGROUND' ? 'RUNNING' : fail();
    case 'RESTORE':
      return state === 'IDLE' ? restored(signal.state) : fail();
    case 'SERVER_STATE':
      if (state !== 'RUNNING' && state !== 'BACKGROUND') return fail();
      return isTerminalServerState(signal.state) ? signal.state : state; // RUNNING = sem mudança
    default:
      // Sinal desconhecido em runtime (o tipo é exaustivo em compilação): rejeitar, nunca ignorar.
      return fail();
  }
}

function restored(server: ServerState): NormalState {
  return isTerminalServerState(server) ? server : 'RUNNING';
}
