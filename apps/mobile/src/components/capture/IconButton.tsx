import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import type { IconName } from '@/components/ui';
import { MIN_TOUCH, colors, radius } from '@/theme';

type IconButtonProps = {
  icon: IconName;
  /** Bắt buộc: nút chỉ có biểu tượng nên trình đọc màn hình cần nhãn. */
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/** Nút chỉ có biểu tượng, vùng chạm tối thiểu MIN_TOUCH. */
export function IconButton({
  icon,
  label,
  onPress,
  color = colors.primary,
  disabled,
  size = 22,
  style,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  pressed: { backgroundColor: colors.surfaceMuted },
  disabled: { opacity: 0.35 },
});
