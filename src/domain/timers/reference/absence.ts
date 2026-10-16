import type { ClientEventType } from '../shared/signals';

/**
 * MODELO DE REFERÊNCIA EXECUTÁVEL (em TypeScript) da classificação de ausências no Modo Foco.
 * A autoridade é o SQL `private.absence_verdict` (database.md); este arquivo existe para TESTAR a lógica
 * aqui (sem PostgreSQL) e para virar teste de paridade quando houver Postgres. Os dois devem permanecer idênticos.
 *
 * Entrada: eventos BRUTOS já com tempo decorrido efetivo (= least(decorrido local, decorrido do servidor até o recebimento)).
 * Saída: o veredito é do SERVIDOR; o cliente não envia classificação alguma.
 */
export interface RawEvent {
  type: ClientEventType;
  elapsedMs: number;
}

export type AbsenceVerdict = 'OK' | 'LEFT_APP' | 'UNATTRIBUTED';

/** Tolerância TÉCNICA de ordenação entre sinais quase simultâneos do SO. Não é regra de produto. */
export const ABSENCE_ORDERING_TOLERANCE_MS = 3_000;

export function absenceVerdict(events: readonly RawEvent[], durationMs: number): AbsenceVerdict {
  const screenObservable = events.some((e) => e.type === 'CHANNEL_SCREEN_OBSERVABLE');
  const callObservable = events.some((e) => e.type === 'CHANNEL_CALL_OBSERVABLE');
  let verdict: AbsenceVerdict = 'OK';

  for (const b of events.filter((e) => e.type === 'BACKGROUND')) {
    if (b.elapsedMs >= durationMs) continue; // ausência depois do fim não invalida

    const screenCorroborated = events.some(
      (s) => s.type === 'SCREEN_LOCKED' && Math.abs(s.elapsedMs - b.elapsedMs) <= ABSENCE_ORDERING_TOLERANCE_MS,
    );
    const callCorroborated = events.some(
      (c) =>
        c.type === 'CALL_STARTED' &&
        c.elapsedMs <= b.elapsedMs + ABSENCE_ORDERING_TOLERANCE_MS &&
        !events.some((e) => e.type === 'CALL_ENDED' && e.elapsedMs > c.elapsedMs && e.elapsedMs < b.elapsedMs),
    );
    if (screenCorroborated || callCorroborated) continue; // compatível com execução válida

    // Sem corroboração: se a plataforma TEM os dois canais de observação e nenhum registrou bloqueio/ligação,
    // a ausência é saída do app. Se algum canal não existe, não dá para excluir lock/ligação ⇒ não verificável.
    if (screenObservable && callObservable) return 'LEFT_APP';
    verdict = 'UNATTRIBUTED';
  }
  return verdict;
}
