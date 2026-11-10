import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, type IconName } from '@/components/ui';
import { colors, spacing } from '@/theme';

/** Mẹo chụp, dùng chung cho màn chụp và khung camera. */
export const CAPTURE_TIPS: { icon: IconName; short: string; text: string }[] = [
  { icon: 'sunny-outline', short: 'Đủ sáng', text: 'Chụp nơi đủ sáng, tránh bóng tay đổ lên giấy.' },
  { icon: 'document-outline', short: 'Đặt phẳng', text: 'Đặt tờ giấy phẳng trên bàn.' },
  {
    icon: 'phone-portrait-outline',
    short: 'Chụp thẳng từ trên xuống',
    text: 'Cầm máy thẳng từ trên xuống, đừng chụp nghiêng.',
  },
  { icon: 'scan-outline', short: 'Lấy trọn trang', text: 'Lấy trọn cả trang, không cắt mất mép.' },
];

/** Thẻ mẹo chụp, hiện khi chưa có trang nào. */
export function CaptureTips() {
  return (
    <Card>
      <AppText variant="bodyStrong">Để app đọc được chữ</AppText>
      {CAPTURE_TIPS.map((tip) => (
        <View key={tip.short} style={styles.row}>
          <Ionicons name={tip.icon} size={20} color={colors.primary} />
          <AppText style={styles.text}>{tip.text}</AppText>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  text: { flex: 1 },
});
