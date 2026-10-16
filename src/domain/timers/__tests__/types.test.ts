import {
  END_REASONS,
  SERVER_STATES,
  grantsPoints,
  isTerminalServerState,
  isValidStateReason,
} from '../shared/types';

describe('estados do servidor (D22: sem mistura)', () => {
  it('só COMPLETED gera Points', () => {
    for (const s of SERVER_STATES) expect(grantsPoints(s)).toBe(s === 'COMPLETED');
  });

  it('UNVERIFIED e EXPIRED nunca geram Points e são terminais', () => {
    expect(grantsPoints('UNVERIFIED')).toBe(false);
    expect(grantsPoints('EXPIRED')).toBe(false);
    expect(isTerminalServerState('UNVERIFIED')).toBe(true);
    expect(isTerminalServerState('EXPIRED')).toBe(true);
    expect(isTerminalServerState('RUNNING')).toBe(false);
  });

  it('RUNNING exige motivo nulo; terminais exigem motivo próprio', () => {
    expect(isValidStateReason('RUNNING', null)).toBe(true);
    expect(isValidStateReason('RUNNING', 'COMPLETED')).toBe(false);
    expect(isValidStateReason('COMPLETED', null)).toBe(false);
  });

  it('continuidade não verificável não se mistura com INTERRUPTED', () => {
    expect(isValidStateReason('UNVERIFIED', 'CONTINUITY_UNVERIFIABLE')).toBe(true);
    expect(isValidStateReason('INTERRUPTED', 'CONTINUITY_UNVERIFIABLE')).toBe(false);
    expect(isValidStateReason('UNVERIFIED', 'PROCESS_TERMINATED')).toBe(false);
    expect(isValidStateReason('EXPIRED', 'STALE_EXPIRED')).toBe(true);
    expect(isValidStateReason('CANCELLED', 'USER_CANCELLED')).toBe(true);
  });

  it('nenhum motivo pertence a dois estados', () => {
    const seen = new Map<string, string>();
    for (const [state, reasons] of Object.entries(END_REASONS)) {
      for (const r of reasons) {
        expect(seen.has(r) ? seen.get(r) : state).toBe(state);
        seen.set(r, state);
      }
    }
  });
});
