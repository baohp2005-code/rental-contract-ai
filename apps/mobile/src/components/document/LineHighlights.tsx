import type { BBox, Severity } from '@rental/shared';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { bboxToRect, type Size } from '@/lib/geometry';
import { severityColors } from '@/theme';

type Props = {
  boxes: readonly BBox[];
  /** Kích thước ảnh đang hiển thị (đúng tỉ lệ ảnh). Khung tô được tính theo kích thước này. */
  size: Size;
  severity: Severity;
  /** Nhấp nháy nhẹ hai lần khi vừa hiện, để mắt tìm thấy dòng ngay. */
  pulse?: boolean;
  /** Độ dày viền (px, trước khi phóng). */
  strokeWidth?: number;
};

/** Nới khung tô ra một chút để không cắt sát chân chữ có dấu. */
const OUTSET = 2;

/**
 * Lớp tô màu các dòng hợp đồng, đặt chồng đúng lên ảnh có kích thước `size`.
 * Phải nằm trong cùng view với ảnh (cùng gốc trên-trái, cùng kích thước).
 */
export function LineHighlights({ boxes, size, severity, pulse = false, strokeWidth = 2 }: Props) {
  const c = severityColors[severity];
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (!pulse) return;
    opacity.set(
      withDelay(
        250,
        withRepeat(
          withSequence(withTiming(0.25, { duration: 320 }), withTiming(1, { duration: 320 })),
          2,
        ),
      ),
    );
  }, [pulse, opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.noTouch, animated]}>
      {boxes.map((box, index) => {
        const r = bboxToRect(box, size);
        return (
          <View
            key={index}
            style={[
              styles.box,
              {
                left: r.x - OUTSET,
                top: r.y - OUTSET,
                width: r.width + OUTSET * 2,
                height: r.height + OUTSET * 2,
                backgroundColor: c.highlight,
                borderColor: c.border,
                borderWidth: strokeWidth,
              },
            ]}
          />
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  noTouch: { pointerEvents: 'none' },
  box: { position: 'absolute', borderRadius: 4 },
});
