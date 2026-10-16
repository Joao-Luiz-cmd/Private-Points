/** Estado de acesso derivado do SERVIDOR (get_home / sessão). O guard visual só reflete esse resultado. */
export type AccessState = 'LOADING' | 'SIGNED_OUT' | 'PENDING_EMAIL' | 'SESSION_REJECTED' | 'ACTIVE';
export type AccessRoute = 'Splash' | 'Auth' | 'Onboarding' | 'Main';

export function resolveAccessRoute(state: AccessState): AccessRoute {
  switch (state) {
    case 'LOADING':
      return 'Splash';
    case 'ACTIVE':
      return 'Main';
    case 'PENDING_EMAIL':
      return 'Onboarding';
    case 'SIGNED_OUT':
    case 'SESSION_REJECTED':
      return 'Auth';
    default:
      return 'Auth'; // falha fechada: estado inesperado nunca abre o app principal
  }
}
