import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Requests push notification permission, obtains the Expo push token,
 * and registers it with the API. Must be called after the vendor JWT has
 * been persisted (via setAuth) so that api.put includes the Authorization header.
 */
export async function registerPushToken(): Promise<void> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;

  if (Platform.OS === 'android') {
    // Default channel (keep for backwards compat)
    await Notifications.setNotificationChannelAsync('default', {
      name: 'General',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    // New-request channel: triple vibration + custom chime
    await Notifications.setNotificationChannelAsync('new-request', {
      name: 'New Part Requests',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 150, 400, 150, 400],
      sound: 'notification_request.wav',
      enableVibrate: true,
    });
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  try {
    await api.put('/vendor-auth/push-token', { token: tokenData.data });
  } catch (e) {
    console.warn('[notifications] push token registration failed:', e);
  }
}

/**
 * Sets up foreground and tap notification listeners.
 *
 * @param navigateToAssignment - called with the assignmentId when the vendor
 *   taps a push notification; navigate to RequestDetail with this ID.
 * @returns cleanup function — call it in a useEffect return or on unmount.
 */
export function setupNotificationListeners(
  navigateToAssignment: (assignmentId: string) => void,
): () => void {
  // Foreground: notification received while app is open (just log; alert is
  // already shown by setNotificationHandler above).
  const foregroundSub = Notifications.addNotificationReceivedListener(
    (notification) => {
      console.log('[notifications] received in foreground:', notification.request.identifier);
    },
  );

  // Tap: vendor tapped the notification banner/tray.
  const tapSub = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      const assignmentId = typeof data?.assignmentId === 'string' ? data.assignmentId : undefined;
      if (assignmentId) {
        navigateToAssignment(assignmentId);
      }
    },
  );

  return () => {
    foregroundSub.remove();
    tapSub.remove();
  };
}
