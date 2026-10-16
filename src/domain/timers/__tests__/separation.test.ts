import { focusTransition } from '../focus/machine';
import { normalTransition } from '../normal/machine';
import { InvalidTransitionError } from '../shared/types';

/** D12/spec 65: dois comportamentos distintos, não um único componente com flag. */
describe('Normal e Foco são máquinas distintas', () => {
  it('o MESMO sinal de saída tem efeitos opostos', () => {
    // Normal: ir para background continua elegível.
    expect(normalTransition('RUNNING', { type: 'APP_BACKGROUNDED' })).toBe('BACKGROUND');
    // Foco: ausência sem causa vai para veredito do servidor (não é "continua").
    expect(focusTransition('RUNNING', { type: 'BACKGROUND_DETECTED' })).toBe('PENDING_VERDICT');
  });

  it('o Normal não conhece estados exclusivos do Foco', () => {
    expect(() => normalTransition('RUNNING', { type: 'LEAVE_ATTEMPT' } as never)).toThrow(InvalidTransitionError);
  });

  it('o Foco não usa o estado BACKGROUND do Normal', () => {
    expect(() => focusTransition('RUNNING', { type: 'APP_BACKGROUNDED' } as never)).toThrow(InvalidTransitionError);
  });
});
