/**
 * Màn 3: đang phân tích.
 *
 * Màn này chỉ quan sát trạng thái trong store. Màn chụp gọi `startAnalysis()` rồi mới chuyển
 * sang đây. Với backend thật, các bước chạy theo đồng hồ ước lượng (xem lib/api/http.ts),
 * nên chỉ hiện bước nào xong / đang làm / chưa tới, không hiện phần trăm.
 */
import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, BackHandler, StyleSheet, View } from 'react-native';

import { AppText, Button, Screen, type IconName } from '@/components/ui';
import { ANALYSIS_STEPS, type AnalysisStep, type ApiErrorCode } from '@/lib/api';
import { useAppStore, type AppError } from '@/lib/store';
import { colors, radius, spacing } from '@/theme';

const stepText: Record<AnalysisStep, { label: string; detail: string }> = {
  upload: { label: 'Gửi ảnh', detail: 'Gửi các trang bạn chụp lên máy chủ.' },
  ocr: { label: 'Đọc chữ trên ảnh', detail: 'AI đọc từng dòng, kể cả chữ viết tay.' },
  extract: {
    label: 'Trích các điều khoản chính',
    detail: 'Tìm tiền thuê, tiền cọc, điện nước, thời hạn.',
  },
  risk: {
    label: 'Kiểm tra rủi ro',
    detail: 'So từng điều khoản với những điểm sinh viên hay gặp rắc rối.',
  },
};

type StepState = 'done' | 'current' | 'upcoming';

const stepStateText: Record<StepState, string> = {
  done: 'đã xong',
  current: 'đang làm',
  upcoming: 'chưa tới',
};

/** Sau bao nhiêu giây thì báo "vẫn đang làm" để người dùng không nghĩ app bị treo. */
const SLOW_AFTER_S = 40;

/** Lỗi do ảnh: chụp lại mới giải quyết được, nên "Chụp lại" là nút chính. */
const retakeFirst: ApiErrorCode[] = ['image_unreadable', 'not_a_contract', 'too_many_pages'];

/** [2] → "trang 2"; [1, 3] → "trang 1 và 3"; [1, 2, 4] → "trang 1, 2 và 4". */
function pagesText(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  if (sorted.length <= 1) return `trang ${sorted.join('')}`;
  return `trang ${sorted.slice(0, -1).join(', ')} và ${sorted[sorted.length - 1]}`;
}

export default function AnalyzingScreen() {
  const status = useAppStore((s) => s.analysisStatus);
  const step = useAppStore((s) => s.analysisStep);
  const error = useAppStore((s) => s.analysisError);
  const pageCount = useAppStore((s) => s.pages.length);
  const startAnalysis = useAppStore((s) => s.startAnalysis);
  const cancelAnalysis = useAppStore((s) => s.cancelAnalysis);

  // Chỉ điều hướng một lần, kể cả khi `cancelAnalysis()` làm trạng thái về "idle" ngay sau đó.
  const leavingRef = useRef(false);
  const [elapsed, setElapsed] = useState(0);

  /** Hủy (nếu đang chạy) và quay về màn chụp. */
  const backToCapture = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    cancelAnalysis();
    router.dismissTo('/capture');
  }, [cancelAnalysis]);

  const retry = useCallback(() => {
    setElapsed(0);
    void startAnalysis();
  }, [startAnalysis]);

  useEffect(() => {
    if (leavingRef.current) return;
    if (status === 'done') {
      leavingRef.current = true;
      router.replace('/overview');
    } else if (status === 'idle') {
      // Vào thẳng màn này mà không có gì đang chạy (ví dụ tải lại app lúc dev).
      leavingRef.current = true;
      router.dismissTo('/capture');
    }
  }, [status]);

  useEffect(() => {
    if (status !== 'running') return;
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status === 'running' && step) {
      AccessibilityInfo.announceForAccessibility(stepText[step].label);
    }
  }, [status, step]);

  // Nút Back của Android: hủy phân tích rồi về màn chụp, không để yêu cầu chạy ngầm.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (useAppStore.getState().analysisStatus !== 'done') backToCapture();
        return true;
      });
      return () => sub.remove();
    }, [backToCapture]),
  );

  if (status === 'error' && error) {
    return <ErrorView error={error} onRetry={retry} onRetake={backToCapture} />;
  }

  const currentIndex =
    status === 'done' ? ANALYSIS_STEPS.length : ANALYSIS_STEPS.indexOf(step ?? 'upload');

  return (
    <Screen
      footer={
        <Button
          title="Hủy phân tích"
          variant="ghost"
          icon="close"
          onPress={backToCapture}
          accessibilityHint="Dừng phân tích và quay lại màn chụp hợp đồng"
        />
      }
    >
      <Stack.Screen options={{ title: 'Đang phân tích' }} />
      <View style={styles.intro}>
        <AppText variant="title">AI đang đọc hợp đồng của bạn</AppText>
        <AppText color={colors.textMuted}>
          {pageCount > 0 ? `${pageCount} trang. ` : ''}Có thể mất tới khoảng 1 phút. Bạn cứ để
          màn hình này mở nhé.
        </AppText>
      </View>

      <View style={styles.steps} accessibilityRole="list">
        {ANALYSIS_STEPS.map((s, index) => {
          const state: StepState =
            index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming';
          return (
            <StepRow
              key={s}
              step={s}
              state={state}
              isLast={index === ANALYSIS_STEPS.length - 1}
            />
          );
        })}
      </View>

      {elapsed >= 3 ? (
        <AppText variant="caption" color={colors.textMuted} style={styles.elapsed}>
          Đã chờ {elapsed} giây
          {elapsed >= SLOW_AFTER_S
            ? '. Vẫn đang làm, hợp đồng dài hoặc viết tay sẽ lâu hơn một chút.'
            : ''}
        </AppText>
      ) : null}
    </Screen>
  );
}

