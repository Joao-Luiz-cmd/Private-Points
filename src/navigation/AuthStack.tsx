import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PlaceholderScreen } from '@/screens/PlaceholderScreen';
import type { AuthParamList } from './types';

const Stack = createNativeStackNavigator<AuthParamList>();

export function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login">{() => <PlaceholderScreen title="Entrar" phase={2} />}</Stack.Screen>
      <Stack.Screen name="Register">{() => <PlaceholderScreen title="Criar conta" phase={2} />}</Stack.Screen>
      <Stack.Screen name="ForgotPassword">{() => <PlaceholderScreen title="Esqueci minha senha" phase={2} />}</Stack.Screen>
      <Stack.Screen name="RecoverAccount">{() => <PlaceholderScreen title="Recuperar conta" phase={3} />}</Stack.Screen>
    </Stack.Navigator>
  );
}
