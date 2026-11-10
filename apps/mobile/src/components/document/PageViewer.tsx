import { Ionicons } from '@expo/vector-icons';
import type { BBox, Severity } from '@rental/shared';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button } from '@/components/ui';
import {
  clamp,
  clampTransform,
  fitContain,
  focusRegion,
  focusTransform,
  toCenterOriginTranslate,
  translateBounds,
  zoomAround,
  type Size,
  type ViewTransform,
} from '@/lib/geometry';
import { MIN_TOUCH, colors, radius, spacing } from '@/theme';

import { LineHighlights } from './LineHighlights';

/** Phóng tối đa so với lúc cả trang vừa màn hình. */
const MAX_ZOOM = 6;
/** Mức phóng khi mở trình xem để đưa dòng được tô vào giữa. */
const FOCUS_MAX_ZOOM = 3.5;
/** Mức phóng khi chạm hai lần. */
const DOUBLE_TAP_ZOOM = 2.5;
const ANIM = { duration: 260 };

type Props = {
  visible: boolean;
  onClose: () => void;
  uri: string;
  imageSize: Size;
  boxes: readonly BBox[];
  severity: Severity;
  pageNumber: number;
};

/**
 * Trình xem cả trang hợp đồng, toàn màn hình: chụm hai ngón để phóng, kéo để di chuyển,
 * chạm hai lần để phóng nhanh. Mở ra là đã đưa dòng được tô vào giữa.
 */
