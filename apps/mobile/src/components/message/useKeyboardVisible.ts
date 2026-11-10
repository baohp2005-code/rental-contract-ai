import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/** Bàn phím đang mở hay không. Dùng sự kiện "Did" vì Android không có "Will". */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}
