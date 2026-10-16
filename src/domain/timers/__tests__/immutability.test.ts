import type { ServerState } from '../shared/types';
import { InvalidTransitionError, SERVER_STATES, isTerminalServerState } from '../shared/types';
import { focusTransition } from '../focus/machine';
import { normalTransition } from '../normal/machine';

const TERMINALS = SERVER_STATES.filter(isTerminalServerState);

describe('estados terminais são imutáveis nas duas máquinas (D22)', () => {
  it('UNVERIFIED NUNCA vira COMPLETED por um SERVER_STATE/RESTORE/qualquer sinal do cliente', () => {
    expect(() => normalTransition('UNVERIFIED', { type: 'SERVER_STATE', state: 'COMPLETED' })).toThrow(InvalidTransitionError);
    expect(() => focusTransition('UNVERIFIED', { type: 'SERVER_STATE', state: 'COMPLETED' })).toThrow(InvalidTransitionError);
    expect(() => normalTransition('UNVERIFIED', { type: 'RESTORE', state: 'COMPLETED' })).toThrow(InvalidTransitionError);
    expect(() => focusTransition('UNVERIFIED', { type: 'APP_FOREGROUNDED' })).toThrow(InvalidTransitionError);
    expect(() => focusTransition('UNVERIFIED', { type: 'LEAVE_CONFIRMED' })).toThrow(InvalidTransitionError);
  });

  it('para todo terminal T e todo estado S ≠ T, T --SERVER_STATE(S)--> lança', () => {
    for (const t of TERMINALS) {
      for (const s of SERVER_STATES as readonly ServerState[]) {
        if (s === t) continue;
        expect(() => normalTransition(t, { type: 'SERVER_STATE', state: s })).toThrow(InvalidTransitionError);
        expect(() => focusTransition(t, { type: 'SERVER_STATE', state: s })).toThrow(InvalidTransitionError);
      }
    }
  });

  it('repetir o mesmo veredito é idempotente (não muda o estado)', () => {
    for (const t of TERMINALS) {
      expect(normalTransition(t, { type: 'SERVER_STATE', state: t })).toBe(t);
      expect(focusTransition(t, { type: 'SERVER_STATE', state: t })).toBe(t);
    }
  });
});

describe('UNVERIFIED: nenhum sinal possível o tira do lugar (cliente)', () => {
  const signalsNormal = [
    { type: 'START_REQUESTED' }, { type: 'START_ACCEPTED' }, { type: 'START_REJECTED' },
    { type: 'APP_BACKGROUNDED' }, { type: 'APP_FOREGROUNDED' },
    ...SERVER_STATES.map((state) => ({ type: 'RESTORE', state })),
    ...SERVER_STATES.filter((s) => s !== 'UNVERIFIED').map((state) => ({ type: 'SERVER_STATE', state })),
  ] as const;
  const signalsFocus = [
    { type: 'START_REQUESTED' }, { type: 'START_ACCEPTED' }, { type: 'START_REJECTED' },
    { type: 'APP_FOREGROUNDED' }, { type: 'LEAVE_ATTEMPT' }, { type: 'LEAVE_CANCELLED' }, { type: 'LEAVE_CONFIRMED' },
    { type: 'BACKGROUND_DETECTED' },
    ...SERVER_STATES.map((state) => ({ type: 'RESTORE', state })),
    ...SERVER_STATES.filter((s) => s !== 'UNVERIFIED').map((state) => ({ type: 'SERVER_STATE', state })),
  ] as const;

  it('Normal: UNVERIFIED -> (RUNNING | COMPLETED | qualquer outro) sempre lança', () => {
    for (const sig of signalsNormal) {
      expect(() => normalTransition('UNVERIFIED', sig as never)).toThrow(InvalidTransitionError);
    }
  });

  it('Foco: UNVERIFIED -> (RUNNING | COMPLETED | qualquer outro) sempre lança', () => {
    for (const sig of signalsFocus) {
      expect(() => focusTransition('UNVERIFIED', sig as never)).toThrow(InvalidTransitionError);
    }
  });

  it('o único sinal aceito em UNVERIFIED é repetir o MESMO veredito (idempotente)', () => {
    expect(normalTransition('UNVERIFIED', { type: 'SERVER_STATE', state: 'UNVERIFIED' })).toBe('UNVERIFIED');
    expect(focusTransition('UNVERIFIED', { type: 'SERVER_STATE', state: 'UNVERIFIED' })).toBe('UNVERIFIED');
  });
});

