/**
 * The boundary to the native GUS runtime (llama.cpp on iOS/Android). Only strings cross
 * it: a system message (contract + compiled Context Box) and a user message (the turn). The
 * plugin never receives the World, a store, settings or a secret, and has nothing to call
 * back into; whatever it returns is plain text for the validator.
 */
import { validateContextBox } from "./contextBox";
import { SYSTEM_PROMPT } from "./contract";
import type { CreatureMind } from "./mind";

export interface GusMessage {
  role: "system" | "user";
  content: string;
}

export interface GusGenerateOptions {
  /** Already composed by composeLocalChat, so every native glue sends exactly the same chat. */
  messages: GusMessage[];
  maxTokens: number;
}

/**
 * Implemented natively: android/…/GusLocalPlugin.java and ios/App/GusLocal. The native side
 * only formats and generates. Models are named by file name inside the app's own models
 * folder, never by path. Rejections carry a code: RUNTIME_MISSING, BAD_MODEL,
 * MODEL_MISSING, LOAD_FAILED, NOT_LOADED, BAD_REQUEST, GENERATE_FAILED, and for imports and downloads CANCELLED, NO_SPACE, IMPORT_FAILED, BAD_SOURCE, BUSY, DOWNLOAD_FAILED.
 */
export interface GusLocalPlugin {
  generate(options: GusGenerateOptions): Promise<{ text: string }>;
  load?(options: { model: string; contextTokens?: number }): Promise<{ model: string }>;
  cancel?(): Promise<void>;
  unload?(): Promise<void>;
  /** Installed models in the app's models folder. */
  listModels?(): Promise<{ models: Array<{ model: string; bytes: number }> }>;
  /** System file picker → copy into the models folder, platform SHA-256, GGUF magic checked. */
  importModel?(): Promise<{ model: string; bytes: number; sha256: string }>;
  /**
   * Downloads a pinned model (see knownModels.ts). The native side accepts only a Hugging Face
   * URL with a 40-hex revision, follows redirects only to Hugging Face hosts, and installs the
   * file only if size and SHA-256 match. The request carries nothing about the creature.
   */
  downloadModel?(options: { url: string; bytes: number; sha256: string }): Promise<{ model: string; bytes: number; sha256: string }>;
  cancelDownload?(): Promise<void>;
  deleteModel?(options: { model: string }): Promise<void>;
  addListener?(event: "downloadProgress", listener: (progress: { model: string; received: number; total: number }) => void): Promise<{ remove: () => Promise<void> }>;
}

/**
 * The one place the local chat is composed. The system message carries the contract and
 * the Context Box: both change slowly, so they form a prefix a runtime can reuse. The turn
 * (event + what the player said) is the user message.
 */
export function composeLocalChat(boxJson: string, turnJson: string): GusMessage[] {
  return [
    { role: "system", content: `${SYSTEM_PROMPT}\n\nLo que sabes de ti (Context Box, JSON; solo lectura):\n${boxJson}` },
    { role: "user", content: turnJson },
  ];
}

export const LOCAL_MAX_TOKENS = 160;
/** The window the runtime is created with; the Context Box budget is computed against it. */
export const LOCAL_CONTEXT_TOKENS = 2048;

export interface LocalMindOptions {
  name?: string;
  /** A file name inside the app's models folder. When set, the plugin loads it on first use. */
  model?: string;
  contextTokens?: number;
}

export function localMind(plugin: GusLocalPlugin, options: LocalMindOptions | string = {}): CreatureMind {
  const { name = "GUS local", model, contextTokens = LOCAL_CONTEXT_TOKENS } = typeof options === "string" ? { name: options } : options;
  // One load per mind; a failed load is retried on the next turn (the file may be installed by then).
  let loading: Promise<unknown> | null = null;
  const ensureLoaded = (): Promise<unknown> => {
    if (!model || !plugin.load) return Promise.resolve();
    loading ??= plugin.load({ model, contextTokens }).catch((error: unknown) => {
      loading = null;
      throw error;
    });
    return loading;
  };
  return {
    name,
    kind: "local",
    async respond(request, signal) {
      // Fail closed: an invalid box (or one carrying a credential) reaches no model.
      const checked = validateContextBox(request.box);
      if (!checked.ok) throw new Error(`context box rechazada: ${checked.error}`);
      if (signal.aborted) throw new Error("cancelado");
      const aborted = new Promise<never>((_, reject) => {
        signal.addEventListener("abort", () => reject(new Error("cancelado")), { once: true });
      });
      await Promise.race([ensureLoaded(), aborted]);
      const call = plugin.generate({
        messages: composeLocalChat(JSON.stringify(checked.box), JSON.stringify(request.turn)),
        maxTokens: LOCAL_MAX_TOKENS,
      });
      const result = await Promise.race([call, aborted]);
      if (!result || typeof result.text !== "string") throw new Error("el runtime local no devolvió texto");
      return result.text;
    },
  };
}
