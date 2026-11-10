import type { OcrLine, PageInfo, Severity } from '@rental/shared';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import type { CapturedPage } from '@/lib/api';
import type { Size } from '@/lib/geometry';
import { colors, spacing } from '@/theme';

import { FocusedPage, QuoteFallback } from './FocusedPage';
import { PageViewer } from './PageViewer';

type Props = {
  /** Các dòng cần tô (có thể ở nhiều trang). */
  lines: readonly OcrLine[];
  /** Ảnh các trang, theo thứ tự: dòng ở trang n dùng pages[n - 1]. */
  pages: readonly CapturedPage[];
  /** Kích thước trang backend đã dùng, dự phòng khi ảnh không có kích thước. */
  pageInfo?: readonly PageInfo[];
  severity: Severity;
};

type PageGroup = {
  pageNumber: number;
  lines: OcrLine[];
  page: CapturedPage | undefined;
  size: Size | null;
};

function resolveSize(page: CapturedPage | undefined, info: PageInfo | undefined): Size | null {
  if (page && page.width > 0 && page.height > 0) return { width: page.width, height: page.height };
  if (info && info.width > 0 && info.height > 0) return { width: info.width, height: info.height };
  return null;
}

/**
 * Tô các dòng hợp đồng ngay trên ảnh trang mà sinh viên đã chụp.
 * Mỗi trang có dòng được tô là một khung xem tập trung; chạm vào để xem cả trang.
 */
export function DocumentHighlight({ lines, pages, pageInfo, severity }: Props) {
  const [openPage, setOpenPage] = useState<number | null>(null);

  const groups = useMemo<PageGroup[]>(() => {
    const byPage = new Map<number, OcrLine[]>();
    for (const line of lines) {
      const list = byPage.get(line.page) ?? [];
      list.push(line);
      byPage.set(line.page, list);
    }
    return [...byPage.entries()]
      .sort(([a], [b]) => a - b)
      .map(([pageNumber, pageLines]) => {
        const page = pages[pageNumber - 1];
        const info = pageInfo?.find((p) => p.page === pageNumber);
        return {
          pageNumber,
          lines: [...pageLines].sort((a, b) => a.bbox.y - b.bbox.y),
          page,
          size: resolveSize(page, info),
        };
      });
  }, [lines, pages, pageInfo]);

  const opened = groups.find((g) => g.pageNumber === openPage && g.page && g.size);
  const openedBoxes = useMemo(() => opened?.lines.map((l) => l.bbox) ?? [], [opened]);

  return (
    <View style={styles.list}>
      {groups.length > 1 ? (
        <AppText variant="caption" color={colors.textMuted}>
          Điểm này liên quan tới {groups.length} trang của hợp đồng.
        </AppText>
      ) : null}
      {groups.map((g) => (
        <View key={g.pageNumber} style={styles.group}>
          <AppText variant="label" color={colors.textMuted}>
            Trang {g.pageNumber}
          </AppText>
          {g.page?.uri && g.size ? (
            <FocusedPage
              uri={g.page.uri}
              imageSize={g.size}
              pageNumber={g.pageNumber}
              lines={g.lines}
              severity={severity}
              onOpen={() => setOpenPage(g.pageNumber)}
            />
          ) : (
            <QuoteFallback pageNumber={g.pageNumber} lines={g.lines} />
          )}
        </View>
      ))}

      {opened?.page && opened.size ? (
        <PageViewer
          visible
          onClose={() => setOpenPage(null)}
          uri={opened.page.uri}
          imageSize={opened.size}
          boxes={openedBoxes}
          severity={severity}
          pageNumber={opened.pageNumber}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  group: { gap: spacing.xs },
});
