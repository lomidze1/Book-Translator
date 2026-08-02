'use client';

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { apiFetch, getAccessToken } from '@/lib/api-client';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Browser-only capability reads. useSyncExternalStore serves the server
// snapshot during SSR/hydration and re-reads on the client, which keeps these
// out of an effect (no cascading render) and out of render (no `navigator` on
// the server).
const neverChanges = () => () => {};

function getSupportedSnapshot(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY;
}

function getUnsupportedSnapshot(): boolean {
  return false;
}

function getPermissionSnapshot(): NotificationPermission {
  return 'Notification' in window ? Notification.permission : 'default';
}

function getDefaultPermissionSnapshot(): NotificationPermission {
  return 'default';
}

export function usePushNotifications() {
  const isSupported = useSyncExternalStore(neverChanges, getSupportedSnapshot, getUnsupportedSnapshot);
  const browserPermission = useSyncExternalStore(
    neverChanges,
    getPermissionSnapshot,
    getDefaultPermissionSnapshot,
  );
  // Notification.permission isn't observable, so a prompt answered in this
  // session is tracked separately and takes precedence.
  const [promptedPermission, setPromptedPermission] = useState<NotificationPermission | null>(null);
  const permission = promptedPermission ?? browserPermission;
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Check existing subscription
  useEffect(() => {
    if (!isSupported) return;
    let cancelled = false;

    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      if (!cancelled) setIsSubscribed(!!sub);
    });

    return () => {
      cancelled = true;
    };
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY) return false;

    try {
      const perm = await Notification.requestPermission();
      setPromptedPermission(perm);
      if (perm !== 'granted') return false;

      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
      });

      const json = subscription.toJSON();
      if (!getAccessToken()) return false;

      await apiFetch('/api/notifications/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
          userAgent: navigator.userAgent,
        }),
      });

      setIsSubscribed(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (!subscription) return;

      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      if (getAccessToken()) {
        await apiFetch('/api/notifications/push/unsubscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        });
      }

      setIsSubscribed(false);
    } catch {
      // silent
    }
  }, []);

  return { permission, isSubscribed, isSupported, subscribe, unsubscribe };
}
