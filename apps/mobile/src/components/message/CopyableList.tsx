import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { copyText } from '@/lib/share';
import { MIN_TOUCH, colors, radius, spacing } from '@/theme';

import { useFlash } from './useFlash';

type ItemProps = {
  /** "1", "2"… hoặc "•". */
  marker: string;
  text: string;
  /** Tên ngắn đọc cho trình đọc màn hình, ví dụ "câu hỏi 2". */
  name: string;
};

function CopyableItem({ marker, text, name }: ItemProps) {
  const [copied, flash] = useFlash();

  const onCopy = async () => {
    if (await copyText(text)) {
      flash(`Đã sao chép ${name}`);
    } else {
      Alert.alert('Chưa sao chép được', 'Bạn thử giữ lâu vào câu này để chọn và sao chép nhé.');
    }
  };

  return (
    <View style={styles.item}>
      <View style={styles.marker}>
        <AppText variant="label" color={colors.primary}>
          {marker}
        </AppText>
      </View>
      <AppText style={styles.itemText} selectable>
        {text}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copied ? `Đã sao chép ${name}` : `Sao chép ${name}`}
        onPress={onCopy}
        style={({ pressed }) => [styles.copyButton, pressed && styles.copyButtonPressed]}
      >
        <Ionicons
          name={copied ? 'checkmark-circle' : 'copy-outline'}
          size={20}
          color={copied ? colors.success : colors.primary}
        />
        <AppText variant="caption" color={copied ? colors.success : colors.primary}>
          {copied ? 'Đã chép' : 'Chép'}
        </AppText>
      </Pressable>
    </View>
  );
}

type ListProps = {
  title: string;
  hint?: string;
  items: string[];
  numbered?: boolean;
  /** Danh từ cho trình đọc màn hình, ví dụ "câu hỏi". */
  itemName: string;
};

/** Danh sách các câu, mỗi câu có nút sao chép riêng. */
export function CopyableList({ title, hint, items, numbered, itemName }: ListProps) {
  if (items.length === 0) return null;
  return (
    <Card>
      <AppText variant="bodyStrong" accessibilityRole="header">
        {title}
      </AppText>
      {hint ? (
        <AppText variant="caption" color={colors.textMuted}>
          {hint}
        </AppText>
      ) : null}
      <View style={styles.list}>
        {items.map((text, i) => (
          <CopyableItem
            key={`${i}-${text}`}
            marker={numbered ? String(i + 1) : '•'}
            text={text}
            name={`${itemName} ${i + 1}`}
          />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  marker: {
    minWidth: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  itemText: { flex: 1 },
  copyButton: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    marginTop: -spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  copyButtonPressed: { backgroundColor: colors.surfaceMuted },
});
