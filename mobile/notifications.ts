import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const PROJECT_ID = "be245bae-ea1f-424b-b89d-33c2d343c0fc";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

export async function getMobilePushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("glucose-alerts", {
      name: "Glucose alerts",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return null;
  return (await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID })).data;
}

export function listenForGlucoseAlert(onPersonId: (personId: string) => void): () => void {
  const response = Notifications.addNotificationResponseReceivedListener((event) => {
    const value = event.notification.request.content.data?.personId;
    if (typeof value === "string") onPersonId(value);
  });
  return () => response.remove();
}
