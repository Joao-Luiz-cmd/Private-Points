import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { resolveAccessRoute } from '@/domain/access/route';
import { PlaceholderScreen } from '@/screens/PlaceholderScreen';
import { useSessionStore } from '@/state/sessionStore';
import { colors } from '@/theme';
import { AuthStack } from './AuthStack';
import { MainStack } from './MainStack';
import { OnboardingStack } from './OnboardingStack';
import type { RootParamList } from './types';

const Stack = createNativeStackNavigator<RootParamList>();

/**
 * Grafos separados (spec 43). Só existe UM grafo montado por vez, decidido por `resolveAccessRoute`
 * (estado derivado do servidor). Telas protegidas nem existem na árvore sem acesso ACTIVE — e, mesmo
 * que existissem, RLS/RPC negariam os dados (defesa em profundidade).
 */
export function RootNavigator() {
  const access = useSessionStore((s) => s.access);
  const route = resolveAccessRoute(access);

  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg.base } }}
    >
      {route === 'Splash' && (
        <Stack.Screen name="Splash">{() => <PlaceholderScreen title="Carregando" phase={2} />}</Stack.Screen>
      )}
      {route === 'Auth' && <Stack.Screen name="Auth" component={AuthStack} />}
      {route === 'Onboarding' && <Stack.Screen name="Onboarding" component={OnboardingStack} />}
      {route === 'Main' && <Stack.Screen name="Main" component={MainStack} />}
    </Stack.Navigator>
  );
}
