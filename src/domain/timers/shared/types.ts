/** Vocabulário compartilhado pelos dois timers. Espelha `task_executions.state` e `state_reason_map` (database.md). */
export const SERVER_STATES = [
  'RUNNING',
  'COMPLETED',
  'CANCELLED',
  'INTERRUPTED',
  'UNVERIFIED',
  'EXPIRED',
  'FAILED',
] as const;
export type ServerState = (typeof SERVER_STATES)[number];
export type TerminalServerState = Exclude<ServerState, 'RUNNING'>;

/** Estados NÃO se misturam (D22): cada estado admite apenas os seus motivos. */
export const END_REASONS = {
  COMPLETED: ['COMPLETED'],
  CANCELLED: ['USER_CANCELLED'],
  INTERRUPTED: [
    'PROCESS_TERMINATED',
    'DEVICE_REBOOT',
    'FOCUS_LEFT_APP',
    'FOCUS_LEAVE_CONFIRMED',
    'SESSION_REVOKED',
    'LOGOUT',
    'ACCOUNT_DELETED',
  ],
  UNVERIFIED: ['CONTINUITY_UNVERIFIABLE', 'FOCUS_ABSENCE_UNATTRIBUTED'],
  EXPIRED: ['STALE_EXPIRED'],
  FAILED: ['SERVER_FAILURE'],
} as const satisfies Record<TerminalServerState, readonly string[]>;

export type EndReason = (typeof END_REASONS)[TerminalServerState][number];

export function isTerminalServerState(state: ServerState): state is TerminalServerState {
  return state !== 'RUNNING';
}

/** RUNNING exige motivo nulo; estados terminais exigem um motivo do próprio estado. */
export function isValidStateReason(state: ServerState, reason: string | null): boolean {
  if (state === 'RUNNING') return reason === null;
  if (reason === null) return false;
  return (END_REASONS[state] as readonly string[]).includes(reason);
}

/** Somente COMPLETED gera Points. UNVERIFIED, EXPIRED etc. NUNCA geram. */
export function grantsPoints(state: ServerState): boolean {
  return state === 'COMPLETED';
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly machine: 'NORMAL' | 'FOCUS',
    public readonly from: string,
    public readonly signal: string,
  ) {
    super(`[${machine}] invalid transition: ${from} --${signal}-->`);
    this.name = 'InvalidTransitionError';
  }
}
