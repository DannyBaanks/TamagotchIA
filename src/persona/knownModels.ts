/**
 * Models the CI has actually run through the vendored runtime (native/gus-smoke). Only a
 * statement about what was tested: any other .gguf may still be imported, it is just not
 * vouched for. A test keeps this in sync with native/gus-smoke/model.json.
 */
export interface KnownModel {
  id: string;
  label: string;
  filename: string;
  bytes: number;
  sha256: string;
  /** Where to get it: the repository and the exact revision the CI pinned. */
  source: string;
}

export const KNOWN_MODELS: readonly KnownModel[] = [
  {
    id: "qwen25-05b-q4km",
    label: "Qwen2.5 0.5B Instruct (Q4_K_M)",
    filename: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
    bytes: 491400032,
    sha256: "74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db",
    source: "huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF @ 9217f5db79a29953eb74d5343926648285ec7e67",
  },
];

export function knownModelBySha(sha256: string): KnownModel | null {
  return KNOWN_MODELS.find((m) => m.sha256 === sha256.toLowerCase()) ?? null;
}

export interface ImportedModel {
  model: string;
  bytes: number;
  sha256: string;
}

/** What the player reads after an import. Never claims more than the CI showed. */
export function describeImport(imported: ImportedModel): string {
  const mb = Math.round(imported.bytes / (1024 * 1024));
  const known = knownModelBySha(imported.sha256);
  const vouch = known
    ? `Es el mismo archivo que probó el CI (${known.label}). En este teléfono todavía no está demostrado: pruébalo.`
    : "No es un modelo probado por el CI: puede responder mal o no caber en la memoria.";
  return `✓ Instalado ${imported.model} (${mb} MB, sha256 ${imported.sha256.slice(0, 12)}…). ${vouch}`;
}
