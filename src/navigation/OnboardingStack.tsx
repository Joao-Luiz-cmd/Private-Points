import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PlaceholderScreen } from '@/screens/PlaceholderScreen';
import type { OnboardingParamList } from './types';

const Stack = createNativeStackNavigator<OnboardingParamList>();

export function OnboardingStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ConfirmEmail">{() => <PlaceholderScreen title="Confirme seu e-mail" phase={2} />}</Stack.Screen>
    </Stack.Navigator>
  );
}
