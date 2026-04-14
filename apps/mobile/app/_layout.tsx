import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { ThemeProvider, useTheme } from '@/theme/ThemeContext';
import { LocaleProvider } from '@/context/LocaleContext';
import { ToastProvider } from '@/context/ToastContext';
import ToastContainer from '@/components/common/Toast';
import { registerForPushNotifications } from '@/services/push-notifications';
import { authService } from '@/services/auth';

function RootStack() {
  const { isDark } = useTheme();
  const router = useRouter();

  // Register push notifications when authenticated
  useEffect(() => {
    authService.getToken().then((token) => {
      if (token) registerForPushNotifications();
    });
  }, []);

  // Handle notification tap
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.bookId) {
        router.push(`/book/${data.bookId}`);
      } else {
        router.push('/notifications');
      }
    });
    return () => subscription.remove();
  }, [router]);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="change-password" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="settings" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="upload" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="favorites" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="translations" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="payments" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="payment-success" options={{ headerShown: false }} />
        <Stack.Screen name="payment-failure" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="book/[id]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="reader/[id]" options={{ headerShown: false, orientation: 'all' }} />
      </Stack>
      <ToastContainer />
    </>
  );
}

export default function RootLayout() {
  return (
    <LocaleProvider>
      <ThemeProvider>
        <ToastProvider>
          <RootStack />
        </ToastProvider>
      </ThemeProvider>
    </LocaleProvider>
  );
}
