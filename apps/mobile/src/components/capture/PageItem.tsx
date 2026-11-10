import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import type { CapturedPage } from '@/lib/api';
import { pageQualityIssues, qualityMessage } from '@/lib/capture';
import { colors, radius, spacing } from '@/theme';

import { IconButton } from './IconButton';
import { Notice } from './Notice';

const originLabel: Record<CapturedPage['origin'], string> = {
  camera: 'Chụp bằng camera',
  library: 'Chọn từ thư viện',
  sample: 'Ảnh hợp đồng mẫu',
};

type PageItemProps = {
  page: CapturedPage;
  index: number;
  total: number;
  needsRetake: boolean;
  disabled?: boolean;
  onMove: (direction: -1 | 1) => void;
  onReplace: () => void;
  onRemove: () => void;
};

/** Một trang trong danh sách: ảnh thu nhỏ, số trang, nhắc chất lượng và các nút sắp xếp. */
export function PageItem({
  page,
  index,
  total,
  needsRetake,
  disabled,
  onMove,
  onReplace,
  onRemove,
}: PageItemProps) {
  const number = index + 1;
  const issues = pageQualityIssues(page);

  return (
    <View style={[styles.card, needsRetake && styles.cardRetake]}>
      <View style={styles.row}>
        <Image
          source={{ uri: page.uri }}
          style={styles.thumb}
          contentFit="cover"
          transition={150}
          accessibilityLabel={`Ảnh trang ${number}`}
        />
        <View style={styles.info}>
          <AppText variant="bodyStrong">Trang {number}</AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {originLabel[page.origin]}
          </AppText>
          {needsRetake ? (
            <View style={styles.retakeBadge}>
              <AppText variant="label" color={colors.danger}>
                Cần chụp lại
              </AppText>
            </View>
          ) : null}
        </View>
        <View style={styles.moves}>
          <IconButton
            icon="chevron-up"
            label={`Đưa trang ${number} lên trước`}
            onPress={() => onMove(-1)}
            disabled={disabled || index === 0}
          />
          <IconButton
            icon="chevron-down"
            label={`Đưa trang ${number} xuống sau`}
            onPress={() => onMove(1)}
            disabled={disabled || index === total - 1}
          />
        </View>
      </View>

      {needsRetake ? (
        <Notice tone="danger">
          App không đọc được trang này. Bạn chụp lại ở chỗ sáng hơn, cầm máy thật chắc tay nhé.
        </Notice>
      ) : null}
      {issues.map((issue) => (
        <Notice key={issue} tone="warning">
          {qualityMessage[issue]}
        </Notice>
      ))}

      <View style={styles.actions}>
        <Button
          title={needsRetake ? 'Chụp lại' : 'Thay ảnh'}
          icon="camera-reverse-outline"
          variant={needsRetake ? 'secondary' : 'ghost'}
          onPress={onReplace}
          disabled={disabled}
          accessibilityHint={`Thay ảnh trang ${number} bằng ảnh mới`}
          style={styles.action}
        />
        <Button
          title="Xóa"
          icon="trash-outline"
          variant="ghost"
          onPress={onRemove}
          disabled={disabled}
          accessibilityHint={`Xóa trang ${number} khỏi danh sách`}
          style={styles.action}
        />
      </View>
    </View>
  );
}

const THUMB_WIDTH = 64;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardRetake: { borderColor: colors.danger, borderWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: {
    width: THUMB_WIDTH,
    // Tỉ lệ khổ A4 (1 : 1,414).
    height: Math.round(THUMB_WIDTH * 1.414),
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  info: { flex: 1, gap: spacing.xs },
  retakeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  moves: { gap: spacing.xs },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
  action: { flex: 1 },
});
