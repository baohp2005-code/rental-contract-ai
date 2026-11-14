/**
 * Ảnh thu nhỏ các trang hợp đồng, tô sẵn mọi dòng có cảnh báo và gắn số thứ tự của điểm
 * ở mép phải. Số trùng với danh sách bên dưới và với "Điểm n/N" ở màn chi tiết.
 */
import type { Flag, OcrLine, PageInfo } from '@rental/shared';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { LineHighlights, resolveSize } from '@/components/document';
import { AppText } from '@/components/ui';
import type { CapturedPage } from '@/lib/api';
import { bboxToRect, type Size } from '@/lib/geometry';
import { colors, radius, severityColors, spacing } from '@/theme';

const COLUMNS = 2;
const MARKER = 24;

type Entry = { number: number; flag: Flag; lines: OcrLine[] };

type Props = {
  /** Đã xếp theo thứ tự hiển thị (selectSortedFlags). */
  flags: Flag[];
  lines: readonly OcrLine[];
  pages: readonly CapturedPage[];
  pageInfo?: readonly PageInfo[];
  onOpen: (flag: Flag) => void;
};

export function PageMap({ flags, lines, pages, pageInfo, onOpen }: Props) {
  const [width, setWidth] = useState(0);

  const byPage = useMemo(() => {
    const map = new Map<number, Entry[]>();
    flags.forEach((flag, i) => {
      const own = lines.filter((l) => flag.line_ids.includes(l.id));
      const pagesOfFlag = new Set(own.map((l) => l.page));
      for (const p of pagesOfFlag) {
        const list = map.get(p) ?? [];
        list.push({ number: i + 1, flag, lines: own.filter((l) => l.page === p) });
        map.set(p, list);
      }
    });
    return map;
  }, [flags, lines]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== width) setWidth(w);
  };

  const thumbWidth = width > 0 ? (width - spacing.md * (COLUMNS - 1)) / COLUMNS : 0;

  return (
    <View style={styles.grid} onLayout={onLayout}>
      {thumbWidth > 0
        ? pages.map((page, i) => {
            const pageNumber = i + 1;
            const size = resolveSize(page, pageInfo?.find((p) => p.page === pageNumber));
            if (!size) return null;
            return (
              <Thumb
                key={page.id}
                uri={page.uri}
                pageNumber={pageNumber}
                size={{ width: thumbWidth, height: (thumbWidth * size.height) / size.width }}
                entries={byPage.get(pageNumber) ?? []}
                onOpen={onOpen}
              />
            );
          })
        : null}
    </View>
  );
}

function Thumb({
  uri,
  pageNumber,
  size,
  entries,
  onOpen,
}: {
  uri: string;
  pageNumber: number;
  size: Size;
  entries: Entry[];
  onOpen: (flag: Flag) => void;
}) {
  // Vị trí số theo dòng đầu tiên của mỗi điểm; đẩy xuống nếu hai số chồng lên nhau.
  const markers = useMemo(() => {
    const placed = entries
      .map((e) => ({
        ...e,
        top: Math.min(...e.lines.map((l) => bboxToRect(l.bbox, size).y)),
      }))
      .sort((a, b) => a.top - b.top);
    return placed.reduce<(Entry & { top: number })[]>((out, m) => {
      const prev = out[out.length - 1];
      const top = Math.max(m.top - MARKER / 4, prev ? prev.top + MARKER + 2 : -Infinity);
      return [...out, { ...m, top: Math.min(top, size.height - MARKER) }];
    }, []);
  }, [entries, size]);

  const first = entries.reduce<Entry | undefined>(
    (best, e) => (!best || e.number < best.number ? e : best),
    undefined,
  );
  const label =
    entries.length > 0
      ? `Trang ${pageNumber}, có điểm ${entries.map((e) => e.number).join(', ')}`
      : `Trang ${pageNumber}, không có điểm nào`;

  return (
    <View style={[styles.thumbWrap, { width: size.width }]}>
      <Pressable
        onPress={first ? () => onOpen(first.flag) : undefined}
        disabled={!first}
        accessibilityRole={first ? 'button' : 'image'}
        accessibilityLabel={label}
        accessibilityHint={first ? `Mở điểm ${first.number}` : undefined}
        style={({ pressed }) => [styles.thumb, size, pressed && styles.pressed]}
      >
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="fill" transition={150} />
        {entries.map((e) => (
          <LineHighlights
            key={e.flag.id}
            boxes={e.lines.map((l) => l.bbox)}
            size={size}
            severity={e.flag.severity}
            strokeWidth={1}
          />
        ))}
      </Pressable>
      {markers.map((m) => (
        <Pressable
          key={m.flag.id}
          onPress={() => onOpen(m.flag)}
          accessibilityRole="button"
          accessibilityLabel={`Điểm ${m.number}: ${m.flag.title}`}
          hitSlop={spacing.sm}
          style={[
            styles.marker,
            { top: m.top, backgroundColor: severityColors[m.flag.severity].fg },
          ]}
        >
          <AppText variant="label" color={colors.textOnPrimary} style={styles.markerText}>
            {m.number}
          </AppText>
        </Pressable>
      ))}
      <AppText variant="caption" color={colors.textMuted}>
        Trang {pageNumber}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  thumbWrap: { gap: spacing.xs },
  thumb: {
    overflow: 'hidden',
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.85 },
  marker: {
    position: 'absolute',
    right: -spacing.sm,
    width: MARKER,
    height: MARKER,
    borderRadius: MARKER / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  markerText: { fontSize: 12, lineHeight: 14 },
});
