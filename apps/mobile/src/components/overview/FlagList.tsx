/**
 * Danh sách cảnh báo ở màn "Kết quả", chia nhóm theo mức độ (nghiêm trọng nhất trước).
 * Mỗi dòng cho biết sinh viên đã quyết định gì với điểm đó.
 */
import { Ionicons } from '@expo/vector-icons';
import type { Flag } from '@rental/shared';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, SeverityBadge, TypeBadge, type IconName } from '@/components/ui';
import { flagTypeLabel, severityLabel, severityOrder } from '@/lib/format';
import type { Decision } from '@/lib/store';
import { colors, severityColors, spacing } from '@/theme';

const decisionView: Record<Decision, { label: string; icon: IconName; color: string }> = {
  pending: { label: 'Chưa xem', icon: 'ellipse-outline', color: colors.textMuted },
  kept: { label: 'Đã giữ', icon: 'checkmark-circle', color: colors.primary },
  dropped: { label: 'Đã bỏ', icon: 'close-circle-outline', color: colors.textMuted },
};

type FlagListProps = {
  /** Đã xếp theo mức độ (selectSortedFlags). */
  flags: Flag[];
  decisions: Record<string, Decision>;
  onOpen: (flag: Flag) => void;
};

export function FlagList({ flags, decisions, onOpen }: FlagListProps) {
  return (
    <View style={styles.list}>
      <AppText variant="heading" accessibilityRole="header">
        Các điểm cần xem
      </AppText>
      {severityOrder.map((severity) => {
        const group = flags.filter((f) => f.severity === severity);
        if (group.length === 0) return null;
        return (
          <View key={severity} style={styles.group}>
            <View style={styles.groupHeading} accessibilityRole="header">
              <View
                style={[styles.dot, { backgroundColor: severityColors[severity].border }]}
              />
              <AppText variant="bodyStrong" color={severityColors[severity].fg}>
                {severityLabel[severity]} ({group.length})
              </AppText>
            </View>
            {group.map((flag) => (
              <FlagRow
                key={flag.id}
                flag={flag}
                decision={decisions[flag.id] ?? 'pending'}
                onPress={() => onOpen(flag)}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
}

function FlagRow({
  flag,
  decision,
  onPress,
}: {
  flag: Flag;
  decision: Decision;
  onPress: () => void;
}) {
  const d = decisionView[decision];
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${severityLabel[flag.severity]}, ${flagTypeLabel[flag.type]}: ${flag.title}. ${d.label}`}
      style={[styles.row, { borderLeftColor: severityColors[flag.severity].border }]}
    >
      <View style={styles.badges}>
        <SeverityBadge severity={flag.severity} />
        <TypeBadge type={flag.type} />
      </View>
      <View style={styles.titleLine}>
        <AppText
          variant="bodyStrong"
          color={decision === 'dropped' ? colors.textMuted : colors.text}
          style={styles.title}
        >
          {flag.title}
        </AppText>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </View>
      <View style={styles.decision}>
        <Ionicons name={d.icon} size={16} color={d.color} />
        <AppText variant="label" color={d.color}>
          {d.label}
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  group: { gap: spacing.sm },
  groupHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  row: { borderLeftWidth: 4 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1 },
  decision: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
