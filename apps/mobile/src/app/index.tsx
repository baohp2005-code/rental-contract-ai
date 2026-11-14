/**
 * Màn 1: giới thiệu, bố cục "hình trước, chữ sau".
 *
 * Hình minh họa (trang hợp đồng có dòng được tô) nói thay phần giải thích các bước.
 * Cách xử lý ảnh nằm trong một ngăn riêng; lần đầu bấm ô đồng ý, ngăn này tự mở
 * để người dùng đọc trước khi đồng ý.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, Disclaimer, Screen } from '@/components/ui';
import { useAppStore } from '@/lib/store';
import { useStatusBarStyle } from '@/lib/use-status-bar';
import { MIN_TOUCH, colors, radius, severityColors, spacing } from '@/theme';

/** Điều bạn đồng ý khi dùng app. Viết đúng với cách app đang chạy, không hứa thêm. */
const DATA_POINTS = [
  'Ảnh hợp đồng bạn chụp hoặc chọn sẽ được gửi lên máy chủ của app và dịch vụ AI để đọc chữ và phân tích.',
  'Trên điện thoại, app chỉ giữ ảnh và kết quả trong lúc đang mở. Tắt app là danh sách ảnh và kết quả mất.',
  'Ảnh chụp trong app không được lưu vào thư viện ảnh của bạn. Tệp ảnh tạm có thể còn trong bộ nhớ đệm của app cho tới khi máy tự dọn.',
];

export default function IntroScreen() {
  const insets = useSafeAreaInsets();
  useStatusBarStyle('light');
  const hydrated = useAppStore((s) => s.hydrated);
  const consentAccepted = useAppStore((s) => s.consentAccepted);
  const [checked, setChecked] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [privacySeen, setPrivacySeen] = useState(false);

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

  const openPrivacy = () => {
    setPrivacySeen(true);
    setPrivacyOpen(true);
  };

  const toggleConsent = () => {
    // Chưa đọc cách xử lý ảnh thì mở ra trước, đồng ý ngay trong ngăn đó.
    if (!checked && !privacySeen) {
      openPrivacy();
      return;
    }
    setChecked((c) => !c);
  };

  const footer = (
    <>
      {consentAccepted ? (
        <View style={styles.accepted}>
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          <AppText variant="caption" color={colors.success} style={styles.flex}>
            Bạn đã đồng ý cho app xử lý ảnh hợp đồng.{' '}
            <AppText variant="caption" color={colors.primary} onPress={openPrivacy}>
              Xem lại
            </AppText>
          </AppText>
        </View>
      ) : (
        <View style={styles.consentRow}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel="Tôi đã đọc và đồng ý để app gửi ảnh hợp đồng đi phân tích"
            accessibilityHint={privacySeen ? undefined : 'Mở phần giải thích cách xử lý ảnh'}
            onPress={toggleConsent}
            style={({ pressed }) => [styles.checkbox, pressed && styles.pressed]}
          >
            <Ionicons
              name={checked ? 'checkbox' : 'square-outline'}
              size={26}
              color={checked ? colors.primary : colors.textMuted}
            />
            <AppText variant="caption" style={styles.flex}>
              Tôi đã đọc và đồng ý để app gửi ảnh hợp đồng đi phân tích.
            </AppText>
          </Pressable>
          <Pressable
            onPress={openPrivacy}
            accessibilityRole="button"
            hitSlop={spacing.xs}
            style={({ pressed }) => [styles.link, pressed && styles.pressed]}
          >
            <Ionicons name="lock-closed-outline" size={16} color={colors.primary} />
            <AppText variant="label" color={colors.primary}>
              Ảnh được xử lý thế nào?
            </AppText>
          </Pressable>
        </View>
      )}
      <Button
        title={consentAccepted ? 'Chụp hợp đồng' : 'Bắt đầu chụp'}
        icon="camera-outline"
        onPress={start}
        disabled={!canContinue}
        accessibilityHint={
          canContinue ? 'Mở màn chụp hợp đồng' : 'Đánh dấu ô đồng ý ở trên trước khi bắt đầu'
        }
      />
      <Disclaimer variant="inline" />
    </>
  );

  return (
    <Screen footer={footer} padded={false}>
      <View style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}>
        <ContractIllustration />
      </View>
      <View style={styles.intro}>
        <AppText variant="title" accessibilityRole="header">
          Soi Hợp Đồng Trọ
        </AppText>
        <AppText color={colors.textMuted}>
          Chụp hợp đồng thuê trọ, app tô màu chỗ đáng lo và soạn sẵn câu để bạn hỏi chủ nhà trước
          khi ký. App không tự gửi gì.
        </AppText>
      </View>

      <PrivacySheet
        visible={privacyOpen}
        showAccept={!consentAccepted}
        onClose={() => setPrivacyOpen(false)}
        onAccept={() => {
          setChecked(true);
          setPrivacyOpen(false);
        }}
      />
    </Screen>
  );
}

