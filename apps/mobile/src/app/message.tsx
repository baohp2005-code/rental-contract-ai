/**
 * Màn 6: tin nhắn gửi chủ nhà.
 *
 * Sinh viên chọn cách xưng hô và giọng văn, sửa bản nháp cho giống giọng mình,
 * rồi tự sao chép hoặc chia sẻ sang Zalo. Ứng dụng không tự gửi gì.
 */
import type { Addressing, Tone } from '@rental/shared';
import { Redirect, router } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewInstance,
} from 'react-native';

import { CopyableList } from '@/components/message/CopyableList';
import { DraftEditor } from '@/components/message/DraftEditor';
import { NoAutoSendNote } from '@/components/message/NoAutoSendNote';
import { useFlash } from '@/components/message/useFlash';
import { useKeyboardVisible } from '@/components/message/useKeyboardVisible';
import {
  AppText,
  Button,
  Card,
  Disclaimer,
  MockBanner,
  Screen,
  SegmentedControl,
} from '@/components/ui';
import { api } from '@/lib/api';
import { addressingLabel, toneLabel } from '@/lib/format';
import {
  buildShareText,
  cleanClauses,
  copyText,
  isEdited,
  normalizeText,
  shareText,
  summarizePoints,
} from '@/lib/share';
import { selectKeptFlags, useAppStore } from '@/lib/store';
import { MIN_TOUCH, colors, radius, spacing } from '@/theme';

const addressingOptions = (Object.keys(addressingLabel) as Addressing[]).map((value) => ({
  value,
  label: addressingLabel[value],
}));

const toneOptions = (Object.keys(toneLabel) as Tone[]).map((value) => ({
  value,
  label: toneLabel[value],
}));

/** Chiều cao tối đa của ô sửa khi bàn phím đóng. */
const EDITOR_MAX_HEIGHT = 320;
/**
 * Phần phía trên ô chữ (dòng tiêu đề "Tin nhắn của bạn" cao MIN_TOUCH) cộng lề,
 * để ô chữ vừa khung nhìn khi bàn phím mở.
 */
const EDITOR_CHROME = MIN_TOUCH + spacing.sm + spacing.lg * 2;

