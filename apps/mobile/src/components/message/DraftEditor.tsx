import { Keyboard, StyleSheet, TextInput, View, type LayoutChangeEvent } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { MIN_TOUCH, colors, radius, spacing, typography } from '@/theme';

const INPUT_MIN_HEIGHT = 160;

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  edited: boolean;
  focused: boolean;
  onFocusChange: (focused: boolean) => void;
  onRestore: () => void;
  /** Chiều cao tối đa của ô chữ (nhỏ lại khi bàn phím đang mở). */
  maxHeight: number;
  onLayout?: (event: LayoutChangeEvent) => void;
};

/** Ô sửa tin nhắn nhiều dòng. Chữ dài thì cuộn bên trong ô. */
export function DraftEditor({
  value,
  onChangeText,
  edited,
  focused,
  onFocusChange,
  onRestore,
  maxHeight,
  onLayout,
}: Props) {
  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <AppText variant="bodyStrong" accessibilityRole="header">
            Tin nhắn của bạn
          </AppText>
          <AppText variant="caption" color={edited ? colors.primary : colors.textMuted}>
            {edited ? 'Bạn đã sửa bản nháp.' : 'Bản nháp. Bạn sửa thoải mái cho giống giọng mình.'}
          </AppText>
        </View>
        {focused ? (
          <Button
            title="Xong"
            variant="ghost"
            onPress={() => Keyboard.dismiss()}
            accessibilityHint="Đóng bàn phím"
          />
        ) : null}
      </View>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => onFocusChange(true)}
        onBlur={() => onFocusChange(false)}
        multiline
        scrollEnabled
        textAlignVertical="top"
        autoCorrect={false}
        autoCapitalize="sentences"
        placeholder="Viết tin nhắn gửi chủ nhà…"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Tin nhắn gửi chủ nhà, bạn có thể sửa"
        style={[
          styles.input,
          focused && styles.inputFocused,
          { maxHeight, minHeight: Math.min(INPUT_MIN_HEIGHT, maxHeight) },
        ]}
      />

      {edited ? (
        <Button
          title="Khôi phục bản gốc"
          icon="refresh-outline"
          variant="ghost"
          onPress={onRestore}
          accessibilityHint="Bỏ phần bạn đã sửa, quay về tin nhắn ứng dụng soạn"
          style={styles.restore}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH,
  },
  headerText: { flex: 1 },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  inputFocused: { borderColor: colors.primary },
  restore: { alignSelf: 'flex-start' },
});
