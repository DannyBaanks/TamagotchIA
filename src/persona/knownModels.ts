/**
 * The models the app can download, each pinned exactly as iSyCode Móvil pins it: repository,
 * revision (commit), file name, size and SHA-256. A download is usable only when size and
 * hash match. CI checks every entry against iSyCode Móvil's Catalog/models.json at the
 * vendored commit (tools/check-model-catalog.ts), and the first one against the model the
 * native smoke runs (native/gus-smoke/model.json).
 *
 * `tested` says what was actually shown, nothing more: no entry claims it works on a phone.
 */
export interface KnownModel {
  id: string;
  label: string;
  repository: string;
  revision: string;
  filename: string;
  bytes: number;
  sha256: string;
  license: string;
  /** "tamagotchia-smoke": ran through TamagotchIA's own smoke. "isycode-ci": iSyCode Móvil's CI only. */
  tested: "tamagotchia-smoke" | "isycode-ci";
}

export const KNOWN_MODELS: readonly KnownModel[] = [
  {
    id: "qwen25-05b-q4km",
    label: "Qwen2.5 0.5B Instruct (Q4_K_M)",
    repository: "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
    revision: "9217f5db79a29953eb74d5343926648285ec7e67",
    filename: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
    bytes: 491400032,
    sha256: "74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db",
    license: "Apache License 2.0",
    tested: "tamagotchia-smoke",
  },
  {
    id: "qwen25-15b-q4km",
    label: "Qwen2.5 1.5B Instruct (Q4_K_M)",
    repository: "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
    revision: "91cad51170dc346986eccefdc2dd33a9da36ead9",
    filename: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
    bytes: 1117320736,
    sha256: "6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e",
    license: "Apache License 2.0",
    tested: "isycode-ci",
  },
];

/**
 * The only URL shape the native side accepts: Hugging Face, a pinned 40-hex revision, a bare
 * file name. GusLocalPlugin.java and GusLocalPlugin.swift carry the same pattern (tested).
 */
export const PINNED_SOURCE = /^https:\/\/huggingface\.co\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/resolve\/[0-9a-f]{40}\/([A-Za-z0-9._-]+\.gguf)$/;

export function sourceUrl(model: KnownModel): string {
  return `https://huggingface.co/${model.repository}/resolve/${model.revision}/${model.filename}`;
}

export function knownModelBySha(sha256: string): KnownModel | null {
  return KNOWN_MODELS.find((m) => m.sha256 === sha256.toLowerCase()) ?? null;
}

export function sizeLabel(bytes: number): string {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}

export function testedLabel(model: KnownModel): string {
  return model.tested === "tamagotchia-smoke"
    ? "probado en el CI de TamagotchIA"
    : "probado en el CI de iSyCode Móvil, todavía no en el de TamagotchIA";
}

export interface ImportedModel {
  model: string;
  bytes: number;
  sha256: string;
}

/** What the player reads after an import or a download. Never claims more than the CI showed. */
export function describeImport(imported: ImportedModel): string {
  const known = knownModelBySha(imported.sha256);
  const vouch = known
    ? `Es ${known.label}, ${testedLabel(known)}. En este teléfono todavía no está demostrado: pruébalo.`
    : "No es un modelo del catálogo: puede responder mal o no caber en la memoria.";
  return `✓ Instalado ${imported.model} (${sizeLabel(imported.bytes)}, sha256 ${imported.sha256.slice(0, 12)}…). ${vouch}`;
}