export default function MessageScreen() {
  const analysis = useAppStore((s) => s.analysis);
  const decisions = useAppStore((s) => s.decisions);
  const editedQuestions = useAppStore((s) => s.editedQuestions);
  const addressing = useAppStore((s) => s.addressing);
  const tone = useAppStore((s) => s.tone);
  const messageStatus = useAppStore((s) => s.messageStatus);
  const messageError = useAppStore((s) => s.messageError);
  const message = useAppStore((s) => s.message);
  const setAddressing = useAppStore((s) => s.setAddressing);
  const setTone = useAppStore((s) => s.setTone);
  const composeMessage = useAppStore((s) => s.composeMessage);
  const reset = useAppStore((s) => s.reset);

  const keptCount = useMemo(
    () => selectKeptFlags({ analysis, decisions, editedQuestions }).length,
    [analysis, decisions, editedQuestions],
  );
  const hasInput = !!analysis && keptCount > 0;

  // Đang rời màn này để bắt đầu hợp đồng mới: không chuyển hướng về /overview nữa.
  const [leaving, setLeaving] = useState(false);
  // Sinh viên đã sao chép hoặc chia sẻ ít nhất một lần.
  const [exported, setExported] = useState(false);
  // Bản sinh viên đang sửa, gắn với bản gốc nó được sửa từ đó.
  // Khi có bản nháp mới (base khác) thì phần sửa cũ tự hết hiệu lực.
  const [edit, setEdit] = useState<{ base: string; text: string } | null>(null);
  const [editorFocused, setEditorFocused] = useState(false);
  const [copied, flashCopied] = useFlash(3000);

  const keyboardVisible = useKeyboardVisible();
  const headerHeight = useHeaderHeight();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [editorY, setEditorY] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  // Soạn bản nháp mới khi vừa vào màn, hoặc khi xưng hô/giọng văn/lựa chọn vừa đổi.
  useEffect(() => {
    if (!leaving && hasInput && messageStatus === 'idle') {
      void composeMessage();
    }
  }, [leaving, hasInput, messageStatus, composeMessage]);

  const clauses = useMemo(() => cleanClauses(message?.suggested_clauses ?? []), [message]);
  // Bản gốc = tin nhắn + các đề nghị ghi thêm vào hợp đồng. Sinh viên thấy đúng
  // những gì sẽ được sao chép/chia sẻ, và sửa được tất cả.
  const original = useMemo(
    () =>
      message
        ? buildShareText({
            message: message.message,
            clauses,
            addressing,
            includeClauses: true,
          })
        : '',
    [message, clauses, addressing],
  );
  const draft = edit && edit.base === original ? edit.text : original;
  const edited = isEdited(draft, original);
  const canSend = normalizeText(draft).length > 0;
  const running = messageStatus === 'running';
  const ready = messageStatus === 'done' && !!message;

  // Khi bàn phím mở, cuộn để ô sửa nằm trọn trong phần nhìn thấy.
  const editorMaxHeight =
    keyboardVisible && viewportHeight > 0
      ? Math.max(120, Math.min(EDITOR_MAX_HEIGHT, viewportHeight - EDITOR_CHROME))
      : EDITOR_MAX_HEIGHT;
  useEffect(() => {
    if (keyboardVisible && editorFocused) {
      scrollRef.current?.scrollTo({ y: Math.max(0, editorY - spacing.sm), animated: true });
    }
  }, [keyboardVisible, editorFocused, editorY, viewportHeight]);

  if (!hasInput) {
    if (leaving) return <Screen scroll={false}>{null}</Screen>;
    return <Redirect href="/overview" />;
  }

  /** Đổi xưng hô/giọng văn. Nếu sinh viên đã sửa bản nháp thì hỏi trước khi bỏ. */
  const changeSetting = (change: () => void) => {
    if (running) return;
    const apply = () => {
      setEdit(null);
      change();
    };
    if (!edited) {
      apply();
      return;
    }
    Alert.alert(
      'Soạn lại tin nhắn?',
      'Đổi cách xưng hô hoặc giọng văn sẽ soạn tin nhắn mới. Phần bạn đã sửa sẽ mất.',
      [
        { text: 'Giữ bản đang sửa', style: 'cancel' },
        { text: 'Soạn lại', style: 'destructive', onPress: apply },
      ],
    );
  };

  const onRestore = () => {
    Alert.alert('Khôi phục bản gốc?', 'Phần bạn đã sửa sẽ mất.', [
      { text: 'Không', style: 'cancel' },
      { text: 'Khôi phục', style: 'destructive', onPress: () => setEdit(null) },
    ]);
  };

  const goChangeSelection = () => {
    const go = () => router.dismissTo('/overview');
    if (!edited) {
      go();
      return;
    }
    Alert.alert(
      'Quay lại chọn điểm?',
      'Phần bạn đã sửa trong tin nhắn sẽ mất. Bạn có thể sao chép trước khi quay lại.',
      [
        { text: 'Ở lại', style: 'cancel' },
        { text: 'Quay lại', style: 'destructive', onPress: go },
      ],
    );
  };

  const onCopy = async () => {
    if (await copyText(draft)) {
      setExported(true);
      flashCopied('Đã sao chép tin nhắn');
    } else {
      Alert.alert(
        'Chưa sao chép được',
        'Bạn thử giữ lâu vào ô tin nhắn để chọn và sao chép bằng tay nhé.',
      );
    }
  };

  const onShare = async () => {
    const outcome = await shareText(draft);
    if (outcome === 'shared') setExported(true);
    if (outcome === 'failed') {
      Alert.alert(
        'Không mở được bảng chia sẻ',
        'Bạn bấm "Sao chép" rồi mở Zalo, dán vào ô chat với chủ nhà nhé.',
      );
    }
  };

  const onStartOver = () => {
    Alert.alert(
      'Kiểm tra hợp đồng khác?',
      'Kết quả và tin nhắn của hợp đồng này sẽ bị xóa khỏi máy. Nhớ sao chép hoặc gửi tin nhắn trước nhé.',
      [
        { text: 'Ở lại', style: 'cancel' },
        {
          text: 'Bắt đầu lại',
          style: 'destructive',
          onPress: () => {
            setLeaving(true);
            reset();
            // Quay về màn chụp có sẵn trong stack, không chồng thêm màn mới.
            router.dismissTo('/capture');
          },
        },
      ],
    );
  };

  const footer = ready ? (
    <>
      {copied ? (
        <View style={styles.copiedNote} accessibilityLiveRegion="polite">
          <AppText variant="caption" color={colors.success} center>
            Đã sao chép. Mở Zalo, dán vào ô chat với chủ nhà, đọc lại rồi tự bấm gửi.
          </AppText>
        </View>
      ) : !keyboardVisible ? (
        <AppText variant="caption" color={colors.textMuted} center>
          Bạn tự xem lại và gửi. Ứng dụng không tự gửi gì cho chủ nhà.
        </AppText>
      ) : null}
      <View style={styles.actions}>
        <Button
          title={copied ? 'Đã sao chép' : 'Sao chép'}
          icon={copied ? 'checkmark-circle' : 'copy-outline'}
          variant="secondary"
          onPress={onCopy}
          disabled={!canSend}
          accessibilityHint="Chép cả tin nhắn để dán vào Zalo"
          style={styles.action}
        />
        <Button
          title="Chia sẻ"
          icon="share-outline"
          onPress={onShare}
          disabled={!canSend}
          accessibilityHint="Mở bảng chia sẻ để bạn chọn Zalo hoặc ứng dụng khác. Không tự gửi."
          style={styles.action}
        />
      </View>
      {exported && !keyboardVisible ? (
        <Button
          title="Kiểm tra hợp đồng khác"
          icon="document-text-outline"
          variant="ghost"
          onPress={onStartOver}
        />
      ) : null}
    </>
  ) : undefined;

  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
      style={styles.flex}
    >
      <Screen scroll={false} padded={false} footer={footer}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
        >
          {api.isMock ? <MockBanner /> : null}
          <NoAutoSendNote />

          <Card>
            <View style={styles.setting}>
              <AppText variant="label" color={colors.textMuted}>
                Xưng hô với chủ nhà
              </AppText>
              <View style={running ? styles.locked : undefined}>
                <SegmentedControl
                  options={addressingOptions}
                  value={addressing}
                  onChange={(value) => {
                    if (value !== addressing) changeSetting(() => setAddressing(value));
                  }}
                  accessibilityLabel="Cách xưng hô với chủ nhà"
                />
              </View>
            </View>
            <View style={styles.setting}>
              <AppText variant="label" color={colors.textMuted}>
                Giọng văn
              </AppText>
              <View style={running ? styles.locked : undefined}>
                <SegmentedControl
                  options={toneOptions}
                  value={tone}
                  onChange={(value) => {
                    if (value !== tone) changeSetting(() => setTone(value));
                  }}
                  accessibilityLabel="Giọng văn của tin nhắn"
                />
              </View>
            </View>
          </Card>

          <Card>
            <AppText>
              {summarizePoints(
                message?.questions.length ?? keptCount,
                ready ? clauses.length : 0,
              )}
            </AppText>
            <Button
              title="Đổi điểm muốn hỏi"
              icon="list-outline"
              variant="ghost"
              onPress={goChangeSelection}
              accessibilityHint="Quay lại danh sách cảnh báo để giữ hoặc bỏ điểm"
              style={styles.alignStart}
            />
          </Card>

          {running || messageStatus === 'idle' ? (
            <Card style={styles.center}>
              <ActivityIndicator color={colors.primary} size="large" />
              <AppText variant="bodyStrong" center accessibilityLiveRegion="polite">
                Đang soạn tin nhắn…
              </AppText>
              <AppText variant="caption" color={colors.textMuted} center>
                Có thể mất vài giây.
              </AppText>
            </Card>
          ) : null}

          {messageStatus === 'error' ? (
            <Card style={styles.center}>
              <AppText variant="bodyStrong" center>
                Chưa soạn được tin nhắn
              </AppText>
              <AppText color={colors.textMuted} center accessibilityLiveRegion="polite">
                {messageError?.message ?? 'Có lỗi xảy ra. Bạn thử lại nhé.'}
              </AppText>
              <Button
                title="Thử lại"
                icon="refresh-outline"
                onPress={() => void composeMessage()}
                style={styles.stretch}
              />
            </Card>
          ) : null}

          {ready ? (
            <>
              <DraftEditor
                value={draft}
                onChangeText={(text) => setEdit({ base: original, text })}
                edited={edited}
                focused={editorFocused}
                onFocusChange={setEditorFocused}
                onRestore={onRestore}
                maxHeight={editorMaxHeight}
                onLayout={(e) => setEditorY(e.nativeEvent.layout.y)}
              />

              <CopyableList
                title="Từng câu hỏi"
                hint="Muốn hỏi từng ý một, hoặc hỏi trực tiếp? Chép riêng từng câu."
                items={message.questions}
                numbered
                itemName="câu hỏi"
              />
              <CopyableList
                title="Đề nghị ghi thêm vào hợp đồng"
                hint="Nhờ chủ nhà ghi rõ những ý này vào hợp đồng trước khi ký."
                items={clauses}
                itemName="đề nghị"
              />
            </>
          ) : null}

          <Disclaimer />
        </ScrollView>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg },
  setting: { gap: spacing.xs },
  locked: { opacity: 0.5, pointerEvents: 'none' },
  center: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  stretch: { alignSelf: 'stretch' },
  alignStart: { alignSelf: 'flex-start' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
  copiedNote: {
    backgroundColor: colors.successSoft,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
});
