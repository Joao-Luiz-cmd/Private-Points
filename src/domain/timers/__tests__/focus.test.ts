import { InvalidTransitionError } from '../shared/types';
import type { FocusSignal, FocusState } from '../focus/machine';
import { focusTransition, isFocusTerminal } from '../focus/machine';

const run = (start: FocusState, ...signals: FocusSignal[]): FocusState =>
  signals.reduce<FocusState>((s, sig) => focusTransition(s, sig), start);

const running: FocusState = 'RUNNING';
const away: FocusSignal = { type: 'BACKGROUND_DETECTED' };

describe('Modo Foco (o cliente não classifica ausências)', () => {
  it('fluxo feliz até o veredito do servidor', () => {
    const s = run('IDLE', { type: 'START_REQUESTED' }, { type: 'START_ACCEPTED' }, {
      type: 'SERVER_STATE',
      state: 'COMPLETED',
    });
    expect(s).toBe('COMPLETED');
  });

  it('QUALQUER ausência vai para PENDING_VERDICT: o cliente não decide se é tolerada', () => {
    expect(run(running, away)).toBe('PENDING_VERDICT');
    expect(run('LEAVE_WARNING', away)).toBe('PENDING_VERDICT');
    expect(isFocusTerminal(run(running, away))).toBe(false);
  });

  it('não existem estados locais "tela bloqueada tolerada"/"ligação tolerada"', () => {
    const states: FocusState[] = ['IDLE', 'CREATED', 'RUNNING', 'LEAVE_WARNING', 'PENDING_VERDICT'];
    for (const s of states) expect(String(s).includes('TOLERATED') || String(s) === 'SCREEN_LOCKED').toBe(false);
  });

  it('voltar ao primeiro plano NÃO retoma por conta própria: aguarda o servidor', () => {
    const s = run(running, away, { type: 'APP_FOREGROUNDED' });
    expect(s).toBe('PENDING_VERDICT');
  });

  it('só o servidor retoma (RUNNING) ou encerra (INTERRUPTED/UNVERIFIED/...)', () => {
    expect(run(running, away, { type: 'SERVER_STATE', state: 'RUNNING' })).toBe('RUNNING');
    expect(run(running, away, { type: 'SERVER_STATE', state: 'INTERRUPTED' })).toBe('INTERRUPTED');
    expect(run(running, away, { type: 'SERVER_STATE', state: 'UNVERIFIED' })).toBe('UNVERIFIED');
  });

  it('aviso de saída: permanecer retoma; confirmar aguarda o veredito', () => {
    expect(run(running, { type: 'LEAVE_ATTEMPT' }, { type: 'LEAVE_CANCELLED' })).toBe('RUNNING');
    expect(run(running, { type: 'LEAVE_ATTEMPT' }, { type: 'LEAVE_CONFIRMED' })).toBe('PENDING_VERDICT');
  });

  it('cancelar materializa-se pelo servidor; terminais são imutáveis', () => {
    expect(run(running, { type: 'SERVER_STATE', state: 'CANCELLED' })).toBe('CANCELLED');
    expect(() => run('COMPLETED', away)).toThrow(InvalidTransitionError);
    expect(() => run('UNVERIFIED', { type: 'SERVER_STATE', state: 'COMPLETED' })).toThrow(InvalidTransitionError);
    expect(run('EXPIRED', { type: 'SERVER_STATE', state: 'EXPIRED' })).toBe('EXPIRED');
  });

  it('RESTORE reconstrói e transições inválidas lançam erro', () => {
    expect(run('IDLE', { type: 'RESTORE', state: 'RUNNING' })).toBe('RUNNING');
    expect(() => run('IDLE', away)).toThrow(InvalidTransitionError);
    expect(() => run('RUNNING', { type: 'APP_FOREGROUNDED' })).toThrow(InvalidTransitionError);
    expect(() => run('RUNNING', { type: 'LEAVE_CANCELLED' })).toThrow(InvalidTransitionError);
    expect(() => run('CREATED', { type: 'SERVER_STATE', state: 'COMPLETED' })).toThrow(InvalidTransitionError);
  });
});
