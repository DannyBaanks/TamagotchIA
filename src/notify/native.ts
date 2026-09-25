/**
 * APK only: hand the planned alerts to Android, which fires them with the app closed.
 * Every reschedule cancels the previous plan first (stable ids), so the phone always
 * holds exactly the current prediction.
 */
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { ALERT_IDS, type PlannedAlert } from "./plan";

export const isNative = (): boolean => Capacitor.isNativePlatform();

export async function nativePermission(ask: boolean): Promise<boolean> {
  try {
    const status = ask ? await LocalNotifications.requestPermissions() : await LocalNotifications.checkPermissions();
    return status.display === "granted";
  } catch {
    return false;
  }
}

export async function schedule(plan: PlannedAlert[], now: number): Promise<number> {
  try {
    await LocalNotifications.cancel({ notifications: Object.values(ALERT_IDS).map((id) => ({ id })) });
    const future = plan.filter((p) => p.at > now + 5_000);
    if (future.length === 0) return 0;
    await LocalNotifications.schedule({
      notifications: future.map((p) => ({
        id: p.id,
        title: p.title,
        body: p.body,
        schedule: { at: new Date(p.at), allowWhileIdle: true },
      })),
    });
    return future.length;
  } catch {
    return 0;
  }
}

export async function showNow(title: string, body: string): Promise<boolean> {
  try {
    await LocalNotifications.schedule({ notifications: [{ id: 199, title, body, schedule: { at: new Date(Date.now() + 1500) } }] });
    return true;
  } catch {
    return false;
  }
}
