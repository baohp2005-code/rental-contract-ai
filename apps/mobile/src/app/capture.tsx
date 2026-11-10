import { MAX_PAGES } from '@rental/shared';
import { useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, StyleSheet, View } from 'react-native';

import { CameraModal, type CameraOutcome } from '@/components/capture/CameraModal';
import { CaptureTips } from '@/components/capture/CaptureTips';
import { Notice, type NoticeTone } from '@/components/capture/Notice';
import { PageItem } from '@/components/capture/PageItem';
import { useAnalysisFeedback } from '@/components/capture/useAnalysisFeedback';
import { AppText, Button, MockBanner, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import {
  formatPageNumbers,
  normalizeImage,
  remainingSlots,
  splitByLimit,
} from '@/lib/capture';
import { useAppStore } from '@/lib/store';
import { colors, spacing } from '@/theme';

/** Camera đang mở để thêm trang mới, hay để chụp lại một trang có sẵn. */
type CameraTarget = { mode: 'add' } | { mode: 'replace'; pageId: string };

type Message = { tone: NoticeTone; text: string; showSettings?: boolean };

const LIMIT_TEXT = `Mỗi hợp đồng tối đa ${MAX_PAGES} trang.`;

export default function CaptureScreen() {
  const pages = useAppStore((s) => s.pages);
  const feedback = useAnalysisFeedback();

  const [cameraPermission, requestCameraPermission, getCameraPermission] = useCameraPermissions();
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(null);
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  const full = pages.length >= MAX_PAGES;
  const working = busy !== null;
  const hasUserPages = pages.some((p) => p.origin !== 'sample');

  // Người dùng có thể bật quyền camera trong Cài đặt rồi quay lại app.
  useEffect(() => {
    if (!cameraBlocked) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void getCameraPermission().then((response) => {
        if (response.granted) setCameraBlocked(false);
      });
    });
    return () => subscription.remove();
  }, [cameraBlocked, getCameraPermission]);

  // ---------- Camera ----------

  const openCamera = async (target: CameraTarget) => {
    if (target.mode === 'add' && full) {
      setMessage({ tone: 'warning', text: `${LIMIT_TEXT} Bạn xóa bớt trang để chụp thêm nhé.` });
      return;
    }
    setMessage(null);
    let granted = cameraPermission?.granted ?? false;
    if (!granted) {
      try {
        granted = (await requestCameraPermission()).granted;
      } catch {
        granted = false;
      }
    }
    if (!granted) {
      setCameraBlocked(true);
      return;
    }
    setCameraBlocked(false);
    setCameraTarget(target);
  };

  const handlePhoto = async (uri: string): Promise<CameraOutcome> => {
    const target = cameraTarget;
    if (!target) return 'failed';
    let page;
    try {
      page = await normalizeImage(uri, 'camera');
    } catch {
      return 'failed';
    }
    const store = useAppStore.getState();
    if (target.mode === 'replace') {
      store.replacePage(target.pageId, page);
      setCameraTarget(null);
      setMessage({ tone: 'success', text: 'Đã thay ảnh mới cho trang này.' });
      return 'replaced';
    }
    if (!store.addPage(page)) {
      setCameraTarget(null);
      setMessage({ tone: 'warning', text: `${LIMIT_TEXT} Ảnh vừa chụp chưa được thêm.` });
      return 'full';
    }
    // Đủ trang thì đóng camera; dòng nhắc "đã đủ trang" hiện sẵn trên màn chụp.
    if (useAppStore.getState().pages.length >= MAX_PAGES) setCameraTarget(null);
    return 'added';
  };

  // ---------- Thư viện ảnh ----------

  const pickFromLibrary = async (replaceId?: string) => {
    const slots = replaceId ? 1 : remainingSlots(useAppStore.getState().pages.length);
    if (slots === 0) {
      setMessage({ tone: 'warning', text: `${LIMIT_TEXT} Bạn xóa bớt trang để thêm ảnh khác nhé.` });
      return;
    }
    setMessage(null);

    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: !replaceId,
        selectionLimit: replaceId ? 1 : slots,
        orderedSelection: true,
        quality: 1,
      });
    } catch {
      setMessage({
        tone: 'danger',
        text: 'Không mở được thư viện ảnh. Nếu bạn đã chặn quyền xem ảnh, hãy mở Cài đặt để cho phép.',
        showSettings: true,
      });
      return;
    }
    if (result.canceled || result.assets.length === 0) return;

    const uris = result.assets.map((a) => a.uri);
    if (replaceId) {
      await importImages(uris.slice(0, 1), replaceId);
    } else {
      await importImages(uris);
    }
  };

  /** Chuẩn hóa lần lượt từng ảnh rồi thêm (hoặc thay) vào danh sách. */
  const importImages = async (uris: string[], replaceId?: string) => {
    const { accepted, skipped } = replaceId
      ? { accepted: uris, skipped: 0 }
      : splitByLimit(uris, useAppStore.getState().pages.length);
    let added = 0;
    let failed = 0;
    let overflow = skipped;

    for (let i = 0; i < accepted.length; i += 1) {
      setBusy(
        accepted.length > 1 ? `Đang xử lý ảnh ${i + 1}/${accepted.length}…` : 'Đang xử lý ảnh…',
      );
      let page;
      try {
        page = await normalizeImage(accepted[i], 'library');
      } catch {
        failed += 1;
        continue;
      }
      const store = useAppStore.getState();
      if (replaceId) {
        store.replacePage(replaceId, page);
        added += 1;
      } else if (store.addPage(page)) {
        added += 1;
      } else {
        overflow += accepted.length - i;
        break;
      }
    }
    setBusy(null);

    const parts: string[] = [];
    if (added > 0) {
      parts.push(replaceId ? 'Đã thay ảnh mới cho trang này.' : `Đã thêm ${added} trang.`);
    }
    if (failed > 0) parts.push(`Không mở được ${failed} ảnh, bạn thử chọn lại hoặc chụp lại nhé.`);
    if (overflow > 0) parts.push(`${LIMIT_TEXT} ${overflow} ảnh còn lại chưa được thêm.`);
    if (parts.length > 0) {
      const tone: NoticeTone = failed > 0 || overflow > 0 ? 'warning' : 'success';
      setMessage({ tone, text: parts.join(' ') });
    }
  };

  // ---------- Thao tác trên từng trang ----------

  const replacePageFlow = (pageId: string, number: number) => {
    Alert.alert(`Thay ảnh trang ${number}`, 'Bạn muốn lấy ảnh mới từ đâu?', [
      { text: 'Chụp bằng camera', onPress: () => void openCamera({ mode: 'replace', pageId }) },
      { text: 'Chọn từ thư viện', onPress: () => void pickFromLibrary(pageId) },
      { text: 'Hủy', style: 'cancel' },
    ]);
  };

  const removePageFlow = (pageId: string, number: number) => {
    Alert.alert(`Xóa trang ${number}?`, 'Ảnh này sẽ bị bỏ khỏi danh sách.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => {
          useAppStore.getState().removePage(pageId);
          setMessage(null);
        },
      },
    ]);
  };

  const loadSample = () => {
    const run = async () => {
      setMessage(null);
      setBusy('Đang mở hợp đồng mẫu…');
      try {
        await useAppStore.getState().loadSample();
      } catch {
        setMessage({ tone: 'danger', text: 'Không mở được hợp đồng mẫu. Bạn thử lại nhé.' });
      } finally {
        setBusy(null);
      }
    };
    if (!hasUserPages) {
      void run();
      return;
    }
    Alert.alert('Dùng hợp đồng mẫu?', 'Các trang bạn đã chụp sẽ được thay bằng hợp đồng mẫu.', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Dùng mẫu', onPress: () => void run() },
    ]);
  };

  const analyze = () => {
    if (pages.length === 0) return;
    void useAppStore.getState().startAnalysis();
    router.push('/analyzing');
  };

  // ---------- Hiển thị ----------

  const retakeNumbers = pages
    .map((p, i) => (feedback.retakeIds.includes(p.id) ? i + 1 : 0))
    .filter((n) => n > 0);

  const cameraPage =
    cameraTarget?.mode === 'replace'
      ? pages.findIndex((p) => p.id === cameraTarget.pageId) + 1
      : pages.length + 1;

  const footer = (
    <>
      {busy ? (
        <View style={styles.busy} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.primary} />
          <AppText variant="caption" color={colors.textMuted}>
            {busy}
          </AppText>
        </View>
      ) : null}
      <Button
        title={pages.length > 0 ? `Phân tích ${pages.length} trang` : 'Phân tích'}
        icon="sparkles-outline"
        onPress={analyze}
        disabled={pages.length === 0 || working}
        accessibilityHint={
          pages.length === 0 ? 'Thêm ít nhất một trang để phân tích' : 'Gửi các trang đi phân tích'
        }
      />
    </>
  );

  return (
    <Screen footer={footer}>
      {api.isMock ? (
        <View style={styles.section}>
          <MockBanner />
          <Button
            title="Dùng hợp đồng mẫu"
            icon="document-text-outline"
            variant="secondary"
            onPress={loadSample}
            disabled={working}
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <AppText variant="heading">Thêm các trang hợp đồng</AppText>
        <AppText color={colors.textMuted}>
          Chụp hoặc chọn lần lượt từng trang, đúng thứ tự trang 1, 2, 3… Tối đa {MAX_PAGES} trang.
        </AppText>
      </View>

      {retakeNumbers.length > 0 ? (
        <Notice tone="danger">
          {`App không đọc được trang ${formatPageNumbers(retakeNumbers)}. Bạn chụp lại ${
            retakeNumbers.length > 1 ? 'các trang này' : 'trang này'
          } rồi bấm phân tích lại nhé.`}
        </Notice>
      ) : null}
      {feedback.message ? <Notice tone="danger">{feedback.message}</Notice> : null}

      <View style={styles.addRow}>
        <Button
          title="Chụp ảnh"
          icon="camera-outline"
          onPress={() => void openCamera({ mode: 'add' })}
          disabled={working || full}
          style={styles.addButton}
          accessibilityHint="Mở camera để chụp trang hợp đồng"
        />
        <Button
          title="Chọn từ thư viện"
          icon="images-outline"
          variant="secondary"
          onPress={() => void pickFromLibrary()}
          disabled={working || full}
          style={styles.addButton}
          accessibilityHint="Chọn một hoặc nhiều ảnh có sẵn trong máy"
        />
      </View>

      {full ? (
        <Notice tone="info">
          {`Đã đủ ${MAX_PAGES} trang, là số trang tối đa. Muốn thêm trang khác thì xóa bớt nhé.`}
        </Notice>
      ) : null}

      {cameraBlocked ? (
        <View style={styles.section}>
          <Notice tone="warning">
            {cameraPermission && !cameraPermission.canAskAgain
              ? 'App chưa được phép dùng camera. Bạn mở Cài đặt, bật quyền Camera cho app rồi quay lại. Hoặc chọn ảnh có sẵn trong thư viện.'
              : 'Bạn chưa cho phép dùng camera. Cần quyền này để chụp hợp đồng ngay trong app. Bạn vẫn có thể chọn ảnh có sẵn trong thư viện.'}
          </Notice>
          {cameraPermission && !cameraPermission.canAskAgain ? (
            <Button
              title="Mở Cài đặt"
              icon="settings-outline"
              variant="ghost"
              onPress={() => void Linking.openSettings()}
            />
          ) : (
            <Button
              title="Cho phép dùng camera"
              icon="camera-outline"
              variant="ghost"
              onPress={() => void openCamera({ mode: 'add' })}
            />
          )}
        </View>
      ) : null}

      {message ? (
        <View style={styles.section}>
          <Notice tone={message.tone}>{message.text}</Notice>
          {message.showSettings ? (
            <Button
              title="Mở Cài đặt"
              icon="settings-outline"
              variant="ghost"
              onPress={() => void Linking.openSettings()}
            />
          ) : null}
        </View>
      ) : null}

      {pages.length === 0 ? (
        <CaptureTips />
      ) : (
        <View style={styles.section}>
          <AppText variant="bodyStrong">
            {pages.length}/{MAX_PAGES} trang
          </AppText>
          {pages.map((page, index) => (
            <PageItem
              key={page.id}
              page={page}
              index={index}
              total={pages.length}
              needsRetake={feedback.retakeIds.includes(page.id)}
              disabled={working}
              onMove={(direction) => useAppStore.getState().movePage(page.id, direction)}
              onReplace={() => replacePageFlow(page.id, index + 1)}
              onRemove={() => removePageFlow(page.id, index + 1)}
            />
          ))}
        </View>
      )}

      {cameraTarget ? (
        <CameraModal
          title={
          cameraTarget?.mode === 'replace' ? `Chụp lại trang ${cameraPage}` : `Trang ${cameraPage}`
        }
        pageCount={pages.length}
        maxPages={MAX_PAGES}
        lastPageUri={cameraTarget?.mode === 'add' ? pages[pages.length - 1]?.uri : undefined}
        onPhoto={handlePhoto}
        onClose={() => setCameraTarget(null)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  addButton: { flexGrow: 1, flexBasis: 140 },
  busy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
