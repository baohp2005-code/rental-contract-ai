import type { Severity } from '@rental/shared';
import type { TextStyle } from 'react-native';

export const colors = {
  bg: '#F6F5F1',
  surface: '#FFFFFF',
  surfaceMuted: '#EFEDE6',
  border: '#E0DDD3',
  text: '#1B1F23',
  textMuted: '#5B636B',
  textOnPrimary: '#FFFFFF',
  primary: '#0F6E64',
  primaryPressed: '#0B564E',
  primarySoft: '#DDF0EC',
  danger: '#B3261E',
  dangerSoft: '#FBE9E7',
  warning: '#9A5B00',
  warningSoft: '#FFF1D6',
  info: '#365A7D',
  infoSoft: '#E4EDF6',
  success: '#1E6B3A',
  successSoft: '#E1F3E7',
  overlay: 'rgba(0,0,0,0.55)',
  /** Nền tối phía sau ảnh hợp đồng ở màn chi tiết, để ảnh nổi lên. */
  stage: '#2A2F33',
  textOnStage: '#FFFFFF',
  textOnStageMuted: '#C9CFD4',
} as const;

/** Màu theo mức độ cảnh báo. `highlight` dùng để tô dòng trên ảnh hợp đồng. */
export const severityColors: Record<
  Severity,
  { fg: string; bg: string; highlight: string; border: string }
> = {
  high: {
    fg: colors.danger,
    bg: colors.dangerSoft,
    highlight: 'rgba(214, 48, 39, 0.28)',
    border: '#D63027',
  },
  medium: {
    fg: colors.warning,
    bg: colors.warningSoft,
    highlight: 'rgba(240, 160, 0, 0.30)',
    border: '#E09600',
  },
  low: {
    fg: colors.info,
    bg: colors.infoSoft,
    highlight: 'rgba(54, 110, 170, 0.25)',
    border: '#3A76B0',
  },
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const typography = {
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700' },
  heading: { fontSize: 19, lineHeight: 26, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

/** Vùng chạm tối thiểu cho nút bấm. */
export const MIN_TOUCH = 48;
