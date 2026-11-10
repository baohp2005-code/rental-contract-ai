/**
 * Màn 4: kết quả.
 *
 * Một màn để sinh viên thấy hợp đồng nói gì về tiền và thời gian, có bao nhiêu điểm nên xem,
 * và việc tiếp theo là gì: xem từng điểm (màn /flag/[id]), giữ điểm muốn hỏi, rồi mới soạn tin nhắn.
 */
import type { Flag } from '@rental/shared';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet, View } from 'react-native';

import { FlagList } from '@/components/overview/FlagList';
import { KeyTermsCard } from '@/components/overview/KeyTermsCard';
import { SummaryCard } from '@/components/overview/SummaryCard';
import { AppText, Button, Disclaimer, MockBanner, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { buildKeyTermRows } from '@/lib/key-terms';
import {
  selectNextPendingFlag,
  selectReviewProgress,
  selectSortedFlags,
  useAppStore,
  type ReviewProgress,
} from '@/lib/store';
import { MIN_TOUCH, colors, spacing } from '@/theme';

export default function OverviewScreen() {
  const analysis = useAppStore((s) => s.analysis);
  const decisions = useAppStore((s) => s.decisions);
  const reset = useAppStore((s) => s.reset);

  // Khi bắt đầu lại, `reset()` làm `analysis` về null: không được chuyển hướng về "/" lúc đó.
  const leavingRef = useRef(false);

  useEffect(() => {
    if (!analysis && !leavingRef.current) {
      // Không có kết quả (ví dụ tải lại app lúc dev): về màn đầu.
      leavingRef.current = true;
      router.replace('/');
    }
  }, [analysis]);

  const flags = useMemo(() => selectSortedFlags({ analysis }), [analysis]);
  const progress = useMemo(
    () => selectReviewProgress({ analysis, decisions }),
    [analysis, decisions],
  );
  const nextFlag = useMemo(
    () => selectNextPendingFlag({ analysis, decisions }),
    [analysis, decisions],
  );
  const termRows = useMemo(
    () => (analysis ? buildKeyTermRows(analysis.key_terms) : []),
    [analysis],
  );

  const confirmStartOver = useCallback(() => {
    Alert.alert(
      'Kiểm tra hợp đồng khác?',
      'Kết quả và các lựa chọn giữ/bỏ của hợp đồng này sẽ bị xóa. Ứng dụng không lưu lại kết quả.',
      [
        { text: 'Ở lại', style: 'cancel' },
        {
          text: 'Xóa và chụp mới',
          style: 'destructive',
          onPress: () => {
            leavingRef.current = true;
            reset();
            // Quay về màn chụp có sẵn trong stack, không chồng thêm màn mới.
            router.dismissTo('/capture');
          },
        },
      ],
    );
  }, [reset]);

  // Nút Back của Android: hỏi trước khi rời kết quả, như nút "Hợp đồng khác".
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        confirmStartOver();
        return true;
      });
      return () => sub.remove();
    }, [confirmStartOver]),
  );

  const screenOptions = useMemo(
    () => ({
      headerRight: () => (
        <Pressable
          onPress={confirmStartOver}
          accessibilityRole="button"
          accessibilityLabel="Kiểm tra hợp đồng khác"
          hitSlop={spacing.sm}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
        >
          <AppText variant="label" color={colors.primary}>
            Hợp đồng khác
          </AppText>
        </Pressable>
      ),
    }),
    [confirmStartOver],
  );

  const openFlag = useCallback((flag: Flag) => router.push(`/flag/${flag.id}`), []);

  if (!analysis) return null;

  return (
    <Screen footer={progress.total > 0 ? <Footer progress={progress} nextFlag={nextFlag} /> : null}>
      <Stack.Screen options={screenOptions} />
      {api.isMock ? <MockBanner /> : null}
      <SummaryCard progress={progress} />
      <Disclaimer />
      <KeyTermsCard rows={termRows} />
      {flags.length > 0 ? (
        <FlagList flags={flags} decisions={decisions} onOpen={openFlag} />
      ) : null}
      <Button
        title="Kiểm tra hợp đồng khác"
        variant="ghost"
        icon="camera-outline"
        onPress={confirmStartOver}
        accessibilityHint="Xóa kết quả này và chụp hợp đồng mới"
      />
    </Screen>
  );
}

function Footer({
  progress,
  nextFlag,
}: {
  progress: ReviewProgress;
  nextFlag: Flag | undefined;
}) {
  const { kept, pending } = progress;
  const hasKept = kept > 0;

  const hint = hasKept
    ? null
    : pending > 0
      ? 'Mở từng điểm và chọn Giữ những điểm bạn muốn hỏi chủ nhà. Sau đó app soạn tin nhắn giúp bạn.'
      : 'Bạn đã bỏ qua tất cả các điểm, nên chưa có gì để soạn tin nhắn.';

  const next = nextFlag ? (
    <Button
      title="Xem điểm tiếp theo"
      icon="arrow-forward"
      variant={hasKept ? 'secondary' : 'primary'}
      onPress={() => router.push(`/flag/${nextFlag.id}`)}
      accessibilityHint={`Mở điểm: ${nextFlag.title}`}
    />
  ) : null;

  const compose = (
    <Button
      title={`Soạn tin nhắn (${kept} điểm)`}
      icon="chatbubble-ellipses-outline"
      variant={hasKept ? 'primary' : 'secondary'}
      disabled={!hasKept}
      onPress={() => router.push('/message')}
      accessibilityHint={
        hasKept
          ? 'Soạn tin nhắn hỏi chủ nhà từ các điểm bạn đã giữ'
          : 'Cần giữ ít nhất một điểm trước khi soạn tin nhắn'
      }
    />
  );

  return (
    <View style={styles.footer}>
      {hint ? (
        <AppText variant="caption" color={colors.textMuted}>
          {hint}
        </AppText>
      ) : null}
      {hasKept ? compose : next}
      {hasKept ? next : compose}
    </View>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    minHeight: MIN_TOUCH,
    minWidth: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  pressed: { opacity: 0.6 },
  footer: { gap: spacing.sm },
});
