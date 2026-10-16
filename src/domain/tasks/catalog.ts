/**
 * Identificadores das tarefas V1 (spec 17). Duração e recompensa NÃO são duplicadas aqui:
 * a fonte é `task_definitions` no servidor, lida via RLS.
 */
export const TASK_CODES = { STUDY_NORMAL: 'STUDY_NORMAL', STUDY_FOCUS: 'STUDY_FOCUS' } as const;
export type TaskCode = (typeof TASK_CODES)[keyof typeof TASK_CODES];

export type TimerKind = 'NORMAL' | 'FOCUS';

export const TASK_KIND: Record<TaskCode, TimerKind> = {
  STUDY_NORMAL: 'NORMAL',
  STUDY_FOCUS: 'FOCUS',
};
