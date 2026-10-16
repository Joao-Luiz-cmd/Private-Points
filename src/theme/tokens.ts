/** Design system próprio do Private Points (spec 37–38): escuro, cyber-HUD, geométrico. Sem glow exagerado. */
export const colors = {
  bg: { base: '#080a0f', deep: '#0a0a0c', panel: '#12161f' },
  accent: { cyan: '#00f0ff', sky: '#00a8ff', blue: '#0055ff' },
  green: { military: '#4b5d3a', digital: '#2be38a', emerald: '#10b981' },
  text: { primary: '#ffffff', secondary: '#c9d1dc', technical: '#7d8a9c' },
  detail: { gold: '#d4a24c', orange: '#ff8a3d' }, // uso moderado
  line: '#1f2733',
  danger: '#ff4d5e',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

/** Geometria angular: cantos quase retos. */
export const radius = { none: 0, sm: 2, md: 4 } as const;

export const fontSize = { label: 11, body: 15, subtitle: 18, title: 24, display: 56 } as const;

export const letterSpacing = { label: 1.6, display: 4 } as const;
