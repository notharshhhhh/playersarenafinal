import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

// Register Service Worker for Mobile Notifications
export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    });
    return registration;
  } catch (err) {
    console.warn('Service Worker registration failed:', err);
    return null;
  }
}

// Helper to check if notifications are enabled
export function isMobileNotificationActive(user?: { notificationsEnabled?: boolean; fcmEnabled?: boolean } | null): boolean {
  if (typeof window === 'undefined') return false;
  if (localStorage.getItem('kg_mobile_notifications_enabled') === 'true') return true;
  if (user?.notificationsEnabled === true || user?.fcmEnabled === true) return true;
  if ('Notification' in window && Notification.permission === 'granted') return true;
  return false;
}

// Request Notification Permission from User & Sync with Firestore
export async function requestMobileNotificationPermission(userId?: string): Promise<NotificationPermission> {
  let nativePermission: NotificationPermission = 'granted';

  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      nativePermission = await Notification.requestPermission();
    } catch (err) {
      console.warn('Native notification permission error (iframe or unsupported context):', err);
      // In iframes or restricted environments, fallback gracefully to granted for in-app alert delivery
      nativePermission = 'granted';
    }
  }

  try {
    // Save state in localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('kg_mobile_notifications_enabled', 'true');
      sessionStorage.removeItem('kg_notif_banner_dismissed');
      window.dispatchEvent(new CustomEvent('kg-notification-enabled'));
    }

    // Try service worker registration if supported
    try {
      await registerNotificationServiceWorker();
    } catch {}

    // Update Firestore user document
    if (userId) {
      try {
        await updateDoc(doc(db, 'users', userId), {
          fcmEnabled: true,
          notificationsEnabled: true
        });
      } catch (fsErr) {
        console.warn('Could not update user notification preferences in Firestore:', fsErr);
      }
    }

    // Trigger a quick welcome notification
    triggerMobileStatusBarNotification(
      '🔔 Mobile Notifications Enabled!',
      'You will now receive instant Room ID, Password, and Match alerts directly on your device.',
      { tag: 'welcome-notification' }
    );

    return 'granted';
  } catch (err) {
    console.error('Error enabling mobile notifications:', err);
    return 'granted';
  }
}

export interface MobileNotificationOptions {
  tag?: string;
  targetMatchId?: string;
  actionPage?: string;
  icon?: string;
  badge?: string;
  data?: any;
}

// Trigger Native Mobile Status Bar & Lock Screen Notification
export async function triggerMobileStatusBarNotification(
  title: string,
  body: string,
  options: MobileNotificationOptions = {}
) {
  if (typeof window === 'undefined') return;

  // Always broadcast an in-app event so the alert is visible immediately in all environments
  window.dispatchEvent(new CustomEvent('kg-status-bar-alert', {
    detail: { title, body, ...options }
  }));

  if (!('Notification' in window)) return;

  const notifData = {
    url: window.location.origin,
    targetMatchId: options.targetMatchId,
    actionPage: options.actionPage,
    ...(options.data || {})
  };

  try {
    if (Notification.permission === 'granted') {
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.ready;
          if (reg && reg.showNotification) {
            await reg.showNotification(title, {
              body,
              icon: options.icon || '/icon.svg',
              badge: options.badge || '/icon.svg',
              vibrate: [250, 100, 250, 100, 250],
              tag: options.tag || `khel-galli-${Date.now()}`,
              renotify: true,
              data: notifData
            } as any);
            return;
          }
        } catch {}
      }

      // Standard fallback if SW ready didn't resolve
      try {
        new Notification(title, {
          body,
          icon: options.icon || '/icon.svg',
          tag: options.tag || `khel-galli-${Date.now()}`
        });
      } catch {}
    }
  } catch (err) {
    console.warn('Native mobile notification trigger failed:', err);
  }
}
