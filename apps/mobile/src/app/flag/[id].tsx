/**
 * Chi tiết một cảnh báo: dòng hợp đồng được tô ngay trên ảnh, giải thích dễ hiểu,
 * câu hỏi gợi ý cho chủ nhà (sửa được), và sinh viên tự quyết định giữ hay bỏ qua.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Redirect, Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DocumentHighlight } from '@/components/document';
import {
  AppText,
  Button,
  Card,
  LowConfidenceNote,
  Screen,
  SeverityBadge,
  TypeBadge,
} from '@/components/ui';
import {
  selectFlag,
  selectLinesForFlag,
  selectNextPendingFlag,
  selectQuestion,
  selectReviewProgress,
  selectSortedFlags,
  useAppStore,
  type Decision,
} from '@/lib/store';
import { MIN_TOUCH, colors, radius, severityColors, spacing, typography } from '@/theme';

/** Chiều cao thanh tiêu đề iOS, để bàn phím không che ô sửa câu hỏi. */
const IOS_HEADER_HEIGHT = 44;

export default function FlagDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? '';
  const insets = useSafeAreaInsets();

  const analysis = useAppStore((s) => s.analysis);
  const pages = useAppStore((s) => s.pages);
  const decisions = useAppStore((s) => s.decisions);
  const editedQuestions = useAppStore((s) => s.editedQuestions);
  const setDecision = useAppStore((s) => s.setDecision);
  const setEditedQuestion = useAppStore((s) => s.setEditedQuestion);

  // Bản nháp khi đang sửa câu hỏi. Gắn với id để chuyển sang điểm khác là tự bỏ.
  const [draft, setDraft] = useState<{ id: string; text: string } | null>(null);
  const editing = draft?.id === id ? draft : null;

  const flag = useMemo(() => selectFlag({ analysis }, id), [analysis, id]);
  const lines = useMemo(
    () => (flag ? selectLinesForFlag({ analysis }, flag) : []),
    [analysis, flag],
  );
  const sorted = useMemo(() => selectSortedFlags({ analysis }), [analysis]);
  const progress = useMemo(
    () => selectReviewProgress({ analysis, decisions }),
    [analysis, decisions],
  );

  if (!analysis || !flag) return <Redirect href="/overview" />;

  const position = sorted.findIndex((f) => f.id === flag.id) + 1;
  const total = sorted.length;
  const reviewed = progress.kept + progress.dropped;
  const decision: Decision = decisions[flag.id] ?? 'pending';
  const question = selectQuestion({ editedQuestions }, flag);
  const isEdited = question !== flag.question_for_landlord;
  const isMissing = flag.type === 'missing';
  const quote = flag.quote.trim() || lines.map((l) => l.text).join(' ');
  const sev = severityColors[flag.severity];

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

  const footer = (
    <View style={styles.footer}>
      <View style={styles.statusRow} accessibilityLiveRegion="polite">
        {decision === 'pending' ? (
          <AppText variant="caption" color={colors.textMuted}>
            Bạn muốn làm gì với điểm này? Bạn đổi lại được bất cứ lúc nào.
          </AppText>
        ) : (
          <>
            <Ionicons
              name={decision === 'kept' ? 'bookmark' : 'remove-circle-outline'}
              size={16}
              color={decision === 'kept' ? colors.primary : colors.textMuted}
            />
            <AppText variant="caption" color={colors.textMuted} style={styles.flex}>
              {decision === 'kept'
                ? 'Bạn đã giữ điểm này để hỏi chủ nhà. Bấm "Bỏ qua" nếu muốn đổi.'
                : 'Bạn đã bỏ qua điểm này. Bấm "Giữ" nếu muốn hỏi lại.'}
            </AppText>
          </>
        )}
      </View>
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
          title="Giữ để hỏi chủ nhà"
          icon={decision === 'kept' ? 'checkmark-circle' : 'bookmark-outline'}
          onPress={() => decide('kept')}
          accessibilityHint="Đưa câu hỏi này vào tin nhắn cho chủ nhà, rồi chuyển sang điểm tiếp theo"
          style={styles.keepButton}
        />
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top + IOS_HEADER_HEIGHT}
    >
      <Stack.Screen options={{ title: `Điểm ${position}/${total}` }} />
      <Screen footer={footer}>
        {/* Tiến độ */}
        <View style={styles.progress}>
          <AppText variant="caption" color={colors.textMuted}>
            Điểm {position}/{total} · Bạn đã xem {reviewed}/{total} điểm
          </AppText>
          <View
            style={styles.progressTrack}
            accessibilityRole="progressbar"
            accessibilityLabel={`Đã xem ${reviewed} trên ${total} điểm`}
            accessibilityValue={{ min: 0, max: total, now: reviewed }}
          >
            <View
              style={[
                styles.progressFill,
                { width: `${total > 0 ? (reviewed / total) * 100 : 0}%` },
              ]}
            />
          </View>
        </View>

        {/* Mức độ, loại, tiêu đề */}
        <View style={styles.titleBlock}>
          <View style={styles.badges}>
            <SeverityBadge severity={flag.severity} />
            <TypeBadge type={flag.type} />
          </View>
          <AppText variant="title" accessibilityRole="header">
            {flag.title}
          </AppText>
        </View>

        {/* Nằm ở đâu */}
        {isMissing ? (
          <View style={[styles.missing, { borderLeftColor: sev.border }]}>
            <View style={styles.row}>
              <Ionicons name="search-outline" size={20} color={colors.text} />
              <AppText variant="bodyStrong" style={styles.flex}>
                Hợp đồng không có nội dung này
              </AppText>
            </View>
            <AppText>
              App đã đọc các trang bạn chụp và không thấy hợp đồng nói tới điều này. Khi hợp đồng
              không ghi, nếu sau này hai bên hiểu khác nhau thì bạn không có gì trên giấy để dựa
              vào.
            </AppText>
            <AppText variant="caption" color={colors.textMuted}>
              Nếu nội dung này nằm ở trang bạn chưa chụp, bạn có thể bỏ qua điểm này.
            </AppText>
          </View>
        ) : (
          <View style={styles.section}>
            <AppText variant="heading" accessibilityRole="header">
              Nằm ở đâu trong hợp đồng
            </AppText>
            {lines.length > 0 ? (
              <DocumentHighlight
                lines={lines}
                pages={pages}
                pageInfo={analysis.pages}
                severity={flag.severity}
              />
            ) : (
              <AppText variant="caption" color={colors.textMuted}>
                App không tìm lại được vị trí dòng này trên ảnh. Bạn đọc câu trích bên dưới nhé.
              </AppText>
            )}
            {quote ? (
              <View style={[styles.quote, { borderLeftColor: sev.border }]}>
                <AppText variant="label" color={colors.textMuted}>
                  Hợp đồng ghi:
                </AppText>
                <AppText style={styles.quoteText}>“{quote}”</AppText>
              </View>
            ) : null}
          </View>
        )}

        {/* Giải thích */}
        <Card>
          <AppText variant="heading" accessibilityRole="header">
            {isMissing ? 'Vì sao điều này quan trọng' : 'Vì sao bạn nên chú ý'}
          </AppText>
          <AppText>{flag.explanation}</AppText>
          {flag.what_is_common.trim() ? (
            <View style={styles.common}>
              <AppText variant="label" color={colors.textMuted}>
                Thường gặp ở Hà Nội
              </AppText>
              <AppText>{flag.what_is_common}</AppText>
            </View>
          ) : null}
          <LowConfidenceNote confidence={flag.confidence} />
        </Card>

        {/* Câu hỏi cho chủ nhà */}
        <Card>
          <AppText variant="heading" accessibilityRole="header">
            Câu hỏi gợi ý cho chủ nhà
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
              {isEdited ? (
                <AppText variant="caption" color={colors.textMuted}>
                  Bạn đã sửa câu này.
                </AppText>
              ) : null}
              <View style={styles.actions}>
                <Button
                  title="Sửa câu hỏi"
                  variant="ghost"
                  icon="create-outline"
                  onPress={() => setDraft({ id: flag.id, text: question })}
                  accessibilityHint="Viết lại câu hỏi theo cách của bạn trước khi giữ"
                />
                {isEdited ? (
                  <Button
                    title="Dùng lại câu gốc"
                    variant="ghost"
                    icon="arrow-undo-outline"
                    onPress={() => setEditedQuestion(flag.id, '')}
                  />
                ) : null}
              </View>
            </>
          )}
        </Card>

        {/* Đề nghị ghi vào hợp đồng */}
        {flag.suggested_clause.trim() ? (
          <Card>
            <AppText variant="heading" accessibilityRole="header">
              Đề nghị ghi thêm vào hợp đồng
            </AppText>
            <AppText>{flag.suggested_clause}</AppText>
            <AppText variant="caption" color={colors.textMuted}>
              Bạn có thể nhờ chủ nhà ghi câu này vào hợp đồng nếu hai bên đồng ý.
            </AppText>
          </Card>
        ) : null}

        <AppText variant="caption" color={colors.textMuted} center>
          Đây là gợi ý để bạn hỏi lại, không phải tư vấn pháp lý. App không tự gửi gì cho chủ nhà.
        </AppText>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  progress: { gap: spacing.xs },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primary },
  titleBlock: { gap: spacing.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  section: { gap: spacing.md },
  quote: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderLeftWidth: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  quoteText: { fontStyle: 'italic' },
  missing: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderLeftWidth: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  common: { gap: spacing.xs, paddingTop: spacing.xs },
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
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  footer: { gap: spacing.sm },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  dropButton: { flex: 1, paddingHorizontal: spacing.sm },
  keepButton: { flex: 1.6, paddingHorizontal: spacing.sm },
});
