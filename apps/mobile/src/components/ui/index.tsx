/**
 * Bộ thành phần giao diện dùng chung. Màn hình nào cũng lấy từ đây,
 * không tự định nghĩa lại nút, thẻ, nhãn.
 */
import { Ionicons } from '@expo/vector-icons';
import { LOW_CONFIDENCE, type FlagType, type Severity } from '@rental/shared';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { flagTypeLabel, severityLabel } from '@/lib/format';
import {
  MIN_TOUCH,
  colors,
  radius,
  severityColors,
  spacing,
  typography,
  type TypographyVariant,
} from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

// ---------- AppText ----------

type AppTextProps = TextProps & {
  variant?: TypographyVariant;
  color?: string;
  center?: boolean;
};

export function AppText({ variant = 'body', color, center, style, ...rest }: AppTextProps) {
  return (
    <Text
      {...rest}
      style={[
        typography[variant],
        { color: color ?? colors.text },
        center && { textAlign: 'center' },
        style,
      ]}
    />
  );
}

// ---------- Screen ----------

type ScreenProps = {
  children: ReactNode;
  /** Cuộn nội dung. Mặc định true. */
  scroll?: boolean;
  /** Phần cố định dưới đáy (thường là nút chính). */
  footer?: ReactNode;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Screen({ children, scroll = true, footer, padded = true, style }: ScreenProps) {
  const content = padded ? styles.screenPadded : undefined;
  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[content, style]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, content, style]}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

// ---------- Button ----------

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  accessibilityHint,
}: ButtonProps) {
  const inactive = disabled || loading;
  const fg =
    variant === 'primary'
      ? colors.textOnPrimary
      : variant === 'danger'
        ? colors.danger
        : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        pressed && (variant === 'primary' ? styles.buttonPrimaryPressed : styles.buttonPressed),
        inactive && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={20} color={fg} /> : null}
          <Text style={[typography.bodyStrong, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

// ---------- Card ----------

type CardProps = {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function Card({ children, onPress, style, accessibilityLabel }: CardProps) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}
    >
      {children}
    </Pressable>
  );
}

// ---------- Badges ----------

export function SeverityBadge({ severity }: { severity: Severity }) {
  const c = severityColors[severity];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[typography.label, { color: c.fg }]}>{severityLabel[severity]}</Text>
    </View>
  );
}

export function TypeBadge({ type }: { type: FlagType }) {
  return (
    <View style={[styles.badge, { backgroundColor: colors.surfaceMuted }]}>
      <Text style={[typography.label, { color: colors.textMuted }]}>{flagTypeLabel[type]}</Text>
    </View>
  );
}

/** Hiện khi độ tin cậy của cảnh báo thấp. Không hiện gì nếu đủ tin cậy. */
export function LowConfidenceNote({ confidence }: { confidence: number }) {
  if (confidence >= LOW_CONFIDENCE) return null;
  return (
    <View style={styles.inlineNote}>
      <Ionicons name="help-circle-outline" size={16} color={colors.textMuted} />
      <Text style={[typography.caption, { color: colors.textMuted, flex: 1 }]}>
        AI không chắc về cảnh báo này. Bạn nên đọc lại dòng gốc.
      </Text>
    </View>
  );
}

// ---------- Ghi chú cố định ----------

/**
 * Câu miễn trừ bắt buộc ở màn giới thiệu và màn kết quả.
 * `inline`: chữ nhỏ không nền, cho màn cần gọn; nội dung câu giữ nguyên.
 */
export function Disclaimer({
  style,
  variant = 'box',
}: {
  style?: StyleProp<ViewStyle>;
  variant?: 'box' | 'inline';
}) {
  const inline = variant === 'inline';
  const color = inline ? colors.textMuted : colors.info;
  return (
    <View
      style={[
        styles.note,
        inline ? styles.noteInline : { backgroundColor: colors.infoSoft },
        style,
      ]}
    >
      <Ionicons name="information-circle-outline" size={inline ? 16 : 20} color={color} />
      <Text style={[typography.caption, { color, flex: 1 }]}>
        Đây không phải tư vấn pháp lý. Ứng dụng chỉ giúp bạn hiểu hợp đồng và gợi ý điều nên hỏi
        lại. Bạn là người quyết định.
      </Text>
    </View>
  );
}

/** Hiện khi app đang chạy bằng dữ liệu mẫu (chưa nối backend). */
export function MockBanner() {
  return (
    <View style={[styles.note, { backgroundColor: colors.warningSoft }]}>
      <Ionicons name="flask-outline" size={20} color={colors.warning} />
      <Text style={[typography.caption, { color: colors.warning, flex: 1 }]}>
        Đang dùng dữ liệu mẫu. Kết quả là của hợp đồng mẫu, không phải ảnh bạn vừa chụp.
      </Text>
    </View>
  );
}

// ---------- SegmentedControl ----------

type SegmentedProps<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedProps<T>) {
  return (
    <View
      style={styles.segmented}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text
              style={[
                typography.label,
                { color: selected ? colors.textOnPrimary : colors.textMuted },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- StateView ----------

type StateViewProps = {
  icon: IconName;
  title: string;
  message?: string;
  actionTitle?: string;
  onAction?: () => void;
};

/** Trạng thái rỗng hoặc lỗi, chiếm giữa màn hình. */
export function StateView({ icon, title, message, actionTitle, onAction }: StateViewProps) {
  return (
    <View style={styles.stateView}>
      <Ionicons name={icon} size={48} color={colors.textMuted} />
      <AppText variant="heading" center>
        {title}
      </AppText>
      {message ? (
        <AppText color={colors.textMuted} center>
          {message}
        </AppText>
      ) : null}
      {actionTitle && onAction ? (
        <Button title={actionTitle} onPress={onAction} style={{ alignSelf: 'stretch' }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  screenPadded: { padding: spacing.lg, gap: spacing.lg },
  footer: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  button: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonPrimaryPressed: { backgroundColor: colors.primaryPressed },
  buttonSecondary: { backgroundColor: colors.primarySoft },
  buttonDanger: { backgroundColor: colors.dangerSoft },
  buttonPressed: { opacity: 0.7 },
  buttonDisabled: { opacity: 0.45 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardPressed: { backgroundColor: colors.surfaceMuted },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  inlineNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  noteInline: { padding: 0, gap: spacing.xs },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segment: {
    flex: 1,
    minHeight: MIN_TOUCH - spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
  },
  segmentSelected: { backgroundColor: colors.primary },
  stateView: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
});
