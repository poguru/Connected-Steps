/**
 * Push notification service.
 * Handles token registration, notification channel setup,
 * and background notification tap routing.
 */

import { CS_API_BASE } from "../config";

type NotificationHandler = (data: Record<string, string>) => void;

let _tapHandler: NotificationHandler | null = null;

export function setNotificationTapHandler(handler: NotificationHandler): void {
  _tapHandler = handler;
}

/**
 * Request permissions, obtain Expo push token, register with the server.
 * Call once after successful login.
 */
export async function registerForPushNotifications(userEmail: string): Promise<string | null> {
  try {
    const Notifications = await import("expo-notifications").catch(() => null);
    if (!Notifications) return null;

    // Configure notification channel behavior (Android)
    await Notifications.setNotificationChannelAsync?.("default", {
      name:           "Connected Steps",
      importance:     Notifications.AndroidImportance?.MAX ?? 5,
      vibrationPattern: [0, 250, 250, 250],
      lightColor:     "#e8620a",
    }).catch(() => {});

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge:  true,
      }),
    });

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return null;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token     = tokenData.data;

    // Register with server (fire and forget)
    fetch(`${CS_API_BASE}/api/push-token`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ user_email: userEmail, token, platform: "expo" }),
    }).catch(() => {});

    return token;
  } catch {
    return null;
  }
}

/**
 * Set up listener for notification taps (user opens app from notification).
 * Returns cleanup function.
 */
export function setupNotificationListeners(): () => void {
  let responseSub: { remove: () => void } | null = null;

  import("expo-notifications").then(Notifications => {
    responseSub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as Record<string, string>;
      _tapHandler?.(data);
    });
  }).catch(() => {});

  return () => { responseSub?.remove(); };
}
