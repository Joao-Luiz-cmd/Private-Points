import type { RawEvent } from '../absence';
import { ABSENCE_ORDERING_TOLERANCE_MS, absenceVerdict } from '../absence';

const D = 1_800_000; // 30 min
const both: RawEvent[] = [
  { type: 'CHANNEL_SCREEN_OBSERVABLE', elapsedMs: 0 },
  { type: 'CHANNEL_CALL_OBSERVABLE', elapsedMs: 0 },
];
const ev = (type: RawEvent['type'], elapsedMs: number): RawEvent => ({ type, elapsedMs });

describe('classificação de ausências — decidida pelo SERVIDOR a partir de sinais brutos', () => {
  it('sem ausência: OK', () => {
    expect(absenceVerdict(both, D)).toBe('OK');
  });

  it('bloqueio de tela corroborado por SCREEN_LOCKED próximo: compatível (OK)', () => {
    expect(absenceVerdict([...both, ev('BACKGROUND', 600_000), ev('SCREEN_LOCKED', 600_400)], D)).toBe('OK');
    expect(absenceVerdict([...both, ev('SCREEN_LOCKED', 599_000), ev('BACKGROUND', 600_000)], D)).toBe('OK');
  });

  it('ligação ativa quando o app vai para background: compatível (D01)', () => {
    expect(absenceVerdict([...both, ev('CALL_STARTED', 590_000), ev('BACKGROUND', 600_000)], D)).toBe('OK');
    expect(absenceVerdict([...both, ev('BACKGROUND', 600_000), ev('CALL_STARTED', 601_000)], D)).toBe('OK'); // toque chega logo depois
  });

  it('ligação que JÁ TERMINOU antes do background não explica a ausência', () => {
    const r = absenceVerdict([...both, ev('CALL_STARTED', 100_000), ev('CALL_ENDED', 200_000), ev('BACKGROUND', 600_000)], D);
    expect(r).toBe('LEFT_APP');
  });

  it('Home/troca de app com os dois canais disponíveis e sem corroboração: LEFT_APP (INTERRUPTED)', () => {
    expect(absenceVerdict([...both, ev('BACKGROUND', 600_000)], D)).toBe('LEFT_APP');
  });

  it('canal de tela indisponível (ex.: iOS sem o sinal): não dá para excluir bloqueio ⇒ UNATTRIBUTED (UNVERIFIED)', () => {
    expect(absenceVerdict([ev('CHANNEL_CALL_OBSERVABLE', 0), ev('BACKGROUND', 600_000)], D)).toBe('UNATTRIBUTED');
  });

  it('canal de ligação indisponível: não dá para excluir ligação ⇒ UNATTRIBUTED', () => {
    expect(absenceVerdict([ev('CHANNEL_SCREEN_OBSERVABLE', 0), ev('BACKGROUND', 600_000)], D)).toBe('UNATTRIBUTED');
  });

  it('o cliente NÃO consegue melhorar o resultado declarando que o canal não existe (pior para ele ou igual)', () => {
    const honest = absenceVerdict([...both, ev('BACKGROUND', 600_000)], D); // LEFT_APP => INTERRUPTED
    const lying = absenceVerdict([ev('BACKGROUND', 600_000)], D); // sem canais => UNATTRIBUTED => UNVERIFIED
    expect(honest).toBe('LEFT_APP');
    expect(lying).toBe('UNATTRIBUTED');
    expect(lying === 'OK').toBe(false); // nenhuma das duas credita
  });

  it('ausência depois do fim não invalida', () => {
    expect(absenceVerdict([...both, ev('BACKGROUND', D + 5_000)], D)).toBe('OK');
  });

  it('LEFT_APP tem precedência sobre UNATTRIBUTED e basta uma ausência ruim', () => {
    const events = [...both, ev('BACKGROUND', 100_000), ev('SCREEN_LOCKED', 100_100), ev('BACKGROUND', 900_000)];
    expect(absenceVerdict(events, D)).toBe('LEFT_APP');
  });

  it('a tolerância de ordenação é técnica e pequena', () => {
    expect(ABSENCE_ORDERING_TOLERANCE_MS).toBe(3_000);
    expect(absenceVerdict([...both, ev('BACKGROUND', 600_000), ev('SCREEN_LOCKED', 600_000 + 3_001)], D)).toBe('LEFT_APP');
  });

  it('o resultado nunca é "completo": só decide tolerância; COMPLETED vem de outras regras no servidor', () => {
    const outcomes = new Set(['OK', 'LEFT_APP', 'UNATTRIBUTED']);
    expect(outcomes.has(absenceVerdict(both, D))).toBe(true);
  });
});
