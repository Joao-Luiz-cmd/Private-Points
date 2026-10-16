/** Formata Points com separador de milhar pt-BR (1000 -> "1.000"). Só exibição; saldo é do servidor. */
export function formatPoints(value: number): string {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new RangeError('Points must be a finite integer');
  }
  const sign = value < 0 ? '-' : '';
  const digits = Math.abs(value).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
