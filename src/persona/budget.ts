/**
 * ContextBudget: how much of a model's window is left for the creature's life after the
 * fixed parts. Small local models run with 2048 tokens; overflowing it makes every later
 * reply fail (the iSyCode Móvil "Prompt exceeds the context window" lesson).
 *
 *   available = total − reservedOutput − system − turn
 */

export interface ContextBudgetInput {
  /** The runtime's context window, in tokens. */
  totalTokens: number;
  /** Kept free for the reply. */
  reservedOutputTokens: number;
  /** The system contract/persona prompt. */
  systemTokens: number;
  /** The current event and what the player just said. */
  turnTokens: number;
}

export interface ContextBudget extends ContextBudgetInput {
  /** Tokens left for identity, memories, relationship and history. Never negative. */
  availableTokens: number;
  /** False when the fixed parts alone do not fit: the caller must shrink them or not call the model. */
  fits: boolean;
}

function count(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function contextBudget(input: ContextBudgetInput): ContextBudget {
  const total = count(input.totalTokens);
  const reserved = count(input.reservedOutputTokens);
  const system = count(input.systemTokens);
  const turn = count(input.turnTokens);
  const left = total - reserved - system - turn;
  return {
    totalTokens: total,
    reservedOutputTokens: reserved,
    systemTokens: system,
    turnTokens: turn,
    availableTokens: Math.max(0, left),
    fits: total > 0 && left >= 0,
  };
}

/**
 * Token count ESTIMATE until a real tokenizer is wired in (M3, native side). Deliberately
 * pessimistic: small local vocabularies split Spanish and JSON into short pieces, so 2.5
 * characters per token over-counts rather than under-counts.
 */
export const CONSERVATIVE_CHARS_PER_TOKEN = 2.5;

export function estimateTokens(text: string, charsPerToken: number = CONSERVATIVE_CHARS_PER_TOKEN): number {
  if (!text) return 0;
  return Math.ceil([...text].length / charsPerToken);
}
