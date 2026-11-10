import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '700' },
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="capture" options={{ title: 'Chụp hợp đồng' }} />
          <Stack.Screen
            name="analyzing"
            options={{ title: 'Đang phân tích', headerBackVisible: false, gestureEnabled: false }}
          />
          <Stack.Screen
            name="overview"
            options={{ title: 'Kết quả', headerBackVisible: false, gestureEnabled: false }}
          />
          <Stack.Screen name="flag/[id]" options={{ title: 'Chi tiết cảnh báo' }} />
          <Stack.Screen name="message" options={{ title: 'Tin nhắn gửi chủ nhà' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
