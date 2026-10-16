import { formatPoints } from '../format';

describe('formatPoints', () => {
  it('formata com ponto de milhar', () => {
    expect(formatPoints(0)).toBe('0');
    expect(formatPoints(999)).toBe('999');
    expect(formatPoints(1000)).toBe('1.000');
    expect(formatPoints(1234567)).toBe('1.234.567');
  });
  it('rejeita valores não inteiros', () => {
    expect(() => formatPoints(1.5)).toThrow(RangeError);
    expect(() => formatPoints(Number.NaN)).toThrow(RangeError);
  });
});
