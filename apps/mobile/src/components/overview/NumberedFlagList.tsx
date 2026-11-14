/**
 * Danh sách cảnh báo đánh số, khớp với số trên ảnh trang (PageMap).
 * Mỗi dòng chỉ có số (màu theo mức độ), tiêu đề và việc sinh viên đã quyết định.
 */
import { Ionicons } from '@expo/vector-icons';
import type { Flag } from '@rental/shared';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { severityLabel } from '@/lib/format';
import type { Decision } from '@/lib/store';
import { MIN_TOUCH, colors, severityColors, spacing } from '@/theme';

const decisionLabel: Record<Decision, string> = {
  pending: 'Chưa xem',
  kept: 'Đã giữ',
  dropped: 'Đã bỏ',
};

type Props = {
  /** Đã xếp theo thứ tự hiển thị (selectSortedFlags). */
  flags: Flag[];
  decisions: Record<string, Decision>;
  onOpen: (flag: Flag) => void;
};

export function NumberedFlagList({ flags, decisions, onOpen }: Props) {
  return (
    <View>
      {flags.map((flag, i) => {
        const decision = decisions[flag.id] ?? 'pending';
        const number = i + 1;
        return (
          <Pressable
            key={flag.id}
            onPress={() => onOpen(flag)}
            accessibilityRole="button"
            accessibilityLabel={`Điểm ${number}, ${severityLabel[flag.severity]}: ${flag.title}. ${decisionLabel[decision]}`}
            style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}
          >
            <View
              style={[styles.number, { backgroundColor: severityColors[flag.severity].fg }]}
            >
              <AppText variant="label" color={colors.textOnPrimary}>
                {number}
              </AppText>
            </View>
            <View style={styles.text}>
              <AppText>{flag.title}</AppText>
              {flag.type === 'missing' ? (
                <AppText variant="caption" color={colors.textMuted}>
                  Hợp đồng không ghi
                </AppText>
              ) : null}
            </View>
            {decision === 'kept' ? (
              <Ionicons name="bookmark" size={18} color={colors.primary} />
            ) : decision === 'dropped' ? (
              <AppText variant="caption" color={colors.textMuted}>
                Đã bỏ
              </AppText>
            ) : (
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH + spacing.sm,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { opacity: 0.6 },
  number: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
});
