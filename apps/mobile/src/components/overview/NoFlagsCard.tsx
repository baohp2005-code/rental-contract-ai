import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { colors, spacing } from '@/theme';

/** Màn "Kết quả" khi AI không thấy điểm nào cần hỏi lại. */
export function NoFlagsCard() {
  return (
    <Card>
      <View style={styles.title}>
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
  title: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
