/**
 * Màn 4: kết quả, bố cục "hình trước, chữ sau".
 *
 * Trên cùng là số điểm nên xem và dải chip các khoản chính (chạm để mở bảng đầy đủ).
 * Giữa là ảnh thu nhỏ các trang đã tô sẵn, mỗi điểm có số thứ tự; bên dưới là danh sách
 * cùng số đó. Việc tiếp theo nằm ở chân màn: xem điểm kế tiếp, hoặc soạn tin nhắn.
 */
import type { Flag } from '@rental/shared';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';

import { KeyTermChips } from '@/components/overview/KeyTermChips';
import { KeyTermsCard } from '@/components/overview/KeyTermsCard';
import { NoFlagsCard } from '@/components/overview/NoFlagsCard';
import { NumberedFlagList } from '@/components/overview/NumberedFlagList';
import { PageMap } from '@/components/overview/PageMap';
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
import { MIN_TOUCH, colors, radius, spacing } from '@/theme';

export default function OverviewScreen() {
  const analysis = useAppStore((s) => s.analysis);
  const pages = useAppStore((s) => s.pages);
  const decisions = useAppStore((s) => s.decisions);
  const reset = useAppStore((s) => s.reset);
  const [termsOpen, setTermsOpen] = useState(false);

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
          accessibilityHint="Xóa kết quả này và chụp hợp đồng mới"
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

  const toggleTerms = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTermsOpen((open) => !open);
  }, []);

  if (!analysis) return null;

  const hasHighlights = flags.some((f) => f.line_ids.length > 0) && pages.length > 0;

  return (
    <Screen footer={progress.total > 0 ? <Footer progress={progress} nextFlag={nextFlag} /> : null}>
      <Stack.Screen options={screenOptions} />
      {api.isMock ? <MockBanner /> : null}

      {progress.total > 0 ? <Summary progress={progress} /> : <NoFlagsCard />}

      <KeyTermChips rows={termRows} expanded={termsOpen} onToggle={toggleTerms} />
      {termsOpen ? <KeyTermsCard rows={termRows} /> : null}

      {flags.length > 0 ? (
        <>
          {hasHighlights ? (
            <PageMap
              flags={flags}
              lines={analysis.lines}
              pages={pages}
              pageInfo={analysis.pages}
              onOpen={openFlag}
            />
          ) : null}
          <NumberedFlagList flags={flags} decisions={decisions} onOpen={openFlag} />
        </>
      ) : null}

      <Disclaimer variant="inline" />
    </Screen>
  );
}

function Summary({ progress }: { progress: ReviewProgress }) {
  const reviewed = progress.kept + progress.dropped;
  return (
    <View
      style={styles.summary}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${progress.total} điểm nên xem. Đã xem ${reviewed}, giữ ${progress.kept}`}
      accessibilityValue={{ min: 0, max: progress.total, now: reviewed }}
    >
      <AppText variant="title">{progress.total} điểm nên xem</AppText>
      <AppText variant="caption" color={colors.textMuted}>
        Đã xem {reviewed}/{progress.total} · giữ {progress.kept}. Bạn xem từng điểm rồi tự quyết
        nhé.
      </AppText>
      <View style={styles.track}>
        <View
          style={[styles.fill, { width: `${Math.round((reviewed / progress.total) * 100)}%` }]}
        />
      </View>
    </View>
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
  const allDropped = !hasKept && pending === 0;
  const nextNumber = useAppStore((s) =>
    nextFlag ? selectSortedFlags(s).findIndex((f) => f.id === nextFlag.id) + 1 : 0,
  );

  return (
    <View style={styles.footer}>
      {allDropped ? (
        <AppText variant="caption" color={colors.textMuted}>
          Bạn đã bỏ qua tất cả các điểm, nên chưa có gì để soạn tin nhắn.
        </AppText>
      ) : null}
      <View style={styles.footerRow}>
        <Button
          title={`Soạn tin (${kept})`}
          icon="chatbubble-ellipses-outline"
          variant={hasKept && !nextFlag ? 'primary' : 'secondary'}
          disabled={!hasKept}
          onPress={() => router.push('/message')}
          accessibilityHint={
            hasKept
              ? 'Soạn tin nhắn hỏi chủ nhà từ các điểm bạn đã giữ'
              : 'Chọn Giữ ở ít nhất một điểm trước khi soạn tin nhắn'
          }
          style={styles.flex}
        />
        {nextFlag ? (
          <Button
            title={`Xem điểm ${nextNumber}`}
            icon="arrow-forward"
            onPress={() => router.push(`/flag/${nextFlag.id}`)}
            accessibilityHint={`Mở điểm: ${nextFlag.title}`}
            style={styles.next}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, paddingHorizontal: spacing.sm },
  next: { flex: 1.4, paddingHorizontal: spacing.sm },
  headerButton: {
    minHeight: MIN_TOUCH,
    minWidth: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  pressed: { opacity: 0.6 },
  summary: { gap: spacing.xs },
  track: {
    height: 6,
    marginTop: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primary },
  footer: { gap: spacing.sm },
  footerRow: { flexDirection: 'row', gap: spacing.sm },
});