export function PageViewer({ visible, onClose, uri, imageSize, boxes, severity, pageNumber }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
      supportedOrientations={['portrait']}
    >
      {/* Trong Modal phải bọc lại, nếu không cử chỉ không chạy trên Android. */}
      <GestureHandlerRootView style={styles.root}>
        {visible ? (
          <ViewerContent
            onClose={onClose}
            uri={uri}
            imageSize={imageSize}
            boxes={boxes}
            severity={severity}
            pageNumber={pageNumber}
          />
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

function ViewerContent({
  onClose,
  uri,
  imageSize,
  boxes,
  severity,
  pageNumber,
}: Omit<Props, 'visible'>) {
  const insets = useSafeAreaInsets();
  const [viewport, setViewport] = useState<Size | null>(null);
  const [failed, setFailed] = useState(false);

  const imgW = imageSize.width;
  const imgH = imageSize.height;
  const content = useMemo<Size | null>(() => {
    if (!viewport) return null;
    const r = fitContain({ width: imgW, height: imgH }, viewport);
    return { width: r.width, height: r.height };
  }, [imgW, imgH, viewport]);

  const region = useMemo(() => focusRegion(boxes), [boxes]);

  // Trạng thái phóng/dịch, đọc ghi trên luồng UI. Dùng get()/set() để hợp với React Compiler.
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  /** Kích thước content và khung nhìn, để các worklet cử chỉ đọc được. */
  const dims = useSharedValue<{ content: Size; viewport: Size }>({
    content: { width: 0, height: 0 },
    viewport: { width: 0, height: 0 },
  });
  const pinching = useSharedValue(false);
  const pinchStart = useSharedValue<ViewTransform & { focalX: number; focalY: number }>({
    scale: 1,
    translateX: 0,
    translateY: 0,
    focalX: 0,
    focalY: 0,
  });

  const focusedTransform = useCallback((): ViewTransform | null => {
    if (!content || !viewport) return null;
    if (!region) return clampTransform({ scale: 1, translateX: 0, translateY: 0 }, content, viewport);
    return focusTransform(region, content, viewport, { minScale: 1, maxScale: FOCUS_MAX_ZOOM });
  }, [content, viewport, region]);

  // Khi đo xong khung (hoặc khung đổi cỡ): đặt ngay vào dòng được tô, không hoạt ảnh.
  // Chỉ làm một lần cho mỗi cỡ khung, để màn hình cha vẽ lại không làm mất vị trí đang xem.
  const layoutKey =
    content && viewport
      ? `${content.width}x${content.height}@${viewport.width}x${viewport.height}`
      : null;
  const placedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!content || !viewport || !layoutKey || placedFor.current === layoutKey) return;
    placedFor.current = layoutKey;
    dims.set({ content, viewport });
    const t = focusedTransform();
    if (!t) return;
    scale.set(t.scale);
    tx.set(t.translateX);
    ty.set(t.translateY);
  }, [layoutKey, content, viewport, focusedTransform, dims, scale, tx, ty]);

  const recenter = () => {
    const t = focusedTransform();
    if (!t) return;
    scale.set(withTiming(t.scale, ANIM));
    tx.set(withTiming(t.translateX, ANIM));
    ty.set(withTiming(t.translateY, ANIM));
  };

  const pinch = usePinchGesture({
    onActivate: (e) => {
      'worklet';
      pinching.set(true);
      pinchStart.set({
        scale: scale.get(),
        translateX: tx.get(),
        translateY: ty.get(),
        focalX: e.focalX,
        focalY: e.focalY,
      });
    },
    onUpdate: (e) => {
      'worklet';
      const s0 = pinchStart.get();
      const d = dims.get();
      const s = clamp(s0.scale * e.scale, 1, MAX_ZOOM);
      // Điểm trên ảnh nằm dưới hai ngón lúc bắt đầu sẽ đi theo hai ngón.
      const px = (s0.focalX - s0.translateX) / s0.scale;
      const py = (s0.focalY - s0.translateY) / s0.scale;
      const next = clampTransform(
        { scale: s, translateX: e.focalX - px * s, translateY: e.focalY - py * s },
        d.content,
        d.viewport,
      );
      scale.set(next.scale);
      tx.set(next.translateX);
      ty.set(next.translateY);
    },
    onFinalize: () => {
      'worklet';
      pinching.set(false);
    },
  });

  const pan = usePanGesture({
    onUpdate: (e) => {
      'worklet';
      if (pinching.get()) return;
      const d = dims.get();
      const next = clampTransform(
        { scale: scale.get(), translateX: tx.get() + e.changeX, translateY: ty.get() + e.changeY },
        d.content,
        d.viewport,
      );
      tx.set(next.translateX);
      ty.set(next.translateY);
    },
    onDeactivate: (e) => {
      'worklet';
      if (pinching.get()) return;
      const d = dims.get();
      const b = translateBounds(scale.get(), d.content, d.viewport);
      tx.set(withDecay({ velocity: e.velocityX, clamp: [b.minX, b.maxX] }));
      ty.set(withDecay({ velocity: e.velocityY, clamp: [b.minY, b.maxY] }));
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onActivate: (e) => {
      'worklet';
      const d = dims.get();
      const current = { scale: scale.get(), translateX: tx.get(), translateY: ty.get() };
      // Đang phóng thì về cả trang; đang xem cả trang thì phóng vào chỗ vừa chạm.
      const next =
        current.scale > 1.2
          ? clampTransform({ scale: 1, translateX: 0, translateY: 0 }, d.content, d.viewport)
          : clampTransform(
              zoomAround(current, { x: e.x, y: e.y }, DOUBLE_TAP_ZOOM),
              d.content,
              d.viewport,
            );
      scale.set(withTiming(next.scale, ANIM));
      tx.set(withTiming(next.translateX, ANIM));
      ty.set(withTiming(next.translateY, ANIM));
    },
  });

  const gesture = useSimultaneousGestures(pinch, pan, doubleTap);

  const animatedStyle = useAnimatedStyle(() => {
    const t = { scale: scale.get(), translateX: tx.get(), translateY: ty.get() };
    const c = toCenterOriginTranslate(t, dims.get().content);
    return { transform: [{ translateX: c.x }, { translateY: c.y }, { scale: t.scale }] };
  });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0 && (width !== viewport?.width || height !== viewport?.height)) {
      setViewport({ width, height });
    }
  };

  // Thanh trên/dưới nằm ngoài vùng ảnh (không đè lên), nên "giữa khung" đúng là giữa phần nhìn thấy.
  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <AppText variant="bodyStrong" color={colors.textOnPrimary} style={styles.flex}>
          Trang {pageNumber}
        </AppText>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Đóng ảnh hợp đồng"
          hitSlop={spacing.sm}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <Ionicons name="close" size={24} color={colors.textOnPrimary} />
          <AppText variant="bodyStrong" color={colors.textOnPrimary}>
            Đóng
          </AppText>
        </Pressable>
      </View>

      <GestureDetector gesture={gesture}>
        <View
          style={styles.stage}
          onLayout={onLayout}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Ảnh trang ${pageNumber} của hợp đồng. Dòng cần chú ý được tô màu.`}
        >
          {content ? (
            <Animated.View
              style={[styles.content, { width: content.width, height: content.height }, animatedStyle]}
            >
              {failed ? (
                <View style={styles.failed}>
                  <AppText color={colors.textOnPrimary} center>
                    Không mở được ảnh trang này.
                  </AppText>
                </View>
              ) : (
                <>
                  <Image
                    source={{ uri }}
                    style={StyleSheet.absoluteFill}
                    contentFit="fill"
                    onError={() => setFailed(true)}
                  />
                  <LineHighlights boxes={boxes} size={content} severity={severity} strokeWidth={1.5} />
                </>
              )}
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <AppText variant="caption" color={colors.textOnPrimary} center>
          Chụm hai ngón để phóng to, kéo để xem chỗ khác. Chạm hai lần để phóng nhanh.
        </AppText>
        {region ? (
          <Button
            title="Về dòng được tô"
            icon="locate-outline"
            variant="secondary"
            onPress={recenter}
            accessibilityHint="Đưa dòng cần chú ý về giữa màn hình"
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.text },
  flex: { flex: 1 },
  stage: { flex: 1, overflow: 'hidden' },
  content: { position: 'absolute', left: 0, top: 0 },
  failed: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.overlay,
  },
  close: {
    minHeight: MIN_TOUCH,
    minWidth: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.overlay,
  },
  pressed: { opacity: 0.7 },
  bottomBar: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.overlay,
  },
});
