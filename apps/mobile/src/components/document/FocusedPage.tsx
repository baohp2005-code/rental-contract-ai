import { Ionicons } from '@expo/vector-icons';
import type { OcrLine, Severity } from '@rental/shared';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { AppText } from '@/components/ui';
import {
  fitWidth,
  focusRegion,
  focusTransform,
  focusViewportHeight,
  type Size,
} from '@/lib/geometry';
import { MIN_TOUCH, colors, radius, spacing } from '@/theme';

import { LineHighlights } from './LineHighlights';

/** Giới hạn khung xem tập trung trong màn chi tiết. */
const MIN_HEIGHT = 140;
const MAX_HEIGHT = 300;
/** Phóng tối đa so với lúc ảnh vừa chiều rộng khung. */
const MAX_SCALE = 3;

type Props = {
  uri: string;
  imageSize: Size;
  pageNumber: number;
  lines: readonly OcrLine[];
  severity: Severity;
  onOpen: () => void;
};

/**
 * Khung nhỏ trong màn chi tiết: chỉ hiện các dòng được tô và vài dòng xung quanh,
 * phóng vừa đủ để đọc. Chạm vào để mở cả trang.
 */
export function FocusedPage({ uri, imageSize, pageNumber, lines, severity, onOpen }: Props) {
  const [width, setWidth] = useState(0);
  const [failed, setFailed] = useState(false);

  const boxes = useMemo(() => lines.map((l) => l.bbox), [lines]);
  const imgW = imageSize.width;
  const imgH = imageSize.height;

  const layout = useMemo(() => {
    const region = focusRegion(boxes);
    if (width <= 0 || !region) return null;
    const image = { width: imgW, height: imgH };
    const content = fitWidth(image, width);
    const height = focusViewportHeight(region, image, width, {
      minHeight: MIN_HEIGHT,
      maxHeight: MAX_HEIGHT,
      maxScale: MAX_SCALE,
    });
    const t = focusTransform(region, content, { width, height }, { minScale: 1, maxScale: MAX_SCALE });
    const scaled = { width: content.width * t.scale, height: content.height * t.scale };
    return { height, t, scaled };
  }, [boxes, width, imgW, imgH]);

  if (failed) {
    return <QuoteFallback pageNumber={pageNumber} lines={lines} />;
  }

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== width) setWidth(w);
  };

  return (
    <Pressable
      onPress={onOpen}
      onLayout={onLayout}
      accessibilityRole="imagebutton"
      accessibilityLabel={`Ảnh trang ${pageNumber} của hợp đồng, dòng cần chú ý được tô màu`}
      accessibilityHint="Mở cả trang để phóng to và xem xung quanh"
      style={({ pressed }) => [
        styles.frame,
        { height: layout?.height ?? MIN_HEIGHT },
        pressed && styles.pressed,
      ]}
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

/** Khi không có ảnh trang (hoặc ảnh lỗi): vẫn cho sinh viên đọc được chữ của dòng. */
export function QuoteFallback({
  pageNumber,
  lines,
}: {
  pageNumber: number;
  lines: readonly OcrLine[];
}) {
  return (
    <View style={styles.fallback}>
      <View style={styles.fallbackHead}>
        <Ionicons name="image-outline" size={18} color={colors.textMuted} />
        <AppText variant="caption" color={colors.textMuted} style={styles.flex}>
          Không hiển thị được ảnh trang {pageNumber}. Đây là chữ app đọc được ở dòng đó:
        </AppText>
      </View>
      {lines.map((line) => (
        <AppText key={line.id}>{line.text}</AppText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  frame: {
    minHeight: MIN_TOUCH,
    overflow: 'hidden',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  pressed: { opacity: 0.85 },
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
  fallback: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  fallbackHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
});
