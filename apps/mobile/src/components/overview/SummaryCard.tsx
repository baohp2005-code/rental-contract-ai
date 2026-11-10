/**
 * Phần đầu màn "Kết quả": có bao nhiêu điểm nên xem, chia theo mức độ, và đã xem được bao nhiêu.
 */
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { severityLabel, severityOrder } from '@/lib/format';
import type { ReviewProgress } from '@/lib/store';
import { colors, radius, severityColors, spacing } from '@/theme';

export function SummaryCard({ progress }: { progress: ReviewProgress }) {
  if (progress.total === 0) return <NoFlagsCard />;

  const reviewed = progress.kept + progress.dropped;
  const counts = severityOrder.filter((s) => progress.bySeverity[s] > 0);

  return (
    <Card>
      <AppText variant="heading" accessibilityRole="header">
        Có {progress.total} điểm bạn nên xem kỹ
      </AppText>
      <View style={styles.chips}>
        {counts.map((s) => (
          <View key={s} style={[styles.chip, { backgroundColor: severityColors[s].bg }]}>
            <AppText variant="label" color={severityColors[s].fg}>
              {progress.bySeverity[s]} {severityLabel[s]}
            </AppText>
          </View>
        ))}
      </View>
      <AppText color={colors.textMuted}>
        Đây là những chỗ nên hỏi lại chủ nhà trước khi ký. Không phải điểm nào cũng là vấn đề lớn.
        Bạn xem từng điểm rồi tự quyết nhé.
      </AppText>

      <View
        style={styles.progress}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Đã xem ${reviewed} trên ${progress.total} điểm`}
        accessibilityValue={{ min: 0, max: progress.total, now: reviewed }}
      >
        <View style={styles.progressText}>
          <AppText variant="bodyStrong">
            Đã xem {reviewed}/{progress.total}
          </AppText>
          {reviewed > 0 ? (
            <AppText variant="caption" color={colors.textMuted}>
              Giữ {progress.kept} · Bỏ {progress.dropped}
            </AppText>
          ) : null}
        </View>
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: `${Math.round((reviewed / progress.total) * 100)}%` },
            ]}
          />
        </View>
      </View>
    </Card>
  );
}

function NoFlagsCard() {
  return (
    <Card>
      <View style={styles.noFlagsTitle}>
        <Ionicons name="checkmark-circle-outline" size={28} color={colors.success} />
        <AppText variant="heading" accessibilityRole="header" style={styles.flex}>
          AI chưa thấy điểm nào cần hỏi lại
        </AppText>
      </View>
      <AppText color={colors.textMuted}>
        Trong những điều AI đã kiểm tra, hợp đồng này chưa có điểm đáng lo. AI vẫn có thể bỏ sót,
        nên bạn vẫn đọc kỹ hợp đồng trước khi ký nhé.
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  progress: { gap: spacing.sm, marginTop: spacing.sm },
  progressText: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primary },
  noFlagsTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
