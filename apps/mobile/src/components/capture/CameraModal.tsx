import { Ionicons } from '@expo/vector-icons';
import { CameraView } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button } from '@/components/ui';
import { MIN_TOUCH, colors, radius, spacing } from '@/theme';

import { CAPTURE_TIPS } from './CaptureTips';
import { IconButton } from './IconButton';

/** Kết quả xử lý một ảnh vừa chụp, do màn chụp quyết định. */
export type CameraOutcome = 'added' | 'replaced' | 'full' | 'failed';

type CameraModalProps = {
  /** Tiêu đề trên cùng, ví dụ "Trang 3" hoặc "Chụp lại trang 2". */
  title: string;
  /** Số trang đã có, để hiện "3/8 trang". */
  pageCount: number;
  maxPages: number;
  /** Ảnh mới nhất trong danh sách, hiện góc dưới để người dùng thấy đã thêm. */
  lastPageUri?: string;
  /** Chuẩn hóa ảnh và đưa vào danh sách. */
  onPhoto: (uri: string) => Promise<CameraOutcome>;
  onClose: () => void;
};

const FEEDBACK_MS = 1800;

/**
 * Camera toàn màn hình có khung căn trang A4 và mẹo chụp ngắn.
 * Chụp liền nhiều trang: mỗi lần chụp thêm một trang, bấm "Xong" để quay lại danh sách.
 *
 * Chỉ render khi cần mở camera (bỏ ra khỏi cây để đóng), nhờ vậy mỗi lần mở là một trạng thái
 * mới và camera được tắt hẳn khi không dùng.
 */
export function CameraModal({
  title,
  pageCount,
  maxPages,
  lastPageUri,
  onPhoto,
  onClose,
}: CameraModalProps) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  // Khung khổ A4 đứng (rộng : cao = 1 : 1,414), không lấn vào hai thanh trên và dưới.
  const guideWidth = Math.round(Math.min(window.width * 0.8, (window.height * 0.55) / A4_RATIO));
  const cameraRef = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mountError, setMountError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [feedback]);

  const takePhoto = async () => {
    const camera = cameraRef.current;
    if (!camera || !ready || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      // Ảnh sẽ được nén lại lần nữa khi chuẩn hóa, nên ở đây giữ chất lượng cao.
      const picture = await camera.takePictureAsync({ quality: 0.9 });
      const outcome = await onPhoto(picture.uri);
      if (outcome === 'added') {
        setFeedback({ ok: true, text: `Đã thêm trang ${pageCount + 1}. Chụp tiếp trang sau nhé.` });
      } else if (outcome === 'failed') {
        setFeedback({ ok: false, text: 'Không xử lý được ảnh này. Bạn chụp lại nhé.' });
      }
      // 'replaced' và 'full': màn chụp tự đóng camera.
    } catch {
      setFeedback({ ok: false, text: 'Chưa chụp được. Bạn thử bấm lại nhé.' });
    } finally {
      setBusy(false);
    }
  };

  const canShoot = ready && !busy && !mountError;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          mode="picture"
          onCameraReady={() => setReady(true)}
          onMountError={(event) => setMountError(event.message)}
        />

        {/* Khung căn trang: chỉ để nhìn, không chặn thao tác. */}
        <View pointerEvents="none" style={styles.guideLayer}>
          <View style={{ width: guideWidth, height: guideWidth * A4_RATIO }}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <AppText variant="caption" color={colors.textOnPrimary} center style={styles.guideText}>
            Đặt trọn trang giấy vào trong khung
          </AppText>
        </View>

        <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.topRow}>
            <IconButton
              icon="close"
              label="Đóng camera"
              onPress={onClose}
              color={colors.textOnPrimary}
              size={28}
            />
            <AppText variant="bodyStrong" color={colors.textOnPrimary} style={styles.title}>
              {title}
            </AppText>
            <AppText variant="label" color={colors.textOnPrimary} style={styles.count}>
              {pageCount}/{maxPages} trang
            </AppText>
          </View>
          <View style={styles.tips} accessibilityLabel="Mẹo chụp">
            {CAPTURE_TIPS.map((tip) => (
              <View key={tip.short} style={styles.tip}>
                <Ionicons name={tip.icon} size={14} color={colors.textOnPrimary} />
                <AppText variant="caption" color={colors.textOnPrimary}>
                  {tip.short}
                </AppText>
              </View>
            ))}
          </View>
        </View>

        {mountError ? (
          <View style={styles.errorBox}>
            <AppText color={colors.textOnPrimary} center>
              Không mở được camera. Bạn đóng lại rồi thử lại, hoặc chọn ảnh có sẵn trong thư viện.
            </AppText>
            <Button title="Đóng camera" variant="secondary" onPress={onClose} />
          </View>
        ) : null}

        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.lg }]}>
          {feedback ? (
            <View
              accessible
              accessibilityLiveRegion="polite"
              style={[styles.feedback, !feedback.ok && styles.feedbackError]}
            >
              <AppText variant="label" color={feedback.ok ? colors.success : colors.danger} center>
                {feedback.text}
              </AppText>
            </View>
          ) : null}

          <View style={styles.controls}>
            <View style={styles.side}>
              {lastPageUri ? (
                <Image
                  source={{ uri: lastPageUri }}
                  style={styles.lastThumb}
                  contentFit="cover"
                  accessibilityLabel="Trang vừa thêm"
                />
              ) : null}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Chụp trang này"
              accessibilityState={{ disabled: !canShoot, busy }}
              disabled={!canShoot}
              onPress={() => void takePhoto()}
              style={({ pressed }) => [
                styles.shutter,
                pressed && styles.shutterPressed,
                !canShoot && styles.shutterDisabled,
              ]}
            >
              {busy || (!ready && !mountError) ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <View style={styles.shutterInner} />
              )}
            </Pressable>

            <View style={styles.side}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Xong, quay lại danh sách trang"
                onPress={onClose}
                disabled={busy}
                style={({ pressed }) => [styles.done, pressed && styles.donePressed]}
              >
                <AppText variant="bodyStrong" color={colors.textOnPrimary}>
                  Xong
                </AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const A4_RATIO = 1.414;
const SHUTTER = 76;
const CORNER = 28;
const CORNER_WIDTH = 4;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.text },
  guideLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  guideText: {
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: colors.textOnPrimary,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH },
  cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1 },
  count: { paddingRight: spacing.sm },
  tips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  tip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  errorBox: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    top: '35%',
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.overlay,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.overlay,
    gap: spacing.md,
  },
  feedback: {
    alignSelf: 'center',
    backgroundColor: colors.successSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  feedbackError: { backgroundColor: colors.dangerSoft },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  side: { width: SHUTTER, alignItems: 'center', justifyContent: 'center' },
  lastThumb: {
    width: 48,
    height: Math.round(48 * A4_RATIO),
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.textOnPrimary,
  },
  shutter: {
    width: SHUTTER,
    height: SHUTTER,
    borderRadius: SHUTTER / 2,
    borderWidth: 4,
    borderColor: colors.textOnPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: SHUTTER - 18,
    height: SHUTTER - 18,
    borderRadius: (SHUTTER - 18) / 2,
    backgroundColor: colors.textOnPrimary,
  },
  shutterPressed: { transform: [{ scale: 0.94 }] },
  shutterDisabled: { opacity: 0.5 },
  done: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  donePressed: { backgroundColor: colors.overlay },
});
