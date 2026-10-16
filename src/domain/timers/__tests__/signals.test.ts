import type { ClientSignal } from '../shared/signals';
import {
  ALLOWED_EVENT_KEYS,
  ALLOWED_PAYLOAD_KEYS,
  ALLOWED_PROCESS_EXIT_KEYS,
  assertNoAuthorityFields,
  assertReconcilePayloadShape,
  buildReconcilePayload,
  looksLikeAuthorityKey,
  toWireEvent,
} from '../shared/signals';

const base: ClientSignal = {
  eventType: 'HEARTBEAT',
  clientMonoMs: 1_800_123.9,
  processInstanceId: '5f6a2b7c-0000-4000-8000-000000000001',
  bootId: 'boot-42',
};

describe('contrato cliente -> servidor (o cliente só envia sinais)', () => {
  it('o payload de reconcile contém somente id da execução e eventos', () => {
    const p = buildReconcilePayload('exec-1', [base]);
    expect(Object.keys(p).sort()).toEqual(['p_events', 'p_execution_id']);
    expect(p.p_events).toEqual([
      {
        event_type: 'HEARTBEAT',
        client_mono_ms: 1_800_123,
        process_instance_id: '5f6a2b7c-0000-4000-8000-000000000001',
        boot_id: 'boot-42',
      },
    ]);
  });

  it('nenhum campo de autoridade (completed/reward/points/state...) atravessa', () => {
    const tainted = { ...base, completed: true, reward: true, points: 200 } as unknown as ClientSignal;
    const wire = toWireEvent(tainted); // cópia explícita descarta o que não é da lista branca
    expect(Object.keys(wire).sort()).toEqual(['boot_id', 'client_mono_ms', 'event_type', 'process_instance_id']);
    for (const key of ['completed', 'reward', 'points', 'amount', 'state', 'end_reason', 'ends_at', 'server_now']) {
      expect(() => assertNoAuthorityFields({ p_events: [{ [key]: 1 }] })).toThrow('authority');
    }
    expect(() => assertNoAuthorityFields({ p_events: [{ Reward: true }] })).toThrow('authority');
  });

  it('não existe campo de classificação: `cause` é rejeitado pela allowlist e nunca é copiado para o fio', () => {
    const tainted = { ...base, eventType: 'BACKGROUND', cause: 'SCREEN_LOCK' } as unknown as ClientSignal;
    const wire = toWireEvent(tainted);
    expect('cause' in wire).toBe(false);
    for (const k of ['cause', 'reason', 'kind', 'source', 'type', 'event_kind', 'status', 'category', 'classification']) {
      expect(() =>
        assertReconcilePayloadShape({ p_execution_id: 'e', p_events: [{ event_type: 'BACKGROUND', [k]: 'PHONE_CALL' }] }),
      ).toThrow('allowlist');
    }
  });

  it('sinais brutos de observação (tela, ligação, capacidade) usam só o tipo de evento, sem interpretação', () => {
    for (const t of ['SCREEN_LOCKED', 'CALL_STARTED', 'CALL_ENDED', 'CHANNEL_SCREEN_OBSERVABLE', 'CHANNEL_CALL_OBSERVABLE'] as const) {
      expect(Object.keys(toWireEvent({ ...base, eventType: t })).sort()).toEqual([
        'boot_id', 'client_mono_ms', 'event_type', 'process_instance_id',
      ]);
    }
  });

  it('exige identidade e monotônico válidos e tipo conhecido', () => {
    expect(() => toWireEvent({ ...base, processInstanceId: '' })).toThrow('identity');
    expect(() => toWireEvent({ ...base, clientMonoMs: -1 })).toThrow(RangeError);
    expect(() => toWireEvent({ ...base, eventType: 'COMPLETED' as never })).toThrow('Unknown event type');
  });

  it('limita o tamanho do lote', () => {
    expect(() => buildReconcilePayload('e', [])).toThrow(RangeError);
    expect(() => buildReconcilePayload('e', Array.from({ length: 201 }, () => base))).toThrow(RangeError);
    expect(buildReconcilePayload('e', Array.from({ length: 200 }, () => base)).p_events.length).toBe(200);
  });

  it('process_exit é telemetria e só passa com a forma esperada', () => {
    const w = toWireEvent({ ...base, processExit: { at: '2026-10-01T10:00:00Z', kind: 'USER_REQUESTED' } });
    expect(w.process_exit).toEqual({ at: '2026-10-01T10:00:00Z', kind: 'USER_REQUESTED' });
  });
});

/** Nomes EQUIVALENTES (indiretos) que dariam ao cliente o controle da decisão. */
const EQUIVALENTS = [
  'should_credit', 'shouldCredit', 'success', 'succeeded', 'completion_status', 'completionStatus', 'is_complete',
  'finished', 'done', 'verdict', 'is_valid', 'valid', 'verified', 'eligible', 'grant', 'granted', 'award', 'payout',
  'bonus', 'credit', 'credits', 'result', 'outcome', 'decision', 'approved', 'authorized', 'authorize', 'allow_reward',
  'confirm_completion', 'claim_reward', 'claimed', 'final_state', 'new_status', 'balance_delta', 'delta_points', 'xp',
];

describe('campos equivalentes/indiretos de autoridade', () => {
  it('o tripwire por radicais pega os equivalentes (exceto nomes realmente exóticos, que a allowlist barra)', () => {
    const caught = EQUIVALENTS.filter(looksLikeAuthorityKey);
    const missed = EQUIVALENTS.filter((k) => !looksLikeAuthorityKey(k));
    // `xp` e `delta_points`/`balance_delta` etc.: o que o tripwire não pega, a ALLOWLIST estrita barra (teste abaixo).
    expect(caught.length >= EQUIVALENTS.length - 2).toBe(true);
    for (const k of missed) {
      expect(() => assertReconcilePayloadShape({ p_execution_id: 'e', p_events: [{ event_type: 'HEARTBEAT', [k]: 1 }] })).toThrow('allowlist');
    }
  });

  it('a ALLOWLIST rejeita QUALQUER chave fora do conjunto, inclusive as que ninguém previu', () => {
    for (const k of [...EQUIVALENTS, 'foo', 'x', 'meta', 'extra']) {
      expect(() =>
        assertReconcilePayloadShape({ p_execution_id: 'e', p_events: [{ event_type: 'HEARTBEAT', [k]: 1 }] }),
      ).toThrow('allowlist');
      expect(() => assertReconcilePayloadShape({ p_execution_id: 'e', p_events: [], [k]: 1 })).toThrow('allowlist');
    }
    expect(() =>
      assertReconcilePayloadShape({ p_execution_id: 'e', p_events: [{ event_type: 'HEARTBEAT', process_exit: { at: 'x', kind: 'y', ok: true } }] }),
    ).toThrow('allowlist');
  });

  it('NENHUMA chave permitida casa com o tripwire (senão uma chave de autoridade teria sido permitida)', () => {
    for (const k of [...ALLOWED_EVENT_KEYS, ...ALLOWED_PROCESS_EXIT_KEYS, ...ALLOWED_PAYLOAD_KEYS]) {
      expect(looksLikeAuthorityKey(k)).toBe(false);
    }
  });

  it('payload legítimo passa nas duas camadas', () => {
    const p = buildReconcilePayload('exec-1', [{ ...base, eventType: 'BACKGROUND' }]);
    expect(() => assertReconcilePayloadShape(p)).not.toThrow();
    expect(() => assertNoAuthorityFields(p)).not.toThrow();
  });
});
