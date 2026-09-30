/**
 * Context compiler: World → Context Box v1, inside a token budget.
 *
 * Pure: the same world, clock and budget give the same box. Nothing here reads the
 * system clock, the network or settings, and the box is a copy the brain cannot write back.
 *
 * Key order goes from stable to volatile (contract, who the pet is, long memories, then the
 * current moment), so a runtime that reuses a prompt prefix re-reads as little as possible.
 *
 * Budget priorities (Compose §3): contract > identity > current state > memories >
 * relationship > recent history > narrative details. The current turn (event + what the
 * player said) is NOT in the box: it travels as its own message and is budgeted apart.
 */
import { conditions, timeOfDay } from "../engine/derived";
import { HOUR } from "../engine/rules";
import type { World } from "../engine/types";
import { petIdentity } from "../life/identity";
import { estimateTokens } from "./budget";
import { CONTEXT_BOX_SCHEMA, GUARDRAILS, LIMITS, containsSecret, type ContextBoxV1 } from "./contextBox";

const DAY = 24 * HOUR;

export interface ModelContext {
  mode: "local" | "remote" | "fallback";
  model_id?: string;
  context_budget_tokens?: number;
}

export interface CompileInput {
  world: World;
  now: number;
  /** Tokens the box may use (ContextBudget.availableTokens). */
  budgetTokens: number;
  model?: ModelContext;
  estimate?: (text: string) => number;
}

export interface CompiledBox {
  box: ContextBoxV1;
  tokens: number;
  /** False when even the mandatory core (contract, identity, state) exceeds the budget. */
  fits: boolean;
  /** What was left out to fit, in the order it was dropped. For debug views and tests. */
  dropped: string[];
}

type Entry = { summary: string; salience: number; at: number; category: string };

/** Anything that looks like a credential never reaches a brain, whatever field it hides in. */
function clean<T>(items: T[]): T[] {
  return items.filter((item) => !containsSecret(item));
}

export function compileContextBox(input: CompileInput): CompiledBox {
  const { world, now } = input;
  const estimate = input.estimate ?? estimateTokens;
  const c = world.creature;
  const id = petIdentity(world);
  const round = (x: number) => Math.round(x);

  const identity = {
    id: id.id,
    name: containsSecret(id.name) ? "(sin nombre)" : id.name,
    species: id.species,
    stage: id.stage,
    born_at: id.bornAt,
    traits: {
      affection: Math.round(id.traits.affection * 10) / 10,
      sarcasm: Math.round(id.traits.sarcasm * 10) / 10,
      playfulness: Math.round(id.traits.playfulness * 10) / 10,
    },
  };

  // Engine memories: permanent first, then salience, then recency. Expired ones never appear.
  let memories: Entry[] = clean(
    world.memories
      .filter((m) => m.expiresAt === null || m.expiresAt > now)
      .map((m) => ({ summary: m.summary, salience: m.salience, at: m.at, category: m.category })),
  )
    .sort((a, b) => b.salience - a.salience || b.at - a.at)
    .slice(0, LIMITS.episodic_memories);

  let preferences: Record<string, unknown> | undefined = {
    favorite_food: c.favoriteFood,
    disliked_food: c.dislikedFood,
    mini_game_wins: c.miniGameWins,
  };

  let relationship: Record<string, unknown> | undefined = {
    bond_level: round(c.stats.bond),
    days_together: Math.max(0, Math.floor((now - c.createdAt) / DAY)),
  };

  let recent = clean(world.events.slice(-LIMITS.recent_events).map((e) => ({ kind: e.kind, at: e.at, ...e.payload })));

  const canonical_state = {
    hunger: round(c.stats.hunger), energy: round(c.stats.energy), mood: round(c.stats.mood),
    health: round(c.stats.health), cleanliness: round(c.stats.cleanliness), curiosity: round(c.stats.curiosity),
    bond: round(c.stats.bond), asleep: c.asleep, sick: c.sick, conditions: conditions(c),
  };

  const environment = {
    time_of_day: timeOfDay(now),
    minutes_since_last_visit: Math.max(0, Math.floor((now - c.lastInteractionAt) / 60_000)),
  };

  const build = (): ContextBoxV1 => {
    // Insertion order is the serialization order: stable → volatile.
    const box: Record<string, unknown> = { schema: CONTEXT_BOX_SCHEMA, guardrails: { ...GUARDRAILS }, identity };
    if (preferences) box.preferences_and_habits = preferences;
    if (memories.length) box.episodic_memories = memories.map(({ summary, category, at }) => ({ summary, category, at }));
    if (relationship) box.relationship = relationship;
    if (recent.length) box.recent_events = recent;
    box.canonical_state = canonical_state;
    box.environment = environment;
    if (input.model) box.model_context = { ...input.model };
    box.generated_at = now;
    return box as unknown as ContextBoxV1;
  };

  const dropped: string[] = [];
  let box = build();
  let tokens = estimate(JSON.stringify(box));
  const over = () => tokens > input.budgetTokens;
  const rebuild = () => { box = build(); tokens = estimate(JSON.stringify(box)); };

  // Drop from the least important end, one piece at a time.
  while (over() && recent.length) { recent = recent.slice(1); dropped.push("recent_event"); rebuild(); }
  if (over() && preferences) { preferences = undefined; dropped.push("preferences_and_habits"); rebuild(); }
  if (over() && relationship) { relationship = undefined; dropped.push("relationship"); rebuild(); }
  while (over() && memories.length) { memories = memories.slice(0, -1); dropped.push("episodic_memory"); rebuild(); }

  return { box, tokens, fits: !over(), dropped };
}
