import { View } from 'react-native';
import { HudText } from '@/components/HudText';
import { Screen } from '@/components/Screen';

/** Marcador de fase: cada tela real substitui este componente na fase indicada. */
export function PlaceholderScreen({ title, phase }: { title: string; phase: number }) {
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: 8 }}>
        <HudText variant="label">Private Points · V1</HudText>
        <HudText variant="title">{title}</HudText>
        <HudText>{`Implementação prevista na Fase ${phase}.`}</HudText>
      </View>
    </Screen>
  );
}
