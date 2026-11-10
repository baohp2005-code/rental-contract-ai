import { Stack, router } from 'expo-router';

import { Screen, StateView } from '@/components/ui';

/** Đường dẫn không có trong app (ví dụ mở link cũ). */
export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Không tìm thấy trang' }} />
      <Screen scroll={false}>
        <StateView
          icon="compass-outline"
          title="Không tìm thấy trang"
          message="Trang bạn mở không có trong ứng dụng. Bạn quay về trang đầu để bắt đầu lại nhé."
          actionTitle="Về trang đầu"
          onAction={() => router.replace('/')}
        />
      </Screen>
    </>
  );
}
