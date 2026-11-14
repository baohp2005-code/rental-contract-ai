/**
 * Chi tiết một cảnh báo, bố cục "hình trước, chữ sau":
 * - Phần trên: ảnh trang hợp đồng, dòng cần chú ý được tô và phóng vào giữa.
 * - Phần dưới: ngăn chỉ hiện điều cần làm (câu hỏi cho chủ nhà, Giữ / Bỏ qua).
 *   Mở ngăn để đọc giải thích và câu đề nghị ghi vào hợp đồng.
 */
import { Ionicons } from '@expo/vector-icons';
import type { Flag } from '@rental/shared';
import * as Haptics from 'expo-haptics';
import { Redirect, Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeroPage, PageViewer, QuoteFallback, groupLinesByPage } from '@/components/document';
import {
  AppText,
  Button,
  LowConfidenceNote,
  SeverityBadge,
  TypeBadge,
  type IconName,
} from '@/components/ui';
import {
  selectFlag,
  selectLinesForFlag,
  selectNextPendingFlag,
  selectQuestion,
  selectSortedFlags,
  useAppStore,
  type Decision,
} from '@/lib/store';
import { useStatusBarStyle } from '@/lib/use-status-bar';
import { MIN_TOUCH, colors, radius, spacing, typography } from '@/theme';

/** Chiều cao thanh tiêu đề iOS, để bàn phím không che ô sửa câu hỏi. */
const IOS_HEADER_HEIGHT = 44;

