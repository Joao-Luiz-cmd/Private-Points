/**
 * Redação defensiva para logs/telemetria (spec 36, 60, 61). A primeira defesa é NUNCA passar
 * segredos ao logger; esta função é a segunda.
 */
const SENSITIVE_KEY =
  /(password|passwd|senha|token|secret|authorization|api[_-]?key|refresh|cookie|jwt|otp|recovery[_-]?code|private[_-]?key|credential)/i;
const JWT_LIKE = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;

export const REDACTED = '[REDACTED]';
const MAX_DEPTH = 6;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED]';
  if (typeof value === 'string') return JWT_LIKE.test(value) ? REDACTED : value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}
