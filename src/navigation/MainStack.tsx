import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PlaceholderScreen } from '@/screens/PlaceholderScreen';
import type { MainParamList } from './types';

const Stack = createNativeStackNavigator<MainParamList>();

export function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home">{() => <PlaceholderScreen title="Home" phase={4} />}</Stack.Screen>
      <Stack.Screen name="Timer">{() => <PlaceholderScreen title="Estudo" phase={6} />}</Stack.Screen>
      {/* Modo Foco: sem gesto de voltar nem botão voltar (spec 23). O aviso de saída entra na Fase 7. */}
      <Stack.Screen name="Focus" options={{ gestureEnabled: false }}>
        {() => <PlaceholderScreen title="Estudo - Modo Foco" phase={7} />}
      </Stack.Screen>
      <Stack.Screen name="Account">{() => <PlaceholderScreen title="Conta" phase={3} />}</Stack.Screen>
    </Stack.Navigator>
  );
}