function StepRow({ step, state, isLast }: { step: AnalysisStep; state: StepState; isLast: boolean }) {
  const { label, detail } = stepText[step];
  return (
    <View
      style={styles.stepRow}
      accessible
      accessibilityLabel={`${label}: ${stepStateText[state]}`}
    >
      <View style={styles.stepRail}>
        <View style={styles.stepIcon}>
          {state === 'done' ? (
            <Ionicons name="checkmark-circle" size={26} color={colors.success} />
          ) : state === 'current' ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Ionicons name="ellipse-outline" size={26} color={colors.border} />
          )}
        </View>
        {!isLast ? (
          <View style={[styles.stepLine, state === 'done' && styles.stepLineDone]} />
        ) : null}
      </View>
      <View style={[styles.stepBody, isLast && styles.stepBodyLast]}>
        <AppText
          variant={state === 'current' ? 'bodyStrong' : 'body'}
          color={state === 'upcoming' ? colors.textMuted : colors.text}
        >
          {label}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {state === 'done' ? 'Xong' : detail}
        </AppText>
      </View>
    </View>
  );
}

function ErrorView({
  error,
  onRetry,
  onRetake,
}: {
  error: AppError;
  onRetry: () => void;
  onRetake: () => void;
}) {
  const retake = retakeFirst.includes(error.code);
  const pages = error.code === 'image_unreadable' && error.pages?.length ? error.pages : null;
  const icon: IconName = retake ? 'camera-outline' : 'cloud-offline-outline';

  const retryButton = (
    <Button
      title="Thử lại"
      icon="refresh"
      variant={retake ? 'secondary' : 'primary'}
      onPress={onRetry}
      accessibilityHint="Gửi lại các trang đã chụp để phân tích"
    />
  );
  const retakeButton = (
    <Button
      title="Chụp lại"
      icon="camera-outline"
      variant={retake ? 'primary' : 'secondary'}
      onPress={onRetake}
      accessibilityHint="Quay lại màn chụp hợp đồng"
    />
  );

  return (
    <Screen
      footer={
        retake ? (
          <>
            {retakeButton}
            {retryButton}
          </>
        ) : (
          <>
            {retryButton}
            {retakeButton}
          </>
        )
      }
    >
      <Stack.Screen options={{ title: 'Chưa phân tích được' }} />
      <View style={styles.error} accessibilityLiveRegion="polite">
        <Ionicons name={icon} size={48} color={colors.textMuted} />
        <AppText variant="heading" center>
          Chưa phân tích được hợp đồng
        </AppText>
        <AppText center>{error.message}</AppText>
        {pages ? (
          <View style={styles.pagesNote}>
            <AppText variant="bodyStrong" color={colors.warning} center>
              Cần chụp lại {pagesText(pages)}.
            </AppText>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const ICON_SIZE = 28;

const styles = StyleSheet.create({
  intro: { gap: spacing.sm },
  steps: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  stepRow: { flexDirection: 'row', gap: spacing.md },
  stepRail: { alignItems: 'center', width: ICON_SIZE },
  stepIcon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: {
    flex: 1,
    width: 2,
    minHeight: spacing.lg,
    marginVertical: spacing.xs,
    backgroundColor: colors.border,
  },
  stepLineDone: { backgroundColor: colors.success },
  stepBody: { flex: 1, paddingBottom: spacing.lg, gap: 2 },
  stepBodyLast: { paddingBottom: 0 },
  elapsed: { textAlign: 'center' },
  error: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  pagesNote: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignSelf: 'stretch',
  },
});
