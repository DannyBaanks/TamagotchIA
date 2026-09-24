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

export const PRESETS: Array<{ label: string; baseUrl: string }> = [
  { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { label: "NVIDIA", baseUrl: "https://integrate.api.nvidia.com/v1" },
  { label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { label: "Ollama (en este aparato)", baseUrl: "http://localhost:11434/v1" },
  { label: "LM Studio (en este aparato)", baseUrl: "http://localhost:1234/v1" },
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
