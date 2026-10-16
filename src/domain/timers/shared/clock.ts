/**
 * RELÓGIOS DO TIMER (timers.md §1.1) — regras que este módulo implementa:
 *
 *  1. `server_now` (lido pelo Postgres) é a ÚNICA autoridade temporal.
 *  2. O relógio de parede do aparelho NÃO é autoridade e NÃO é parâmetro de nenhuma função daqui.
 *  3. O relógio monotônico (Android `elapsedRealtime`, iOS relógio contínuo) mede tempo DECORRIDO
 *     localmente. Ele NÃO está na escala de nenhum timestamp absoluto do servidor.
 *  4. Para estimar o "agora" do servidor usamos UMA amostra calibrada (estilo NTP):
 *         m0 = monotônico imediatamente ANTES de enviar a requisição
 *         m1 = monotônico imediatamente DEPOIS de receber a resposta
 *         s  = server_now devolvido na resposta
 *     O servidor leu `s` em algum instante entre m0 e m1; assumimos o ponto médio:
 *         mSync = m0 + (m1 - m0) / 2          incerteza = (m1 - m0) / 2   (metade do RTT)
 *     e depois:   serverNowEstimado(m) = s + (m - mSync)
 *  5. A incerteza cresce com a idade da amostra (deriva do oscilador): + idade × driftPpm / 1e6.
 *  6. Isto serve APENAS para UI (tempo restante) e para AGENDAR o envio do sinal de fim.
 *     O servidor NUNCA compara estes valores com seus timestamps para decidir recompensa.
 *
 * AVISO DE SEMÂNTICA: a calibração é uma ESTIMATIVA OPERACIONAL de correlação temporal, NÃO uma prova de que
 * o cliente é honesto. Um cliente comprometido pode forjar sinais mesmo com calibração perfeita; a segurança
 * da recompensa NÃO depende desta fórmula (a decisão é do servidor: received_at >= ends_at, estrito, sem tolerância).
 */
export interface ClockSample {
  /** Monotônico imediatamente antes de enviar. */
  sentMonoMs: number;
  /** Monotônico imediatamente depois de receber. */
  receivedMonoMs: number;
  /** `server_now` da resposta (ms epoch do SERVIDOR). */
  serverNowMs: number;
}

export interface ClockSync {
  serverNowMs: number;
  /** Ponto do monotônico local ao qual `serverNowMs` corresponde (meio do RTT). */
  monoAtSyncMs: number;
  /** Incerteza no instante da amostra (RTT/2). */
  uncertaintyMs: number;
}

/** Tolerâncias documentadas (timers.md §1.1). */
export const CLOCK_TOLERANCES = {
  /** Deriva máxima assumida de oscilador de celular (100 ppm = 8,64 s/dia). */
  driftPpm: 100,
  /** Amostras mais velhas que isto não são preferidas (a menos que não haja outra). */
  maxPreferredAgeMs: 10 * 60 * 1000,
  /**
   * Margem TÉCNICA/operacional para ENVIAR o sinal depois do fim estimado (evita chegar cedo por erro de
   * estimativa). NÃO é "tolerância de conclusão": o servidor compara received_at >= ends_at sem folga alguma,
   * e se o sinal chegar cedo a resposta é RUNNING e o cliente tenta de novo. Não concede tempo ao usuário.
   */
  signalSendMarginMs: 2_000,
} as const;

export function calibrate(sample: ClockSample): ClockSync {
  const rtt = sample.receivedMonoMs - sample.sentMonoMs;
  if (!Number.isFinite(rtt) || rtt < 0) {
    throw new RangeError('Invalid clock sample: received before sent');
  }
  return {
    serverNowMs: sample.serverNowMs,
    monoAtSyncMs: sample.sentMonoMs + rtt / 2,
    uncertaintyMs: rtt / 2,
  };
}

export function estimateServerNowMs(sync: ClockSync, monoNowMs: number): number {
  return sync.serverNowMs + (monoNowMs - sync.monoAtSyncMs);
}

export function effectiveUncertaintyMs(
  sync: ClockSync,
  monoNowMs: number,
  driftPpm: number = CLOCK_TOLERANCES.driftPpm,
): number {
  const ageMs = Math.max(0, monoNowMs - sync.monoAtSyncMs);
  return sync.uncertaintyMs + (ageMs * driftPpm) / 1_000_000;
}

/** Escolhe a amostra de menor incerteza efetiva (menor RTT, já considerando a idade). */
export function pickBestSync(syncs: readonly ClockSync[], monoNowMs: number): ClockSync | null {
  let best: ClockSync | null = null;
  let bestU = Infinity;
  for (const s of syncs) {
    const u = effectiveUncertaintyMs(s, monoNowMs);
    if (u < bestU) {
      best = s;
      bestU = u;
    }
  }
  return best;
}

export function remainingMs(endsAtMs: number, sync: ClockSync, monoNowMs: number): number {
  return Math.max(0, endsAtMs - estimateServerNowMs(sync, monoNowMs));
}

/**
 * Quanto esperar (em tempo monotônico local) antes de ENVIAR o sinal de fim (heartbeat/reconcile), para que
 * ele provavelmente chegue DEPOIS de `ends_at` no relógio do servidor: fim estimado + incerteza + margem técnica.
 * É agendamento de ENVIO, não regra de conclusão. Se o servidor responder RUNNING (chegou cedo), o cliente
 * tenta de novo — quem decide é sempre o servidor.
 */
export function signalSendDelayMs(
  endsAtMs: number,
  sync: ClockSync,
  monoNowMs: number,
  marginMs: number = CLOCK_TOLERANCES.signalSendMarginMs,
): number {
  const untilEnd = endsAtMs - estimateServerNowMs(sync, monoNowMs);
  return Math.max(0, untilEnd + effectiveUncertaintyMs(sync, monoNowMs) + marginMs);
}

export function progressRatio(durationMs: number, remaining: number): number {
  if (durationMs <= 0) return 1;
  const done = 1 - remaining / durationMs;
  return Math.min(1, Math.max(0, done));
}

/** "MM:SS" arredondando para cima em segundos ("00:00" só quando realmente zerou). */
export function formatMmSs(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
