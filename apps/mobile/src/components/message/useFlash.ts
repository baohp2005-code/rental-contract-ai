import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Cờ bật trong một lúc rồi tự tắt, dùng cho phản hồi kiểu "Đã sao chép".
 * Gọi `flash(announcement)` để bật và (nếu có) đọc thông báo cho trình đọc màn hình.
 */
export function useFlash(durationMs = 2500) {
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const flash = useCallback(
    (announcement?: string) => {
      setActive(true);
      if (announcement) AccessibilityInfo.announceForAccessibility(announcement);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setActive(false), durationMs);
    },
    [durationMs],
  );

  return [active, flash] as const;
}