export default function FlagDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? '';
  const insets = useSafeAreaInsets();
  useStatusBarStyle('light');

  const analysis = useAppStore((s) => s.analysis);
  const pages = useAppStore((s) => s.pages);
  const decisions = useAppStore((s) => s.decisions);
  const editedQuestions = useAppStore((s) => s.editedQuestions);
  const setDecision = useAppStore((s) => s.setDecision);
  const setEditedQuestion = useAppStore((s) => s.setEditedQuestion);

  // Bản nháp khi đang sửa câu hỏi. Gắn với id để chuyển sang điểm khác là tự bỏ.
  const [draft, setDraft] = useState<{ id: string; text: string } | null>(null);
  const editing = draft?.id === id ? draft : null;
  const [expanded, setExpanded] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);

  const flag = useMemo(() => selectFlag({ analysis }, id), [analysis, id]);
  const lines = useMemo(
    () => (flag ? selectLinesForFlag({ analysis }, flag) : []),
    [analysis, flag],
  );
  const groups = useMemo(
    () => groupLinesByPage(lines, pages, analysis?.pages),
    [lines, pages, analysis],
  );
  const sorted = useMemo(() => selectSortedFlags({ analysis }), [analysis]);

  if (!analysis || !flag) return <Redirect href="/overview" />;

  const index = sorted.findIndex((f) => f.id === flag.id);
  const position = index + 1;
  const total = sorted.length;
  const prevFlag: Flag | undefined = sorted[index - 1];
  const nextFlag: Flag | undefined = sorted[index + 1];
  const decision: Decision = decisions[flag.id] ?? 'pending';
  const question = selectQuestion({ editedQuestions }, flag);
  const isEdited = question !== flag.question_for_landlord;
  const isMissing = flag.type === 'missing';
  const quote = flag.quote.trim() || lines.map((l) => l.text).join(' ');
  const group = groups[Math.min(pageIndex, groups.length - 1)];
  const tall = expanded || editing !== null;

  const goTo = (target: Flag | undefined) => {
    if (target) router.replace({ pathname: '/flag/[id]', params: { id: target.id } });
  };

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((e) => !e);
  };

  const saveDraft = (text: string) => {
    const trimmed = text.trim();
    // Rỗng hoặc trùng câu gốc thì coi như dùng câu gốc.
    setEditedQuestion(flag.id, trimmed === flag.question_for_landlord ? '' : trimmed);
    setDraft(null);
  };

  const decide = (value: Exclude<Decision, 'pending'>) => {
    if (editing && editing.text.trim()) saveDraft(editing.text);
    setDecision(flag.id, value);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const next = selectNextPendingFlag(useAppStore.getState(), flag.id);
    if (next) {
      router.replace({ pathname: '/flag/[id]', params: { id: next.id } });
    } else {
      router.dismissTo('/overview');
    }
  };

  const title = group && groups.length > 0
    ? `Điểm ${position}/${total} · trang ${group.pageNumber}`
    : `Điểm ${position}/${total}`;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top + IOS_HEADER_HEIGHT}
    >
      <Stack.Screen
        options={{
          title,
          headerStyle: { backgroundColor: colors.stage },
          headerTintColor: colors.textOnStage,
          headerRight: () => (
            <View style={styles.headerNav}>
              <HeaderIcon
                icon="chevron-up"
                label="Điểm trước"
                disabled={!prevFlag}
                onPress={() => goTo(prevFlag)}
              />
              <HeaderIcon
                icon="chevron-down"
                label="Điểm sau"
                disabled={!nextFlag}
                onPress={() => goTo(nextFlag)}
              />
            </View>
          ),
        }}
      />

      {/* Phần trên: ảnh hợp đồng */}
      <View style={styles.stage}>
        {groups.length > 1 ? (
          <View style={styles.pageTabs} accessibilityRole="tablist">
            {groups.map((g, i) => {
              const selected = g === group;
              return (
                <Pressable
                  key={g.pageNumber}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => setPageIndex(i)}
                  style={[styles.pageTab, selected && styles.pageTabSelected]}
                >
                  <AppText
                    variant="label"
                    color={selected ? colors.text : colors.textOnStage}
                  >
                    Trang {g.pageNumber}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {isMissing ? (
          <StageMessage
            icon="search-outline"
            title="Hợp đồng không có nội dung này"
            text="App đã đọc các trang bạn chụp và không thấy hợp đồng nói tới điều này. Khi hợp đồng không ghi, nếu sau này hai bên hiểu khác nhau thì bạn không có gì trên giấy để dựa vào."
            note="Nếu nội dung này nằm ở trang bạn chưa chụp, bạn có thể bỏ qua điểm này."
          />
        ) : !group ? (
          <StageMessage
            icon="document-text-outline"
            title="Không tìm lại được dòng này trên ảnh"
            text={quote ? `Hợp đồng ghi: “${quote}”` : 'Bạn mở phần giải thích bên dưới để đọc thêm.'}
          />
        ) : group.page?.uri && group.size ? (
          <HeroPage
            key={`${flag.id}-${group.pageNumber}`}
            uri={group.page.uri}
            imageSize={group.size}
            pageNumber={group.pageNumber}
            lines={group.lines}
            severity={flag.severity}
            onOpen={() => setViewerOpen(true)}
          />
        ) : (
          <View style={styles.stageFallback}>
            <QuoteFallback pageNumber={group.pageNumber} lines={group.lines} />
          </View>
        )}
      </View>

      {/* Phần dưới: ngăn kéo */}
      <View style={[styles.sheet, { maxHeight: tall ? '88%' : '62%' }]}>
        <Pressable
          onPress={toggleExpanded}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Thu gọn phần giải thích' : 'Mở phần giải thích'}
          accessibilityState={{ expanded }}
          style={styles.handleArea}
        >
          <View style={styles.handle} />
        </Pressable>

        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.badges}>
            <SeverityBadge severity={flag.severity} />
            <TypeBadge type={flag.type} />
          </View>
          <AppText variant="heading" accessibilityRole="header">
            {flag.title}
          </AppText>

          {/* Câu hỏi cho chủ nhà: việc chính của màn này, luôn hiện */}
          <View style={styles.ask}>
            <AppText variant="label" color={colors.primaryPressed}>
              Hỏi chủ nhà
            </AppText>
            {editing ? (
              <>
                <TextInput
                  value={editing.text}
                  onChangeText={(text) => setDraft({ id: flag.id, text })}
                  multiline
                  autoFocus
                  accessibilityLabel="Sửa câu hỏi cho chủ nhà"
                  placeholder="Viết câu hỏi theo cách của bạn"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />
                <View style={styles.buttonRow}>
                  <Button
                    title="Hủy"
                    variant="ghost"
                    onPress={() => setDraft(null)}
                    style={styles.flex}
                  />
                  <Button
                    title="Lưu câu hỏi"
                    icon="checkmark"
                    disabled={!editing.text.trim()}
                    onPress={() => saveDraft(editing.text)}
                    style={styles.flex}
                  />
                </View>
              </>
            ) : (
              <>
                <AppText>{question}</AppText>
                <View style={styles.askActions}>
                  <LinkButton
                    icon="create-outline"
                    title={isEdited ? 'Sửa tiếp' : 'Sửa câu hỏi'}
                    hint="Viết lại câu hỏi theo cách của bạn trước khi giữ"
                    onPress={() => setDraft({ id: flag.id, text: question })}
                  />
                  {isEdited ? (
                    <LinkButton
                      icon="arrow-undo-outline"
                      title="Dùng lại câu gốc"
                      onPress={() => setEditedQuestion(flag.id, '')}
                    />
                  ) : null}
                </View>
              </>
            )}
          </View>

          <LowConfidenceNote confidence={flag.confidence} />

          <LinkButton
            icon={expanded ? 'chevron-up' : 'chevron-down'}
            title={
              expanded
                ? 'Thu gọn'
                : isMissing
                  ? 'Vì sao quan trọng và nên ghi gì'
                  : 'Vì sao và nên ghi gì vào hợp đồng'
            }
            onPress={toggleExpanded}
          />

          {expanded ? (
            <View style={styles.details}>
              {!isMissing && quote ? (
                <View style={styles.detailBlock}>
                  <AppText variant="label" color={colors.textMuted}>
                    Hợp đồng ghi
                  </AppText>
                  <AppText style={styles.quoteText}>“{quote}”</AppText>
                </View>
              ) : null}
              <View style={styles.detailBlock}>
                <AppText variant="bodyStrong" accessibilityRole="header">
                  {isMissing ? 'Vì sao điều này quan trọng' : 'Vì sao bạn nên chú ý'}
                </AppText>
                <AppText>{flag.explanation}</AppText>
              </View>
              {flag.what_is_common.trim() ? (
                <View style={styles.detailBlock}>
                  <AppText variant="bodyStrong" accessibilityRole="header">
                    Thường gặp ở Hà Nội
                  </AppText>
                  <AppText>{flag.what_is_common}</AppText>
                </View>
              ) : null}
              {flag.suggested_clause.trim() ? (
                <View style={styles.detailBlock}>
                  <AppText variant="bodyStrong" accessibilityRole="header">
                    Đề nghị ghi thêm vào hợp đồng
                  </AppText>
                  <AppText>{flag.suggested_clause}</AppText>
                  <AppText variant="caption" color={colors.textMuted}>
                    Bạn có thể nhờ chủ nhà ghi câu này vào hợp đồng nếu hai bên đồng ý.
                  </AppText>
                </View>
              ) : null}
              <AppText variant="caption" color={colors.textMuted}>
                Đây là gợi ý để bạn hỏi lại, không phải tư vấn pháp lý. App không tự gửi gì cho
                chủ nhà.
              </AppText>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: spacing.lg + insets.bottom }]}>
          {decision !== 'pending' ? (
            <View style={styles.statusRow} accessibilityLiveRegion="polite">
              <Ionicons
                name={decision === 'kept' ? 'bookmark' : 'remove-circle-outline'}
                size={16}
                color={decision === 'kept' ? colors.primary : colors.textMuted}
              />
              <AppText variant="caption" color={colors.textMuted} style={styles.flex}>
                {decision === 'kept'
                  ? 'Bạn đã giữ điểm này. Bấm "Bỏ qua" nếu muốn đổi.'
                  : 'Bạn đã bỏ qua điểm này. Bấm "Giữ" nếu muốn hỏi lại.'}
              </AppText>
            </View>
          ) : null}
          <View style={styles.buttonRow}>
            <Button
              title="Bỏ qua"
              variant="secondary"
              icon={decision === 'dropped' ? 'checkmark-circle' : 'close-circle-outline'}
              onPress={() => decide('dropped')}
              accessibilityHint="Không đưa điểm này vào tin nhắn, rồi chuyển sang điểm tiếp theo"
              style={styles.dropButton}
            />
            <Button
              title="Giữ để hỏi"
              icon={decision === 'kept' ? 'checkmark-circle' : 'bookmark-outline'}
              onPress={() => decide('kept')}
              accessibilityHint="Đưa câu hỏi này vào tin nhắn cho chủ nhà, rồi chuyển sang điểm tiếp theo"
              style={styles.keepButton}
            />
          </View>
        </View>
      </View>

      {viewerOpen && group?.page && group.size ? (
        <PageViewer
          visible
          onClose={() => setViewerOpen(false)}
          uri={group.page.uri}
          imageSize={group.size}
          boxes={group.lines.map((l) => l.bbox)}
          severity={flag.severity}
          pageNumber={group.pageNumber}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

function HeaderIcon({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'chevron-up' | 'chevron-down';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.headerIcon,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={22} color={colors.textOnStage} />
    </Pressable>
  );
}

function LinkButton({
  icon,
  title,
  hint,
  onPress,
}: {
  icon: IconName;
  title: string;
  hint?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
      hitSlop={spacing.xs}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={18} color={colors.primary} />
      <AppText variant="label" color={colors.primary}>
        {title}
      </AppText>
    </Pressable>
  );
}

function StageMessage({
  icon,
  title,
  text,
  note,
}: {
  icon: IconName;
  title: string;
  text: string;
  note?: string;
}) {
  return (
    <View style={styles.stageMessage}>
      <Ionicons name={icon} size={36} color={colors.textOnStage} />
      <AppText variant="heading" color={colors.textOnStage} center>
        {title}
      </AppText>
      <AppText color={colors.textOnStageMuted} center>
        {text}
      </AppText>
      {note ? (
        <AppText variant="caption" color={colors.textOnStageMuted} center>
          {note}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.stage },
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.35 },
  headerNav: { flexDirection: 'row' },
  headerIcon: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    flex: 1,
    minHeight: 120,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  pageTabs: { flexDirection: 'row', gap: spacing.sm },
  pageTab: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.textOnStageMuted,
  },
  pageTabSelected: { backgroundColor: colors.textOnStage, borderColor: colors.textOnStage },
  stageFallback: { flex: 1, justifyContent: 'center' },
  stageMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  sheet: {
    marginTop: -spacing.lg,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg + spacing.sm,
    borderTopRightRadius: radius.lg + spacing.sm,
  },
  handleArea: {
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: { width: 40, height: 5, borderRadius: radius.pill, backgroundColor: colors.border },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  sheetContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  ask: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  askActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    marginTop: spacing.xs,
  },
  link: {
    alignSelf: 'flex-start',
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  details: { gap: spacing.lg },
  detailBlock: { gap: spacing.xs },
  quoteText: { fontStyle: 'italic' },
  input: {
    ...typography.body,
    color: colors.text,
    minHeight: 112,
    minWidth: MIN_TOUCH,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  dropButton: { flex: 1, paddingHorizontal: spacing.sm },
  keepButton: { flex: 1.6, paddingHorizontal: spacing.sm },
});
