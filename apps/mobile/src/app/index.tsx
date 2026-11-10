import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, Card, Disclaimer, Screen, type IconName } from '@/components/ui';
import { useAppStore } from '@/lib/store';
import { MIN_TOUCH, colors, radius, spacing } from '@/theme';

const STEPS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'camera-outline',
    title: 'Chụp hợp đồng',
    text: 'Chụp từng trang, bản in hay viết tay đều được.',
  },
  {
    icon: 'search-outline',
    title: 'Xem điểm đáng lo',
    text: 'App chỉ ra điều khoản có rủi ro, còn thiếu hoặc nói chưa rõ, và tô đúng dòng đó trên ảnh.',
  },
  {
    icon: 'chatbubble-ellipses-outline',
    title: 'Hỏi lại chủ nhà',
    text: 'App soạn sẵn câu hỏi để bạn hỏi trước khi ký. Gửi hay không là do bạn, app không tự gửi gì.',
  },
];

/** Điều bạn đồng ý khi dùng app. Viết đúng với cách app đang chạy, không hứa thêm. */
const DATA_POINTS = [
  'Ảnh hợp đồng bạn chụp hoặc chọn sẽ được gửi lên máy chủ của app và dịch vụ AI để đọc chữ và phân tích.',
  'Trên điện thoại, app chỉ giữ ảnh và kết quả trong lúc đang mở. Tắt app là danh sách ảnh và kết quả mất.',
  'Ảnh chụp trong app không được lưu vào thư viện ảnh của bạn. Tệp ảnh tạm có thể còn trong bộ nhớ đệm của app cho tới khi máy tự dọn.',
];

export default function IntroScreen() {
  const insets = useSafeAreaInsets();
  const hydrated = useAppStore((s) => s.hydrated);
  const consentAccepted = useAppStore((s) => s.consentAccepted);
  const [checked, setChecked] = useState(false);

  // Chờ đọc xong lựa chọn đã lưu để không nhấp nháy ô đồng ý với người dùng cũ.
  if (!hydrated) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} accessibilityLabel="Đang mở ứng dụng" />
      </View>
    );
  }

  const canContinue = consentAccepted || checked;

  const start = () => {
    if (!canContinue) return;
    if (!consentAccepted) useAppStore.getState().acceptConsent();
    router.push('/capture');
  };

  const footer = (
    <Button
      title={consentAccepted ? 'Chụp hợp đồng' : 'Đồng ý và bắt đầu'}
      icon="camera-outline"
      onPress={start}
      disabled={!canContinue}
      accessibilityHint={
        canContinue ? 'Mở màn chụp hợp đồng' : 'Đánh dấu ô đồng ý ở trên trước khi bắt đầu'
      }
    />
  );

  return (
    <Screen footer={footer} style={{ paddingTop: insets.top + spacing.xl }}>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Ionicons name="document-text-outline" size={36} color={colors.primary} />
        </View>
        <AppText variant="title" accessibilityRole="header">
          Soi Hợp Đồng Trọ
        </AppText>
        <AppText color={colors.textMuted}>
          Chụp hợp đồng thuê trọ, app chỉ cho bạn những điều khoản đáng lo trước khi ký và cọc tiền.
        </AppText>
      </View>

      <View style={styles.steps}>
        {STEPS.map((step, index) => (
          <View key={step.title} style={styles.step}>
            <View style={styles.stepIcon}>
              <Ionicons name={step.icon} size={22} color={colors.primary} />
            </View>
            <View style={styles.stepText}>
              <AppText variant="bodyStrong">
                {index + 1}. {step.title}
              </AppText>
              <AppText variant="caption" color={colors.textMuted}>
                {step.text}
              </AppText>
            </View>
          </View>
        ))}
      </View>

      <Disclaimer />

      <Card>
        <View style={styles.cardTitle}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.text} />
          <AppText variant="bodyStrong">Ảnh của bạn được xử lý thế nào</AppText>
        </View>
        {DATA_POINTS.map((point) => (
          <View key={point} style={styles.bullet}>
            <AppText variant="caption" color={colors.textMuted}>
              •
            </AppText>
            <AppText variant="caption" color={colors.textMuted} style={styles.bulletText}>
              {point}
            </AppText>
          </View>
        ))}

        {consentAccepted ? (
          <View style={styles.accepted}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <AppText variant="caption" color={colors.success} style={styles.bulletText}>
              Bạn đã đồng ý cho app xử lý ảnh hợp đồng như trên.
            </AppText>
          </View>
        ) : (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel="Tôi đã đọc và đồng ý để app gửi ảnh hợp đồng đi phân tích như trên"
            onPress={() => setChecked((c) => !c)}
            style={({ pressed }) => [styles.checkbox, pressed && styles.checkboxPressed]}
          >
            <Ionicons
              name={checked ? 'checkbox' : 'square-outline'}
              size={26}
              color={checked ? colors.primary : colors.textMuted}
            />
            <AppText style={styles.bulletText}>
              Tôi đã đọc và đồng ý để app gửi ảnh hợp đồng đi phân tích như trên.
            </AppText>
          </Pressable>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  hero: { gap: spacing.sm },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  steps: { gap: spacing.md },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { flex: 1, gap: 2 },
  cardTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bullet: { flexDirection: 'row', gap: spacing.sm },
  bulletText: { flex: 1 },
  accepted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH,
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginHorizontal: -spacing.sm,
    borderRadius: radius.md,
  },
  checkboxPressed: { backgroundColor: colors.surfaceMuted },
});
