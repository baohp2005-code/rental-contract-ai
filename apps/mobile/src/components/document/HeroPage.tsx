import { Ionicons } from '@expo/vector-icons';
import type { OcrLine, Severity } from '@rental/shared';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { AppText } from '@/components/ui';
import { fitWidth, focusRegion, focusTransform, type Size } from '@/lib/geometry';
import { colors, radius, spacing } from '@/theme';

import { QuoteFallback } from './FocusedPage';
import { LineHighlights } from './LineHighlights';

/**
 * Phóng tối đa so với lúc ảnh vừa chiều rộng khung. Thấp hơn khung nhỏ cũ (3)
 * để vẫn thấy vài dòng xung quanh, đọc được ngữ cảnh của điều khoản.
 */
const MAX_SCALE = 2.5;

type Props = {
  uri: string;
  imageSize: Size;
  pageNumber: number;
  lines: readonly OcrLine[];
  severity: Severity;
  onOpen: () => void;
};

/**
 * Ảnh trang hợp đồng chiếm hết khung cha (phần trên màn chi tiết):
 * đưa các dòng được tô vào giữa, phóng vừa đủ đọc. Chạm để mở cả trang.
 */
export function HeroPage({ uri, imageSize, pageNumber, lines, severity, onOpen }: Props) {
  const [viewport, setViewport] = useState<Size | null>(null);
  const [failed, setFailed] = useState(false);

  const boxes = useMemo(() => lines.map((l) => l.bbox), [lines]);
  const imgW = imageSize.width;
  const imgH = imageSize.height;
  const vw = viewport?.width ?? 0;
  const vh = viewport?.height ?? 0;

  const layout = useMemo(() => {
    const region = focusRegion(boxes);
    if (vw <= 0 || vh <= 0 || !region) return null;
    const content = fitWidth({ width: imgW, height: imgH }, vw);
    const t = focusTransform(
      region,
      content,
      { width: vw, height: vh },
      { minScale: 1, maxScale: MAX_SCALE },
    );
    return { t, scaled: { width: content.width * t.scale, height: content.height * t.scale } };
  }, [boxes, vw, vh, imgW, imgH]);

  if (failed) {
    return (
      <View style={styles.fallback}>
        <QuoteFallback pageNumber={pageNumber} lines={lines} />
      </View>
    );
  }

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    const h = Math.round(e.nativeEvent.layout.height);
    if (w > 0 && h > 0 && (w !== vw || h !== vh)) setViewport({ width: w, height: h });
  };

  return (
    <Pressable
      onPress={onOpen}
      onLayout={onLayout}
      accessibilityRole="imagebutton"
      accessibilityLabel={`Ảnh trang ${pageNumber} của hợp đồng, dòng cần chú ý được tô màu`}
      accessibilityHint="Mở cả trang để phóng to và xem xung quanh"
      style={({ pressed }) => [styles.frame, pressed && styles.pressed]}
    >
      {layout ? (
        <View
          style={[
            styles.page,
            {
              left: layout.t.translateX,
              top: layout.t.translateY,
              width: layout.scaled.width,
              height: layout.scaled.height,
            },
          ]}
        >
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="fill"
            transition={150}
            onError={() => setFailed(true)}
          />
          <LineHighlights boxes={boxes} size={layout.scaled} severity={severity} pulse />
        </View>
      ) : null}
      <View style={styles.chip}>
        <Ionicons name="expand-outline" size={16} color={colors.textOnPrimary} />
        <AppText variant="label" color={colors.textOnPrimary}>
          Xem cả trang
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  pressed: { opacity: 0.9 },
  page: { position: 'absolute' },
  chip: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.overlay,
  },
  fallback: { flex: 1, justifyContent: 'center' },
});
