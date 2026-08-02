import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiRequest } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  // Push doesn't work on simulator or Expo Go
  if (!Device.isDevice) {
    return null;
  }

  // Check if projectId is available (requires EAS / development build).
  // app.json ships a REPLACE_WITH_* placeholder until the real EAS project is
  // wired up. A placeholder is a truthy string, so without this guard we would
  // call getExpoPushTokenAsync with an invalid id, throw, and lose the error in
  // the catch below — push would be dead in a store build with nothing logged.
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId || String(projectId).startsWith('REPLACE_WITH_')) {
    if (!__DEV__) {
      console.error(
        '[push] EAS projectId is not configured (app.json extra.eas.projectId). ' +
          'Push notifications are disabled in this build.',
      );
    }
    // Running in Expo Go or EAS not configured — nothing to register.
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const pushToken = tokenData.data;

    // Subscribe to backend
    try {
      await apiRequest('/notifications/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          endpoint: pushToken,
          token: pushToken,
          platform: Platform.OS,
          userAgent: `BookTranslator-Mobile/${Platform.OS}`,
        }),
      });
    } catch {
      // Subscription failed — not critical
    }

    return pushToken;
  } catch (err) {
    // Push notifications not available in this environment. Log it — a silent
    // null here previously made a misconfigured build indistinguishable from
    // a user who simply denied the permission prompt.
    console.warn('[push] registration failed:', err);
    return null;
  }
}

export async function unregisterPushNotifications(token: string): Promise<void> {
  try {
    await apiRequest('/notifications/push/unsubscribe', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint: token }),
    });
  } catch {
    // Unsubscription failed — not critical
  }
}
