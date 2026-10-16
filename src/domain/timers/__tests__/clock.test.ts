import {
  CLOCK_TOLERANCES,
  calibrate,
  signalSendDelayMs,
  effectiveUncertaintyMs,
  estimateServerNowMs,
  formatMmSs,
  pickBestSync,
  progressRatio,
  remainingMs,
} from '../shared/clock';

// Uma requisição enviada em mono=5_000 e respondida em mono=5_400 (RTT 400 ms); server_now = 1_000_000.
const sync = calibrate({ sentMonoMs: 5_000, receivedMonoMs: 5_400, serverNowMs: 1_000_000 });

describe('calibração (NTP-lite)', () => {
  it('usa o ponto médio do RTT e a metade do RTT como incerteza', () => {
    expect(sync).toEqual({ serverNowMs: 1_000_000, monoAtSyncMs: 5_200, uncertaintyMs: 200 });
  });

  it('rejeita amostra com recebimento antes do envio', () => {
    expect(() => calibrate({ sentMonoMs: 10, receivedMonoMs: 5, serverNowMs: 1 })).toThrow(RangeError);
  });

  it('o monotônico é usado só como DIFERENÇA: não há comparação com timestamp absoluto', () => {
    // Mesma amostra, monotônico "deslocado" por um offset arbitrário (outra origem do relógio): mesmo resultado.
    const shifted = calibrate({ sentMonoMs: 5_000 + 9e9, receivedMonoMs: 5_400 + 9e9, serverNowMs: 1_000_000 });
    expect(estimateServerNowMs(shifted, 5_200 + 9e9 + 60_000)).toBe(estimateServerNowMs(sync, 5_200 + 60_000));
  });
});

describe('estimativa do "agora" do servidor e tempo restante', () => {
  it('avança pelo delta do monotônico', () => {
    expect(estimateServerNowMs(sync, 5_200)).toBe(1_000_000);
    expect(estimateServerNowMs(sync, 65_200)).toBe(1_060_000);
  });

  it('tempo restante decresce e nunca fica negativo', () => {
    const endsAt = 1_000_000 + 1_800_000;
    expect(remainingMs(endsAt, sync, 5_200)).toBe(1_800_000);
    expect(remainingMs(endsAt, sync, 5_200 + 1_799_000)).toBe(1_000);
    expect(remainingMs(endsAt, sync, 5_200 + 9_999_999)).toBe(0);
  });

  it('a assinatura não recebe relógio de parede: alterar a hora do aparelho não tem como influir', () => {
    // Garantia estrutural: nenhuma função do módulo aceita Date/epoch do aparelho.
    expect(remainingMs.length).toBe(3);
    expect(estimateServerNowMs.length).toBe(2);
  });
});

describe('incerteza e escolha de amostra', () => {
  it('cresce com a idade (deriva)', () => {
    const u0 = effectiveUncertaintyMs(sync, sync.monoAtSyncMs);
    const u1 = effectiveUncertaintyMs(sync, sync.monoAtSyncMs + 86_400_000); // 1 dia
    expect(u0).toBe(200);
    expect(u1).toBeCloseTo(200 + (86_400_000 * CLOCK_TOLERANCES.driftPpm) / 1e6, 6);
  });

  it('prefere menor incerteza efetiva', () => {
    const lowRttOld = calibrate({ sentMonoMs: 0, receivedMonoMs: 20, serverNowMs: 1_000 }); // u=10, velha
    const highRttFresh = calibrate({ sentMonoMs: 900_000, receivedMonoMs: 901_000, serverNowMs: 901_000 }); // u=500
    const now = 910_000;
    expect(pickBestSync([lowRttOld, highRttFresh], now)).toBe(lowRttOld);
    expect(pickBestSync([], now)).toBeNull();
  });
});

describe('agendamento do ENVIO do sinal de fim (margem técnica, não regra de conclusão)', () => {
  it('espera fim estimado + incerteza + margem (para chegar DEPOIS de ends_at no servidor)', () => {
    const endsAt = 1_000_000 + 1_800_000;
    const delay = signalSendDelayMs(endsAt, sync, 5_200);
    expect(delay).toBe(1_800_000 + 200 + CLOCK_TOLERANCES.signalSendMarginMs);
  });

  it('nunca é negativo e, após o fim, mantém só incerteza + margem', () => {
    const endsAt = 1_000_000 + 1_000;
    expect(signalSendDelayMs(endsAt, sync, 5_200 + 500_000)).toBeGreaterThanOrEqual(0);
  });
});

describe('formatação', () => {
  it('progresso entre 0 e 1', () => {
    expect(progressRatio(1800_000, 1800_000)).toBe(0);
    expect(progressRatio(1800_000, 900_000)).toBe(0.5);
    expect(progressRatio(1800_000, 0)).toBe(1);
    expect(progressRatio(1800_000, -5)).toBe(1);
  });

  it('MM:SS arredonda para cima', () => {
    expect(formatMmSs(1_800_000)).toBe('30:00');
    expect(formatMmSs(1_799_001)).toBe('30:00');
    expect(formatMmSs(1_000)).toBe('00:01');
    expect(formatMmSs(1)).toBe('00:01');
    expect(formatMmSs(0)).toBe('00:00');
    expect(formatMmSs(530_000)).toBe('08:50');
  });
});
