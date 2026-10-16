import type { PropsWithChildren } from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors, fontSize, letterSpacing } from '@/theme';

type Variant = 'title' | 'body' | 'label';

export function HudText({ variant = 'body', children }: PropsWithChildren<{ variant?: Variant }>) {
  return <Text style={styles[variant]}>{children}</Text>;
}

const styles = StyleSheet.create({
  title: { color: colors.text.primary, fontSize: fontSize.title, fontWeight: '600' },
  body: { color: colors.text.secondary, fontSize: fontSize.body },
  label: {
    color: colors.accent.cyan,
    fontSize: fontSize.label,
    letterSpacing: letterSpacing.label,
    textTransform: 'uppercase',
  },
});
