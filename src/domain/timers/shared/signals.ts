/**
 * CONTRATO CLIENTE → SERVIDOR (security.md §1.2, timers.md §1.2).
 * O cliente reporta OBSERVAÇÕES BRUTAS (o que o SO lhe mostrou). Ele NÃO as classifica: não existe campo `cause`/`reason`/`kind`
 * de decisão. O SERVIDOR correlaciona os sinais e decide o que é compatível com uma execução válida.
 * O cliente envia SINAIS (eventos + evidências de identidade). Ele NUNCA envia `completed`,
 * `reward`, quantidade de Points, estado ou motivo de término. O servidor decide.
 * O servidor aplica a MESMA lista branca (`private.ingest_events` rejeita chaves desconhecidas).
 */
export const CLIENT_EVENT_TYPES = [
  'HEARTBEAT',
  'APP_LAUNCH',
  'FOREGROUND',
  'BACKGROUND',
  'SCREEN_LOCKED',
  'SCREEN_UNLOCKED',
  'CALL_STARTED',
  'CALL_ENDED',
  /** Observações de CAPACIDADE da plataforma (sinal bruto): "este canal de observação existe neste aparelho". */
  'CHANNEL_SCREEN_OBSERVABLE',
  'CHANNEL_CALL_OBSERVABLE',
  'LEAVE_ATTEMPT',
  'LEAVE_CONFIRMED',
  'LEAVE_CANCELLED',
] as const;
export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];

export interface ClientSignal {
  eventType: ClientEventType;
  /** Monotônico local no momento do evento: mede tempo DECORRIDO desde o início local (não é timestamp do servidor). */
  clientMonoMs: number;
  processInstanceId: string;
  bootId: string;
  /** Telemetria (Android ApplicationExitInfo). Não decide nada em V1. */
  processExit?: { at: string; kind: string };
}

export interface WireEvent {
  event_type: ClientEventType;
  client_mono_ms: number;
  process_instance_id: string;
  boot_id: string;
  process_exit?: { at: string; kind: string };
}

/**
 * Estratégia em duas camadas (não basta uma lista de strings):
 *  1. ALLOWLIST ESTRITA da forma do payload (`assertReconcilePayloadShape`): qualquer chave fora do conjunto
 *     permitido é rejeitada — inclusive nomes que ninguém previu (`should_credit`, `success`, `verdict`...).
 *  2. TRIPWIRE por radicais (`looksLikeAuthorityKey`): detecta nomes que, SE fossem adicionados à allowlist por
 *     engano, conferiam autoridade. Os testes garantem que nenhuma chave permitida casa com o tripwire.
 * O servidor aplica a mesma allowlist (`private.ingest_events`).
 */
export const ALLOWED_EVENT_KEYS = [
  'event_type',
  'client_mono_ms',
  'process_instance_id',
  'boot_id',
  'process_exit',
] as const;
export const ALLOWED_PROCESS_EXIT_KEYS = ['at', 'kind'] as const;
export const ALLOWED_PAYLOAD_KEYS = ['p_execution_id', 'p_events'] as const;

const AUTHORITY_STEMS =
  /(complet|reward|point|credit|award|grant|payout|bonus|amount|balance|ledger|state|status|reason|verdict|valid|verif|eligib|success|result|approv|authoriz|finish|done|outcome|decision|endsat|startedat|servernow|should|allow|permit|accept|confirm|claim)/;

/** Normaliza (minúsculas, sem separadores) e procura radicais de autoridade. */
export function looksLikeAuthorityKey(key: string): boolean {
  return AUTHORITY_STEMS.test(key.toLowerCase().replace(/[^a-z0-9]/g, ''));
}

/** Compatibilidade: varredura profunda com o tripwire (usada em testes e como defesa extra). */
export function assertNoAuthorityFields(value: unknown, path = '$'): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoAuthorityFields(v, `${path}[${i}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (looksLikeAuthorityKey(key)) {
        throw new Error(`Client payload must not carry authority-like field "${key}" at ${path}`);
      }
      assertNoAuthorityFields(v, `${path}.${key}`);
    }
  }
}

function assertKeys(obj: unknown, allowed: readonly string[], path: string): asserts obj is Record<string, unknown> {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) throw new Error(`${path} must be an object`);
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) throw new Error(`Client payload has a field outside the allowlist: "${key}" at ${path}`);
  }
}

/** Forma exata do payload de `reconcile_task`: nada fora da allowlist atravessa. */
export function assertReconcilePayloadShape(payload: unknown): void {
  assertKeys(payload, ALLOWED_PAYLOAD_KEYS, '$');
  const events = (payload as Record<string, unknown>).p_events;
  if (!Array.isArray(events)) throw new Error('$.p_events must be an array');
  events.forEach((e, i) => {
    assertKeys(e, ALLOWED_EVENT_KEYS, `$.p_events[${i}]`);
    const exit = (e as Record<string, unknown>).process_exit;
    if (exit !== undefined) assertKeys(exit, ALLOWED_PROCESS_EXIT_KEYS, `$.p_events[${i}].process_exit`);
  });
}

/** Cópia EXPLÍCITA campo a campo: nada entra no fio por acidente. */
export function toWireEvent(s: ClientSignal): WireEvent {
  if (!(CLIENT_EVENT_TYPES as readonly string[]).includes(s.eventType)) {
    throw new Error(`Unknown event type: ${s.eventType}`);
  }
  if (!Number.isFinite(s.clientMonoMs) || s.clientMonoMs < 0) throw new RangeError('clientMonoMs invalid');
  if (!s.processInstanceId || !s.bootId) throw new Error('identity (process/boot) is required');

  const wire: WireEvent = {
    event_type: s.eventType,
    client_mono_ms: Math.trunc(s.clientMonoMs),
    process_instance_id: s.processInstanceId,
    boot_id: s.bootId,
  };
  if (s.processExit) wire.process_exit = { at: s.processExit.at, kind: s.processExit.kind };
  return wire;
}

export interface ReconcilePayload {
  p_execution_id: string;
  p_events: WireEvent[];
}

export const MAX_EVENTS_PER_BATCH = 200;

/** Payload de `reconcile_task`: SOMENTE id da execução e sinais. Sem parâmetro de conclusão. */
export function buildReconcilePayload(executionId: string, signals: readonly ClientSignal[]): ReconcilePayload {
  if (signals.length < 1 || signals.length > MAX_EVENTS_PER_BATCH) {
    throw new RangeError(`events per batch must be 1..${MAX_EVENTS_PER_BATCH}`);
  }
  const payload: ReconcilePayload = {
    p_execution_id: executionId,
    p_events: signals.map(toWireEvent),
  };
  assertReconcilePayloadShape(payload);
  assertNoAuthorityFields(payload);
  return payload;
}
