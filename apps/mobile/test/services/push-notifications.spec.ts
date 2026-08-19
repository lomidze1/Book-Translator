import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  device: { isDevice: true },
  platform: { OS: 'ios' },
  constants: { expoConfig: {} as { extra?: { eas?: { projectId?: string } } } },
}));

vi.mock('expo-device', () => h.device);
vi.mock('react-native', () => ({ Platform: h.platform }));
vi.mock('expo-constants', () => ({ default: h.constants }));
vi.mock('@/services/api', () => ({ apiRequest: vi.fn() }));
vi.mock('expo-notifications', () => ({
  setNotificationHandler: vi.fn(),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
  AndroidImportance: { HIGH: 4 },
}));

import * as Notifications from 'expo-notifications';
import { apiRequest } from '@/services/api';
import {
  registerForPushNotifications,
  unregisterPushNotifications,
} from '@/services/push-notifications';

const apiRequestMock = vi.mocked(apiRequest);
const getPermissions = vi.mocked(Notifications.getPermissionsAsync);
const requestPermissions = vi.mocked(Notifications.requestPermissionsAsync);
const getPushToken = vi.mocked(Notifications.getExpoPushTokenAsync);
const setChannel = vi.mocked(Notifications.setNotificationChannelAsync);

beforeEach(() => {
  apiRequestMock.mockReset();
  getPermissions.mockReset();
  requestPermissions.mockReset();
  getPushToken.mockReset();
  setChannel.mockReset();

  h.device.isDevice = true;
  h.platform.OS = 'ios';
  h.constants.expoConfig = { extra: { eas: { projectId: 'proj-1' } } };

  getPermissions.mockResolvedValue({ status: 'granted' } as never);
  getPushToken.mockResolvedValue({ data: 'ExponentPushToken[abc]' } as never);
  apiRequestMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('module load', () => {
  it('installs a foreground notification handler that shows alerts', async () => {
    expect(Notifications.setNotificationHandler).toHaveBeenCalledTimes(1);
    const handler = vi.mocked(Notifications.setNotificationHandler).mock.calls[0][0]!;

    const behavior = await handler.handleNotification({} as never);

    expect(behavior).toEqual({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    });
  });
});

describe('registerForPushNotifications', () => {
  it('returns null on a simulator without touching permissions', async () => {
    h.device.isDevice = false;

    expect(await registerForPushNotifications()).toBeNull();
    expect(getPermissions).not.toHaveBeenCalled();
    expect(getPushToken).not.toHaveBeenCalled();
  });

  it('detects a REPLACE_WITH_ placeholder projectId and registers nothing', async () => {
    h.constants.expoConfig = { extra: { eas: { projectId: 'REPLACE_WITH_EAS_PROJECT_ID' } } };

    expect(await registerForPushNotifications()).toBeNull();
    expect(getPermissions).not.toHaveBeenCalled();
    expect(getPushToken).not.toHaveBeenCalled();
  });

  it('registers nothing when no projectId is configured at all', async () => {
    h.constants.expoConfig = {};

    expect(await registerForPushNotifications()).toBeNull();
    expect(getPushToken).not.toHaveBeenCalled();
  });

  it('returns null when the user denies the permission prompt', async () => {
    getPermissions.mockResolvedValue({ status: 'undetermined' } as never);
    requestPermissions.mockResolvedValue({ status: 'denied' } as never);

    expect(await registerForPushNotifications()).toBeNull();
    expect(requestPermissions).toHaveBeenCalledTimes(1);
    expect(getPushToken).not.toHaveBeenCalled();
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('skips the prompt when permission is already granted and subscribes the token', async () => {
    const token = await registerForPushNotifications();

    expect(token).toBe('ExponentPushToken[abc]');
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(getPushToken).toHaveBeenCalledWith({ projectId: 'proj-1' });

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    const [path, options] = apiRequestMock.mock.calls[0];
    expect(path).toBe('/notifications/push/subscribe');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(options?.body as string)).toEqual({
      endpoint: 'ExponentPushToken[abc]',
      token: 'ExponentPushToken[abc]',
      platform: 'ios',
      userAgent: 'BookTranslator-Mobile/ios',
    });
  });

  it('registers after the user grants the permission prompt', async () => {
    getPermissions.mockResolvedValue({ status: 'undetermined' } as never);
    requestPermissions.mockResolvedValue({ status: 'granted' } as never);

    expect(await registerForPushNotifications()).toBe('ExponentPushToken[abc]');
  });

  it('still returns the token when the backend subscription fails', async () => {
    apiRequestMock.mockRejectedValue(new Error('api down'));

    expect(await registerForPushNotifications()).toBe('ExponentPushToken[abc]');
  });

  it('creates the default android notification channel', async () => {
    h.platform.OS = 'android';

    await registerForPushNotifications();

    expect(setChannel).toHaveBeenCalledWith('default', {
      name: 'Default',
      importance: 4,
      vibrationPattern: [0, 250, 250, 250],
    });
  });

  it('does not create a channel on ios', async () => {
    await registerForPushNotifications();

    expect(setChannel).not.toHaveBeenCalled();
  });

  it('logs a warning and returns null when token registration throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getPushToken.mockRejectedValue(new Error('no push service'));

    expect(await registerForPushNotifications()).toBeNull();
    expect(warn).toHaveBeenCalledWith('[push] registration failed:', expect.any(Error));
  });
});

describe('unregisterPushNotifications', () => {
  it('sends an unsubscribe request for the token endpoint', async () => {
    await unregisterPushNotifications('ExponentPushToken[abc]');

    const [path, options] = apiRequestMock.mock.calls[0];
    expect(path).toBe('/notifications/push/unsubscribe');
    expect(options?.method).toBe('DELETE');
    expect(JSON.parse(options?.body as string)).toEqual({ endpoint: 'ExponentPushToken[abc]' });
  });

  it('swallows backend failures', async () => {
    apiRequestMock.mockRejectedValue(new Error('api down'));

    await expect(unregisterPushNotifications('tok')).resolves.toBeUndefined();
  });
});
