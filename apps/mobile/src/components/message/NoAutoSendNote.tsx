import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

/** Nhắc rõ: ứng dụng không tự gửi gì cho chủ nhà. */
export function NoAutoSendNote() {
  return (
    <View style={styles.note} accessible accessibilityRole="text">
      <Ionicons name="hand-left-outline" size={22} color={colors.primary} />
      <View style={styles.text}>
        <AppText variant="bodyStrong" color={colors.primary}>
          Bạn tự xem lại và gửi.
        </AppText>
        <AppText variant="caption" color={colors.text}>
          Ứng dụng không tự gửi gì cho chủ nhà. Bạn sao chép hoặc chia sẻ sang Zalo, đọc lại rồi tự
          bấm gửi.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  text: { flex: 1, gap: spacing.xs },
});
