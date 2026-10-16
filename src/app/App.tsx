import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from '@/navigation/RootNavigator';
import { useSessionStore } from '@/state/sessionStore';
import { colors } from '@/theme';

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg.base,
    card: colors.bg.panel,
    primary: colors.accent.cyan,
    text: colors.text.primary,
    border: colors.line,
    notification: colors.accent.blue,
  },
};

export function App() {
  const setAccess = useSessionStore((s) => s.setAccess);

  useEffect(() => {
    // Fase 1: sem autenticação. A Fase 2 troca isto por: restaurar sessão -> get_home -> AccessState.
    setAccess('SIGNED_OUT');
  }, [setAccess]);

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={navTheme}>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
