/**
 * Đánh thức backend khi mở app và mỗi lần app quay lại màn hình, để máy chủ
 * Render (gói miễn phí, ngủ sau 15 phút) kịp khởi động trong lúc sinh viên chụp ảnh.
 * Client tự giới hạn tối đa một lần mỗi vài phút nên gọi nhiều lần không sao.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { api, type ApiClient } from '@/lib/api';

export function useWakeBackend(client: ApiClient = api): void {
  useEffect(() => {
    if (client.isMock) return;
    client.wake();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') client.wake();
    });
    return () => subscription.remove();
  }, [client]);
}
