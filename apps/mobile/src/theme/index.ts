import { useColorScheme } from 'react-native';
import { useSettings } from '@/store/settings';

const palette = {
  dark: {
    bg: '#0E1116',
    surface: '#171B22',
    surfaceHigh: '#20252E',
    border: '#2A303A',
    text: '#F2F4F7',
    textMuted: '#8C95A3',
    accent: '#5B8CFF',
    accentText: '#FFFFFF',
    success: '#3BCB86',
    warning: '#F5B544',
    danger: '#F06A6A',
  },
  light: {
    bg: '#F6F7F9',
    surface: '#FFFFFF',
    surfaceHigh: '#EEF0F3',
    border: '#DDE1E7',
    text: '#12151A',
    textMuted: '#5F6876',
    accent: '#2F66F5',
    accentText: '#FFFFFF',
    success: '#1F9E62',
    warning: '#B97A0B',
    danger: '#D14343',
  },
} as const;

export type Colors = { [K in keyof (typeof palette)['dark']]: string };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;
export const type = {
  title: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.4 },
  heading: { fontSize: 20, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  label: { fontSize: 14, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '500' as const, letterSpacing: 0.4 },
};

export function useTheme() {
  const system = useColorScheme();
  const pref = useSettings((s) => s.theme);
  const scheme = pref === 'system' ? (system === 'light' ? 'light' : 'dark') : pref;
  return { scheme, colors: palette[scheme] as Colors, space, radius, type };
}
