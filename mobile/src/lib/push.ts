import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiClient } from './api';
import { router } from 'expo-router';

// ---------------------------------------------------------------------------
// Notification handler -- must be called at module level (before any component)
// ---------------------------------------------------------------------------

/**
 * Set up the default notification handler.
 * Controls how notifications behave when received while app is in foreground.
 */
export function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// ---------------------------------------------------------------------------
// Push token registration
// ---------------------------------------------------------------------------

/**
 * Register the device for push notifications and send the token to the backend.
 *
 * Flow:
 * 1. Check Device.isDevice (no push on simulator)
 * 2. Set up Android notification channel
 * 3. Request permissions if not granted
 * 4. Get Expo push token via getExpoPushTokenAsync
 * 5. POST to /api/push/register with { token, platform }
 *
 * Returns the token string or null if registration failed/not available.
 */
export async function registerPushToken(): Promise<string | null> {
  // No push notifications on simulator/emulator
  if (!Device.isDevice) return null;

  try {
    // Android requires a notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'BitBit',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    // Check/request permissions
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    // Get Expo push token
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    // Register token with backend
    await apiClient.post('/api/push/register', {
      token,
      platform: Platform.OS,
    });

    return token;
  } catch (err) {
    console.warn('[push] Failed to register push token:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Notification response handler (tap navigation)
// ---------------------------------------------------------------------------

/**
 * Handle user tapping on a notification.
 * Navigates to the relevant screen based on the notification data.
 */
export function handleNotificationResponse(
  response: Notifications.NotificationResponse,
): void {
  const data = response.notification.request.content.data as
    | { type?: string; id?: string; threadId?: string }
    | undefined;

  if (!data?.type) return;

  switch (data.type) {
    case 'approval':
      if (data.id) {
        router.push(`/approval/${data.id}` as never);
      }
      break;
    case 'workflow':
      router.push('/activity' as never);
      break;
    case 'chat':
      if (data.threadId) {
        router.push(`/chat/${data.threadId}` as never);
      }
      break;
    default:
      break;
  }
}
