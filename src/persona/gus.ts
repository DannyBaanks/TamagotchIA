/**
 * GUS (GGUF Unified Substrate) offline model catalog for TamagotchIA.
 *
 * Provides approved, SHA-256 pinned lightweight local models so the creature
 * can speak 100% offline on mobile devices or desktop without internet,
 * API keys, or cloud costs.
 */

export interface GUSModel {
  readonly id: string;
  readonly name: string;
  readonly filename: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly license: string;
  readonly description: string;
  readonly recommended?: boolean;
}

export const GUS_MODELS: readonly GUSModel[] = [
  {
    id: "smollm2-360m-q4km",
    name: "SmolLM2 360M Instruct (GUS)",
    filename: "smollm2-360m-instruct-q4_k_m.gguf",
    sizeBytes: 270590528,
    sha256: "8856952e27c65a87618f8347d1d06328c3953af04e8327b6dd1fab6670358fd0",
    license: "Apache-2.0",
    description: "Ultra-ligero (270 MB). Ideal para móviles: inferencia casi instantánea sin calentar el dispositivo.",
    recommended: true,
  },
  {
    id: "qwen25-05b-q4km",
    name: "Qwen 2.5 0.5B Instruct (GUS)",
    filename: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
    sizeBytes: 491400032,
    sha256: "74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db",
    license: "Apache-2.0",
    description: "491 MB. Excelente comprensión del español y personalidad expresiva para la mascota.",
  },
  {
    id: "qwen15-18b-q4km",
    name: "Qwen 1.5 1.8B Chat (GUS)",
    filename: "qwen1_5-1_8b-chat-q4_k_m.gguf",
    sizeBytes: 1217752928,
    sha256: "702e983c77883426806a2af75d34ab3e462e1b822f9dc23b49e02280c24b2b18",
    license: "Tongyi Qianwen",
    description: "1.2 GB. Mayor vocabulario y capacidad de juego para equipos con más memoria.",
  },
] as const;

export const DEFAULT_GUS_MODEL = GUS_MODELS[0]!.filename;

export function findGusModel(nameOrFilename: string): GUSModel | undefined {
  const query = nameOrFilename.trim().toLowerCase();
  return GUS_MODELS.find(
    (m) =>
      m.id.toLowerCase() === query ||
      m.filename.toLowerCase() === query ||
      m.name.toLowerCase() === query
  );
}
