import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
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

  // Deep links. Email links (password reset, email verification) and the
  // payment return all point at the website; with App Links / Universal Links
  // configured in app.json those same https URLs open here instead. Without
  // this handler the reset screen made users type the token by hand.
  useEffect(() => {
    const routeFromUrl = (url: string | null) => {
      if (!url) return;
      const { path, queryParams } = Linking.parse(url);
      if (!path) return;
      const token = typeof queryParams?.token === 'string' ? queryParams.token : undefined;
      const segment = path.replace(/^\/+/, '').split('/').pop();

      switch (segment) {
        case 'reset-password':
          if (token) router.push(`/(auth)/reset-password?token=${encodeURIComponent(token)}`);
          break;
        case 'verify-email':
          if (token) router.push(`/(auth)/verify-email?token=${encodeURIComponent(token)}`);
          break;
        case 'confirm-password-change':
          if (token) router.push(`/(auth)/confirm-password-change?token=${encodeURIComponent(token)}`);
          break;
        default:
          break;
      }
    };

    // Cold start.
    Linking.getInitialURL().then(routeFromUrl).catch(() => {});
    // Warm start.
    const sub = Linking.addEventListener('url', (event) => routeFromUrl(event.url));
    return () => sub.remove();
  }, [router]);

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
    // SafeAreaProvider is required: Toast calls useSafeAreaInsets(), which
    // throws (or silently returns zeros) without a provider above it.
    <SafeAreaProvider>
      <LocaleProvider>
        <ThemeProvider>
          <ToastProvider>
            <RootStack />
          </ToastProvider>
        </ThemeProvider>
      </LocaleProvider>
    </SafeAreaProvider>
  );
}
