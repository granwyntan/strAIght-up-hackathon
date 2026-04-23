import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

declare const require: (moduleName: string) => unknown;


type RequestApi = (path: string, init?: RequestInit, timeoutMsOverride?: number) => Promise<Response>;

type NotificationRegistrationResult =
  | { status: "registered"; token: string }
  | { status: "skipped"; reason: string }
  | { status: "error"; reason: string };

type NotificationSubscription = { remove: () => void };
type NotificationsModule = typeof import("expo-notifications");

const INVESTIGATION_URL_PATTERN = /^[a-z0-9+.-]+:\/\/investigations\/([^/?#]+)/i;
let notificationsConfigured = false;

function getNotificationsModule(): NotificationsModule | null {
  try {
    return require("expo-notifications") as NotificationsModule;
  } catch {
    return null;
  }
}

function ensureNotificationHandler() {
  if (notificationsConfigured) {
    return true;
  }
  const Notifications = getNotificationsModule();
  if (!Notifications) {
    return false;
  }
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  notificationsConfigured = true;
  return true;
}


function notificationProjectId() {
  return Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId ?? "";
}


export function notificationsSupportedInCurrentShell() {
  const appOwnership = Constants.appOwnership;
  const executionEnvironment = Constants.executionEnvironment;
  if (appOwnership === "expo" || executionEnvironment === "storeClient") {
    return false;
  }
  return true;
}


export function parseInvestigationUrl(url: string | null | undefined) {
  const trimmed = (url || "").trim();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(INVESTIGATION_URL_PATTERN);
  return match?.[1] ?? null;
}


export function notificationDataUrl(data: Record<string, unknown> | null | undefined) {
  const value = data?.url;
  return typeof value === "string" ? value : "";
}


export function addNotificationResponseListener(onUrl: (url: string) => void): NotificationSubscription | null {
  if (Platform.OS === "web" || !notificationsSupportedInCurrentShell()) {
    return null;
  }
  const Notifications = getNotificationsModule();
  if (!Notifications) {
    return null;
  }
  ensureNotificationHandler();
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const url = notificationDataUrl(response.notification.request.content.data as Record<string, unknown> | undefined);
    if (url) {
      onUrl(url);
    }
  });
}


export async function getLastNotificationResponseUrl() {
  if (Platform.OS === "web" || !notificationsSupportedInCurrentShell()) {
    return "";
  }
  const Notifications = getNotificationsModule();
  if (!Notifications) {
    return "";
  }
  ensureNotificationHandler();
  const response = await Notifications.getLastNotificationResponseAsync();
  return notificationDataUrl(response?.notification.request.content.data as Record<string, unknown> | undefined);
}


export async function registerForPushNotificationsAsync(requestApi: RequestApi): Promise<NotificationRegistrationResult> {
  if (Platform.OS === "web") {
    return { status: "skipped", reason: "Push registration is only enabled for native devices." };
  }
  if (!notificationsSupportedInCurrentShell()) {
    return { status: "skipped", reason: "Remote push is unavailable in Expo Go. Use a development build instead." };
  }
  const Notifications = getNotificationsModule();
  if (!Notifications) {
    return { status: "skipped", reason: "expo-notifications is not available in this shell." };
  }
  if (!Device.isDevice) {
    return { status: "skipped", reason: "Push registration requires a physical device." };
  }
  ensureNotificationHandler();

  const projectId = notificationProjectId();
  if (!projectId) {
    return { status: "skipped", reason: "Missing Expo project ID for push registration." };
  }

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;
  if (finalStatus !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }
  if (finalStatus !== "granted") {
    return { status: "skipped", reason: "Notification permission was not granted." };
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("investigation-ready", {
      name: "Investigation ready",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 200, 250],
      lightColor: "#1F6F66",
    });
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const response = await requestApi(
      "/api/notifications/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expoPushToken: token,
          platform: Platform.OS,
        }),
      },
      5000
    );
    if (!response.ok) {
      return { status: "error", reason: "The backend rejected the push token." };
    }
    return { status: "registered", token };
  } catch (error) {
    return {
      status: "error",
      reason: error instanceof Error ? error.message : "Push registration failed.",
    };
  }
}
