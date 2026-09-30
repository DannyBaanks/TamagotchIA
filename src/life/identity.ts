/**
 * The pet is not the model. PetIdentity is who the creature is, derived from the save:
 * it has no field for a model, provider, prompt or endpoint, so swapping the brain
 * (local GGUF, remote API, fallback) can never change it.
 */
import type { Stage, Traits, World } from "../engine/types";

export interface PetIdentity {
  id: string;
  name: string;
  species: string;
  seed: number;
  bornAt: number;
  hatchedAt: number | null;
  stage: Stage;
  /** Birth traits: fixed by the seed, they colour the voice and never the rules. */
  traits: Traits;
}

/** A read-only view; a copy, so a caller cannot write through it into the world. */
export function petIdentity(world: World): PetIdentity {
  const c = world.creature;
  return {
    id: c.id,
    name: c.name,
    species: c.species,
    seed: c.seed,
    bornAt: c.createdAt,
    hatchedAt: c.hatchedAt,
    stage: c.stage,
    traits: { ...c.traits },
  };
}
