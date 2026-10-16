import { InvalidTransitionError, SERVER_STATES } from '../shared/types';
import type { NormalSignal, NormalState } from '../normal/machine';
import { isNormalTerminal, normalTransition } from '../normal/machine';

const run = (start: NormalState, ...signals: NormalSignal[]): NormalState =>
  signals.reduce<NormalState>((s, sig) => normalTransition(s, sig), start);

describe('Timer Normal', () => {
  it('fluxo feliz: IDLE -> CREATED -> RUNNING -> COMPLETED (veredito do servidor)', () => {
    const s = run('IDLE', { type: 'START_REQUESTED' }, { type: 'START_ACCEPTED' }, {
      type: 'SERVER_STATE',
      state: 'COMPLETED',
    });
    expect(s).toBe('COMPLETED');
  });

  it('background, troca de app, tela bloqueada e ligação NÃO interrompem (spec 20/22/27/64)', () => {
    const s = run(
      'RUNNING',
      { type: 'APP_BACKGROUNDED' },
      { type: 'APP_FOREGROUNDED' },
      { type: 'APP_BACKGROUNDED' },
    );
    expect(s).toBe('BACKGROUND');
    expect(isNormalTerminal(s)).toBe(false);
  });

  it('em background o timer continua elegível: o servidor pode concluir', () => {
    expect(run('BACKGROUND', { type: 'SERVER_STATE', state: 'COMPLETED' })).toBe('COMPLETED');
  });

  it('start recusado volta a IDLE', () => {
    expect(run('IDLE', { type: 'START_REQUESTED' }, { type: 'START_REJECTED' })).toBe('IDLE');
  });

  it('cancelar só se materializa pelo veredito do servidor', () => {
    expect(run('RUNNING', { type: 'SERVER_STATE', state: 'CANCELLED' })).toBe('CANCELLED');
  });

  it('SERVER_STATE RUNNING não muda o estado', () => {
    expect(run('BACKGROUND', { type: 'SERVER_STATE', state: 'RUNNING' })).toBe('BACKGROUND');
  });

  it('cada estado terminal do servidor é alcançável', () => {
    for (const s of SERVER_STATES) {
      if (s === 'RUNNING') continue;
      expect(run('RUNNING', { type: 'SERVER_STATE', state: s })).toBe(s);
    }
  });

  it('RESTORE no launch reconstrói o estado a partir do servidor', () => {
    expect(run('IDLE', { type: 'RESTORE', state: 'RUNNING' })).toBe('RUNNING');
    expect(run('IDLE', { type: 'RESTORE', state: 'UNVERIFIED' })).toBe('UNVERIFIED');
    expect(() => run('RUNNING', { type: 'RESTORE', state: 'RUNNING' })).toThrow(InvalidTransitionError);
  });

  it('estados terminais são imutáveis; repetir o mesmo veredito é idempotente', () => {
    expect(run('COMPLETED', { type: 'SERVER_STATE', state: 'COMPLETED' })).toBe('COMPLETED');
    expect(() => run('COMPLETED', { type: 'SERVER_STATE', state: 'CANCELLED' })).toThrow(InvalidTransitionError);
    expect(() => run('INTERRUPTED', { type: 'START_REQUESTED' })).toThrow(InvalidTransitionError);
    expect(() => run('UNVERIFIED', { type: 'APP_FOREGROUNDED' })).toThrow(InvalidTransitionError);
    expect(() => run('EXPIRED', { type: 'SERVER_STATE', state: 'COMPLETED' })).toThrow(InvalidTransitionError);
  });

  it('transições inválidas lançam erro', () => {
    expect(() => run('IDLE', { type: 'APP_BACKGROUNDED' })).toThrow(InvalidTransitionError);
    expect(() => run('RUNNING', { type: 'START_REQUESTED' })).toThrow(InvalidTransitionError);
    expect(() => run('RUNNING', { type: 'APP_FOREGROUNDED' })).toThrow(InvalidTransitionError);
    expect(() => run('CREATED', { type: 'SERVER_STATE', state: 'COMPLETED' })).toThrow(InvalidTransitionError);
  });
});
