import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText, type IconName } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

export type NoticeTone = 'info' | 'warning' | 'danger' | 'success';

const tones: Record<NoticeTone, { fg: string; bg: string; icon: IconName }> = {
  info: { fg: colors.info, bg: colors.infoSoft, icon: 'information-circle-outline' },
  warning: { fg: colors.warning, bg: colors.warningSoft, icon: 'alert-circle-outline' },
  danger: { fg: colors.danger, bg: colors.dangerSoft, icon: 'warning-outline' },
  success: { fg: colors.success, bg: colors.successSoft, icon: 'checkmark-circle-outline' },
};

type NoticeProps = {
  tone: NoticeTone;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Ô ghi chú nhỏ để nhắc hoặc báo lỗi ngay trong màn hình. */
export function Notice({ tone, children, style }: NoticeProps) {
  const t = tones[tone];
  return (
    <View
      accessible
      accessibilityRole={tone === 'danger' ? 'alert' : 'text'}
      accessibilityLiveRegion="polite"
      style={[styles.notice, { backgroundColor: t.bg }, style]}
    >
      <Ionicons name={t.icon} size={20} color={t.fg} />
      <AppText variant="caption" color={t.fg} style={styles.text}>
        {children}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  text: { flex: 1 },
});
