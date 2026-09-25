/**
 * Turn the engine's forecast into notifications the phone can fire on its own, with the
 * app closed (APK only). Same promises as the live alerts: quiet hours move an alert to
 * the end of the quiet window, alerts are spaced by minGapMs, and when two land on the
 * same slot the more urgent one goes first.
 */
import type { Forecast } from "../engine/forecast";
import { alertText, inQuietHours, type NotifyPrefs } from "./alerts";

export interface PlannedAlert {
  id: number;
  kind: Forecast["kind"];
  at: number;
  title: string;
  body: string;
}

const URGENCY: Forecast["kind"][] = ["sick", "hatch", "hungry", "exhausted", "dirty", "lonely", "awake"];
/** Stable notification ids, so rescheduling replaces instead of piling up. */
export const ALERT_IDS: Record<Forecast["kind"], number> = { hatch: 101, hungry: 102, dirty: 103, sick: 104, exhausted: 105, lonely: 106, awake: 107 };

/** The first moment at or after `at` that is outside quiet hours. */
export function afterQuiet(at: number, prefs: NotifyPrefs): number {
  if (!inQuietHours(at, prefs)) return at;
  const d = new Date(at);
  d.setMinutes(0, 0, 0);
  // walk forward hour by hour; quiet windows are at most 23 h long
  for (let i = 0; i < 24 && inQuietHours(d.getTime(), prefs); i++) d.setHours(d.getHours() + 1);
  return d.getTime();
}

export function planAlerts(forecast: Forecast[], prefs: NotifyPrefs, name: string): PlannedAlert[] {
  if (!prefs.enabled) return [];
  const moved = forecast
    .map((f) => ({ ...f, at: afterQuiet(f.at, prefs) }))
    .sort((a, b) => a.at - b.at || URGENCY.indexOf(a.kind) - URGENCY.indexOf(b.kind));
  const out: PlannedAlert[] = [];
  let last = -Infinity;
  for (const f of moved) {
    let at = Math.max(f.at, last + prefs.minGapMs);
    at = afterQuiet(at, prefs);
    const text = alertText(f.kind, name);
    out.push({ id: ALERT_IDS[f.kind], kind: f.kind, at, title: text.title, body: text.body });
    last = at;
  }
  return out;
}
