/**
 * Các khoản chính của hợp đồng (tiền và thời gian). Mục không ghi hoặc ghi không rõ
 * được tô nền và có biểu tượng riêng, vì đó thường là chỗ dễ bị thiệt.
 */
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, type IconName } from '@/components/ui';
import { countTermsNeedingAttention, type KeyTermRow } from '@/lib/key-terms';
import { colors, radius, spacing } from '@/theme';

const attentionIcon: Record<'not_found' | 'unclear', IconName> = {
  not_found: 'remove-circle-outline',
  unclear: 'help-circle-outline',
};

function rowAccessibilityLabel(row: KeyTermRow): string {
  const parts = [`${row.label}: ${row.value}`];
  if (row.note) parts.push(row.note);
  if (row.rawText) parts.push(`Hợp đồng ghi: ${row.rawText}`);
  return parts.join('. ');
}

export function KeyTermsCard({ rows }: { rows: KeyTermRow[] }) {
  const attention = countTermsNeedingAttention(rows);
  return (
    <View style={styles.section}>
      <AppText variant="heading" accessibilityRole="header">
        Các khoản chính
      </AppText>
      <AppText variant="caption" color={colors.textMuted}>
        {attention > 0
          ? `${attention} khoản hợp đồng không ghi hoặc ghi chưa rõ. Bạn nên hỏi lại chủ nhà.`
          : 'Hợp đồng có ghi đủ các khoản này.'}
      </AppText>
      <Card style={styles.card}>
        {rows.map((row, index) => (
          <TermRow key={row.key} row={row} first={index === 0} />
        ))}
      </Card>
    </View>
  );
}

function TermRow({ row, first }: { row: KeyTermRow; first: boolean }) {
  if (row.status === 'found') {
    return (
      <View
        style={[styles.row, !first && styles.divider]}
        accessible
        accessibilityLabel={rowAccessibilityLabel(row)}
      >
        <View style={styles.line}>
          <AppText color={colors.textMuted} style={styles.label}>
            {row.label}
          </AppText>
          <AppText variant="bodyStrong" style={styles.value}>
            {row.value}
          </AppText>
        </View>
        {row.note ? (
          <AppText variant="caption" color={colors.textMuted} style={styles.valueNote}>
            {row.note}
          </AppText>
        ) : null}
      </View>
    );
  }

  return (
    <View
      style={[styles.row, styles.attention, !first && styles.attentionGap]}
      accessible
      accessibilityLabel={rowAccessibilityLabel(row)}
    >
      <View style={styles.line}>
        <View style={styles.labelWithIcon}>
          <Ionicons name={attentionIcon[row.status]} size={18} color={colors.warning} />
          <AppText variant="bodyStrong" style={styles.flexShrink}>
            {row.label}
          </AppText>
        </View>
        <AppText variant="bodyStrong" color={colors.warning} style={styles.value}>
          {row.value}
        </AppText>
      </View>
      {row.note ? (
        <AppText variant="caption" color={colors.text}>
          {row.note}
        </AppText>
      ) : null}
      {row.rawText ? (
        <AppText variant="caption" color={colors.textMuted}>
          Hợp đồng ghi: “{row.rawText}”
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  card: { paddingVertical: spacing.sm, gap: 0 },
  row: { paddingVertical: spacing.md, gap: spacing.xs },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  label: { flexShrink: 0 },
  labelWithIcon: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 0 },
  flexShrink: { flexShrink: 1 },
  value: { flex: 1, textAlign: 'right' },
  valueNote: { textAlign: 'right' },
  attention: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginHorizontal: -spacing.sm,
  },
  attentionGap: { marginTop: spacing.xs },
});