/** Trang hợp đồng có hai dòng được tô và hai nhãn câu hỏi. Chỉ để minh họa, đọc màn hình bỏ qua. */
function ContractIllustration() {
  const high = severityColors.high;
  const medium = severityColors.medium;
  return (
    <View
      style={styles.illustration}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.paper}>
        <View style={[styles.line, styles.lineTitle]} />
        <View style={[styles.line, { width: '100%' }]} />
        <View style={[styles.line, { width: '92%' }]} />
        <View style={[styles.mark, { backgroundColor: high.highlight, borderColor: high.border }]} />
        <View style={[styles.line, { width: '85%' }]} />
        <View style={[styles.line, { width: '96%' }]} />
        <View
          style={[styles.mark, { backgroundColor: medium.highlight, borderColor: medium.border }]}
        />
        <View style={[styles.line, { width: '100%' }]} />
        <View style={[styles.line, { width: '78%' }]} />
        <View style={[styles.line, { width: '60%' }]} />
      </View>
      <View style={[styles.tag, styles.tagRight]}>
        <AppText variant="label" color={high.fg}>
          Mất cọc?
        </AppText>
      </View>
      <View style={[styles.tag, styles.tagLeft]}>
        <AppText variant="label" color={medium.fg}>
          Giá điện?
        </AppText>
      </View>
    </View>
  );
}

function PrivacySheet({
  visible,
  showAccept,
  onClose,
  onAccept,
}: {
  visible: boolean;
  showAccept: boolean;
  onClose: () => void;
  onAccept: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Đóng"
        />
        <View style={[styles.sheet, { paddingBottom: spacing.lg + insets.bottom }]}>
          <View style={styles.sheetTitle}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.text} />
            <AppText variant="heading" accessibilityRole="header" style={styles.flex}>
              Ảnh của bạn được xử lý thế nào
            </AppText>
          </View>
          {DATA_POINTS.map((point) => (
            <View key={point} style={styles.bullet}>
              <AppText color={colors.textMuted}>•</AppText>
              <AppText color={colors.textMuted} style={styles.flex}>
                {point}
              </AppText>
            </View>
          ))}
          <View style={styles.sheetButtons}>
            {showAccept ? (
              <>
                <Button title="Đóng" variant="ghost" onPress={onClose} style={styles.flex} />
                <Button title="Đồng ý" icon="checkmark" onPress={onAccept} style={styles.flex} />
              </>
            ) : (
              <Button title="Đã hiểu" onPress={onClose} style={styles.flex} />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  hero: {
    backgroundColor: colors.primary,
    borderBottomLeftRadius: radius.lg * 2,
    borderBottomRightRadius: radius.lg * 2,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
  },
  illustration: { width: 280, height: 290, alignItems: 'center', justifyContent: 'center' },
  paper: {
    width: 200,
    height: 260,
    padding: spacing.lg,
    gap: 9,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    transform: [{ rotate: '-4deg' }],
    boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
  },
  line: { height: 6, borderRadius: 3, backgroundColor: colors.border },
  lineTitle: {
    width: '60%',
    height: 8,
    alignSelf: 'center',
    marginBottom: spacing.xs,
    backgroundColor: colors.text,
  },
  mark: { height: 14, width: '100%', borderRadius: 4, borderWidth: 1.5 },
  tag: {
    position: 'absolute',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
  },
  tagRight: { right: 0, top: 64 },
  tagLeft: { left: 0, top: 150 },
  intro: { padding: spacing.lg, paddingTop: spacing.xl, gap: spacing.sm },
  consentRow: { gap: spacing.xs },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH,
  },
  link: {
    alignSelf: 'flex-start',
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginLeft: 26 + spacing.md,
  },
  accepted: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg + spacing.sm,
    borderTopRightRadius: radius.lg + spacing.sm,
  },
  sheetTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bullet: { flexDirection: 'row', gap: spacing.sm },
  sheetButtons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
});
