import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";


type RequestApi = (path: string, init?: RequestInit, timeoutMsOverride?: number) => Promise<Response>;

type NotificationRegistrationResult =
  | { status: "registered"; token: string }
  | { status: "skipped"; reason: string }
  | { status: "error"; reason: string };

const INVESTIGATION_URL_PATTERN = /^[a-z0-9+.-]+:\/\/investigations\/([^/?#]+)/i;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});


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


export async function registerForPushNotificationsAsync(requestApi: RequestApi): Promise<NotificationRegistrationResult> {
  if (Platform.OS === "web") {
    return { status: "skipped", reason: "Push registration is only enabled for native devices." };
  }
  if (!notificationsSupportedInCurrentShell()) {
    return { status: "skipped", reason: "Remote push is unavailable in Expo Go. Use a development build instead." };
  }
  if (!Device.isDevice) {
    return { status: "skipped", reason: "Push registration requires a physical device." };
  }

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
