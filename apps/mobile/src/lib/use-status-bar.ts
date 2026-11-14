import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle, type StatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';

/**
 * Đổi màu chữ thanh trạng thái khi màn đang hiện, trả về "dark" (mặc định của app) khi rời màn.
 * Dùng thay cho <StatusBar> trong màn, vì màn cũ vẫn nằm trong stack khi mở màn mới.
 */
export function useStatusBarStyle(style: StatusBarStyle) {
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(style);
      return () => setStatusBarStyle('dark');
    }, [style]),
  );
}
