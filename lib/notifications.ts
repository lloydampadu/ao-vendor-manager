import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { vendorAuthApi } from "./api";
import { createLogger } from "./logger";

const log = createLogger("notifications");

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type NotificationTarget =
  | { kind: "assignment"; assignmentId: string }
  | { kind: "order"; orderId: string };

/** Parses the push payload the API sends (`{ screen?, assignmentId }`). */
export function targetFromData(data: Record<string, unknown> | undefined): NotificationTarget | null {
  const assignmentId = typeof data?.assignmentId === "string" ? data.assignmentId : undefined;
  if (!assignmentId) return null;
  if (data?.screen === "orders") return { kind: "order", orderId: assignmentId };
  return { kind: "assignment", assignmentId };
}

let lastRegisteredToken: string | null = null;

/**
 * Asks for permission, fetches the Expo push token and registers it with the
 * API. Safe to call on every signed-in launch: the token can rotate, and the
 * vendor may grant permission later from Settings. Requires a stored JWT.
 */
export async function registerPushToken(): Promise<void> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    log.info("push permission not granted", { status: finalStatus });
    return;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "General",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    await Notifications.setNotificationChannelAsync("new-request", {
      name: "New Part Requests",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 150, 400, 150, 400],
      sound: "notification_request.wav",
      enableVibrate: true,
    });
  }

  const projectId =
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId;

  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  } catch (err) {
    // Expo Go and simulators have no push token — expected there.
    log.warn("no push token available", err);
    return;
  }
  if (token === lastRegisteredToken) return;

  try {
    await vendorAuthApi.registerPushToken(token);
    lastRegisteredToken = token;
  } catch (err) {
    log.warn("push token registration failed", err);
  }
}

/** Forget the cached token on sign-out so the next vendor re-registers. */
export function resetPushRegistration(): void {
  lastRegisteredToken = null;
}

/**
 * Wires notification taps to navigation, including the cold-start case where
 * the app was launched *by* the tap and the response listener never fires.
 */
export function setupNotificationListeners(onOpen: (target: NotificationTarget) => void): () => void {
  const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const target = targetFromData(response.notification.request.content.data as Record<string, unknown>);
    if (target) onOpen(target);
  });

  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (!response) return;
    const target = targetFromData(response.notification.request.content.data as Record<string, unknown>);
    if (target) onOpen(target);
  });

  return () => tapSub.remove();
}

export async function clearBadge(): Promise<void> {
  await Notifications.setBadgeCountAsync(0).catch(() => {});
}
