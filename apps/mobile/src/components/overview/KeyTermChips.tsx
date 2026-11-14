/**
 * Các khoản chính của hợp đồng, gọn thành một dải chip cuộn ngang.
 * Mục không ghi hoặc ghi chưa rõ có nền vàng. Chạm vào dải để mở bảng đầy đủ (KeyTermsCard).
 */
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { countTermsNeedingAttention, type KeyTermRow } from '@/lib/key-terms';
import { colors, radius, spacing } from '@/theme';

const shortStatus: Record<'not_found' | 'unclear', string> = {
  not_found: 'không ghi',
  unclear: 'chưa rõ',
};

type Props = {
  rows: KeyTermRow[];
  expanded: boolean;
  onToggle: () => void;
};

export function KeyTermChips({ rows, expanded, onToggle }: Props) {
  const attention = countTermsNeedingAttention(rows);
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {rows.map((row) => {
          const ok = row.status === 'found';
          return (
            <Pressable
              key={row.key}
              onPress={onToggle}
              accessibilityRole="button"
              accessibilityLabel={`${row.label}: ${row.value}${row.note ? `. ${row.note}` : ''}`}
              accessibilityHint={expanded ? 'Thu gọn bảng các khoản' : 'Mở bảng các khoản đầy đủ'}
              style={({ pressed }) => [
                styles.chip,
                ok ? styles.chipOk : styles.chipAttention,
                pressed && styles.pressed,
              ]}
            >
              {ok ? (
                <>
                  <AppText variant="caption" color={colors.textMuted}>
                    {row.label}
                  </AppText>
                  <AppText variant="label">{row.value}</AppText>
                </>
              ) : (
                <>
                  <Ionicons name="help-circle-outline" size={16} color={colors.warning} />
                  <AppText variant="label" color={colors.warning}>
                    {row.label}: {shortStatus[row.status as 'not_found' | 'unclear']}
                  </AppText>
                </>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        hitSlop={spacing.xs}
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
      >
        <AppText variant="label" color={colors.primary}>
          {expanded
            ? 'Thu gọn các khoản'
            : attention > 0
              ? `Xem đủ các khoản (${attention} mục nên hỏi lại)`
              : 'Xem đủ các khoản'}
        </AppText>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.primary}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Kéo dải chip ra sát mép màn hình (bù lề của Screen) để cuộn ngang không bị cắt giữa chừng.
  wrap: { gap: spacing.xs, marginHorizontal: -spacing.lg },
  row:{ gap: spacing.sm, paddingHorizontal: spacing.lg },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chipOk: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipAttention: { backgroundColor: colors.warningSoft },
  pressed: { opacity: 0.7 },
  toggle: {
    alignSelf: 'flex-start',
    minHeight: 36,
    marginHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
