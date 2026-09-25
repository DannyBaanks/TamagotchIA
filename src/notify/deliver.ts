/**
 * Delivering an alert in the browser. Through the service worker when there is one
 * (required on Android), otherwise the plain Notification constructor (desktop, dev mode).
 * Nothing is sent while the app is closed: a PWA without a push server cannot do that.
 */
import type { KeyValueStore } from "../store/save";
import { DEFAULT_PREFS, EMPTY_STATE, type Alert, type NotifyPrefs, type NotifyState } from "./alerts";

const PREFS_KEY = "tamagotchia.notify.prefs.v1";
const STATE_KEY = "tamagotchia.notify.state.v1";

export type Support = "ok" | "unsupported" | "insecure" | "denied" | "default";

export function support(): Support {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (!window.isSecureContext) return "insecure";
  if (Notification.permission === "denied") return "denied";
  return Notification.permission === "granted" ? "ok" : "default";
}

export async function askPermission(): Promise<Support> {
  if (support() === "unsupported" || support() === "insecure") return support();
  try {
    await Notification.requestPermission();
  } catch {
    /* older Safari uses a callback form; the next support() call reports the outcome */
  }
  return support();
}

export async function show(alert: Alert, iconUrl: string): Promise<boolean> {
  if (support() !== "ok") return false;
  const options: NotificationOptions = { body: alert.body, icon: iconUrl, badge: iconUrl, tag: alert.kind, data: { url: "./" } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(alert.title, options);
      return true;
    }
    new Notification(alert.title, options);
    return true;
  } catch {
    return false;
  }
}

export function loadPrefs(store: KeyValueStore): NotifyPrefs {
  try {
    const p = JSON.parse(store.getItem(PREFS_KEY) ?? "null") as Partial<NotifyPrefs> | null;
    const hour = (v: unknown, d: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 23 ? (v as number) : d);
    return {
      enabled: p?.enabled === true,
      quietStart: hour(p?.quietStart, DEFAULT_PREFS.quietStart),
      quietEnd: hour(p?.quietEnd, DEFAULT_PREFS.quietEnd),
      minGapMs: DEFAULT_PREFS.minGapMs,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(store: KeyValueStore, prefs: NotifyPrefs): void {
  store.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function loadState(store: KeyValueStore): NotifyState {
  try {
    const s = JSON.parse(store.getItem(STATE_KEY) ?? "null") as NotifyState | null;
    return s && Array.isArray(s.active) && Array.isArray(s.pending) ? { ...EMPTY_STATE, ...s } : { ...EMPTY_STATE };
  } catch {
    return { ...EMPTY_STATE };
  }
}

export function saveState(store: KeyValueStore, state: NotifyState): void {
  store.setItem(STATE_KEY, JSON.stringify(state));
}
