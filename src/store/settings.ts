/**
 * Persona settings. The endpoint and model are ordinary settings; the API key sits under
 * its own storage key so it can never be serialized together with a save or an export.
 */
import type { KeyValueStore } from "./save";

export const SETTINGS_KEY = "tamagotchia.settings.v1";
export const SECRET_KEY = "tamagotchia.secret.v1";

export interface PersonaSettings {
  enabled: boolean;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export const DEFAULT_SETTINGS: PersonaSettings = {
  enabled: false,
  baseUrl: "https://openrouter.ai/api/v1",
  model: "",
  timeoutMs: 8000,
};

export interface Preset {
  label: string;
  baseUrl: string;
  /** Filled in when the model field is empty. */
  model?: string;
  note: string;
}

/**
 * Browser reachability measured 2026-09-24 from https://dannybaanks.github.io:
 * OpenRouter and OpenAI answer a web page; NVIDIA's API sends no CORS headers, so a
 * browser can never read its replies. NVIDIA's free models are reachable via OpenRouter.
 */
export const PRESETS: Preset[] = [
  {
    label: "OpenRouter (tiene modelos gratis)",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "google/gemma-4-31b-it:free",
    note: "Gratis con cuenta: usa un modelo que termine en «:free». Ahí también están los Nemotron de NVIDIA.",
  },
  {
    label: "NVIDIA directo (no funciona en el navegador)",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    note: "El servidor de NVIDIA no deja que una página web le hable, así que tu clave nvapi- aquí no sirve. Usa los mismos modelos gratis por OpenRouter.",
  },
  { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", note: "De pago, con tu clave de OpenAI." },
  { label: "Ollama (en este aparato)", baseUrl: "http://localhost:11434/v1", note: "Un modelo en este mismo aparato. En el celular, localhost es el celular." },
  { label: "LM Studio (en este aparato)", baseUrl: "http://localhost:1234/v1", note: "Un modelo en este mismo aparato." },
];

export function loadSettings(store: KeyValueStore): PersonaSettings {
  try {
    const raw = JSON.parse(store.getItem(SETTINGS_KEY) ?? "null") as Partial<PersonaSettings> | null;
    if (!raw) return { ...DEFAULT_SETTINGS };
    return {
      enabled: raw.enabled === true,
      baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl : DEFAULT_SETTINGS.baseUrl,
      model: typeof raw.model === "string" ? raw.model : "",
      timeoutMs: typeof raw.timeoutMs === "number" && raw.timeoutMs >= 1000 && raw.timeoutMs <= 30000 ? raw.timeoutMs : DEFAULT_SETTINGS.timeoutMs,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(store: KeyValueStore, settings: PersonaSettings): void {
  store.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadSecret(store: KeyValueStore): string {
  return store.getItem(SECRET_KEY) ?? "";
}

export function saveSecret(store: KeyValueStore, secret: string): void {
  if (secret) store.setItem(SECRET_KEY, secret);
  else store.removeItem(SECRET_KEY);
}
