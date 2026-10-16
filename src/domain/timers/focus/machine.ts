import type { ServerState, TerminalServerState } from '../shared/types';
import { InvalidTransitionError, isTerminalServerState } from '../shared/types';

/**
 * Máquina do MODO FOCO (timers.md §4). Regras próprias (D12).
 *
 * AUTORIDADE: o cliente NÃO classifica ausências. Ele só observa e reporta sinais brutos (BACKGROUND,
 * SCREEN_LOCKED, CALL_STARTED...). Qualquer ausência leva a PENDING_VERDICT, e só o SERVIDOR decide se aquela
 * circunstância é compatível com uma execução válida (volta RUNNING) ou não (INTERRUPTED/UNVERIFIED).
 * Por isso NÃO existem aqui estados como "tela bloqueada tolerada" ou "ligação tolerada": tolerar é decisão do servidor.
 */
export type FocusState =
  | 'IDLE'
  | 'CREATED'
  | 'RUNNING'
  | 'LEAVE_WARNING'
  | 'PENDING_VERDICT'
  | TerminalServerState;

export type FocusSignal =
  | { type: 'START_REQUESTED' }
  | { type: 'START_ACCEPTED' }
  | { type: 'START_REJECTED' }
  /** Observação bruta de lifecycle. Sem "causa": o servidor correlaciona com os demais sinais. */
  | { type: 'BACKGROUND_DETECTED' }
  | { type: 'APP_FOREGROUNDED' }
  | { type: 'LEAVE_ATTEMPT' }
  | { type: 'LEAVE_CANCELLED' }
  | { type: 'LEAVE_CONFIRMED' }
  | { type: 'SERVER_STATE'; state: ServerState }
  | { type: 'RESTORE'; state: ServerState };

const ACTIVE: ReadonlySet<FocusState> = new Set<FocusState>(['RUNNING', 'LEAVE_WARNING', 'PENDING_VERDICT']);

export function isFocusTerminal(state: FocusState): state is TerminalServerState {
  return state !== 'IDLE' && state !== 'CREATED' && !ACTIVE.has(state);
}

export function focusTransition(state: FocusState, signal: FocusSignal): FocusState {
  const fail = (): never => {
    throw new InvalidTransitionError('FOCUS', state, signal.type);
  };

  if (isFocusTerminal(state)) {
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
    case 'BACKGROUND_DETECTED':
      // Toda ausência vira "aguardando veredito do servidor" — o cliente não a classifica.
      return state === 'RUNNING' || state === 'LEAVE_WARNING' ? 'PENDING_VERDICT' : fail();
    case 'APP_FOREGROUNDED':
      return state === 'PENDING_VERDICT' ? state : fail();
    case 'LEAVE_ATTEMPT':
      return state === 'RUNNING' ? 'LEAVE_WARNING' : fail();
    case 'LEAVE_CANCELLED':
      return state === 'LEAVE_WARNING' ? 'RUNNING' : fail();
    case 'LEAVE_CONFIRMED':
      return state === 'LEAVE_WARNING' ? 'PENDING_VERDICT' : fail();
    case 'RESTORE':
      if (state !== 'IDLE') return fail();
      return isTerminalServerState(signal.state) ? signal.state : 'RUNNING';
    case 'SERVER_STATE':
      if (!ACTIVE.has(state)) return fail();
      if (isTerminalServerState(signal.state)) return signal.state;
      // O servidor reconciliou as ausências e a execução SEGUE RUNNING: ele as considerou compatíveis.
      return state === 'PENDING_VERDICT' ? 'RUNNING' : state;
    default:
      return fail();
  }
}
