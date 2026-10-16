export type RootParamList = {
  Splash: undefined;
  Auth: undefined;
  Onboarding: undefined;
  Main: undefined;
};

export type AuthParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  RecoverAccount: undefined;
};

export type OnboardingParamList = { ConfirmEmail: undefined };

export type MainParamList = {
  Home: undefined;
  Timer: undefined; // Timer Normal (Fase 6)
  Focus: undefined; // Modo Foco (Fase 7): sem botão voltar
  Account: undefined;
};
