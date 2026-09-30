/**
 * Builds the smoke's chat exactly as the app would: a real creature (the v1 fixture save,
 * migrated), its compiled Context Box inside the budget of a 2048-token local model, and
 * a turn where the player talks to it.
 *
 *   npx vite-node tools/gus-smoke/input.ts <out-dir>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyCommand } from "../../src/engine/commands";
import { contextBudget, estimateTokens } from "../../src/persona/budget";
import { compileContextBox } from "../../src/persona/compile";
import { SYSTEM_PROMPT, personaInput } from "../../src/persona/contract";
import { LOCAL_MAX_TOKENS, composeLocalChat } from "../../src/persona/localMind";
import { importSave } from "../../src/store/save";

const out = process.argv[2] ?? "gus-smoke";
const saved = importSave(readFileSync(new URL("../../tests/fixtures/save-v1.b7fe4b1.json", import.meta.url), "utf8")).world;
if (!saved) throw new Error("fixture save did not load");
const now = saved.creature.lastTickAt + 60_000;
const talked = applyCommand(saved, { id: "smoke-talk", kind: "talk" }, now);
const world = talked.world;
const turn = JSON.stringify(personaInput(world, talked.events.at(-1)!, now, "¡Hola! ¿Qué comiste hoy? 🐟"));
const budget = contextBudget({ totalTokens: 2048, reservedOutputTokens: LOCAL_MAX_TOKENS, systemTokens: estimateTokens(SYSTEM_PROMPT) + 20, turnTokens: estimateTokens(turn) });
if (!budget.fits) throw new Error("the fixed parts do not fit 2048 tokens");
const compiled = compileContextBox({ world, now, budgetTokens: budget.availableTokens, model: { mode: "local", context_budget_tokens: 2048 } });
const [system, user] = composeLocalChat(JSON.stringify(compiled.box), turn);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "system.txt"), system!.content);
writeFileSync(join(out, "user.txt"), user!.content);
writeFileSync(join(out, "input.json"), JSON.stringify({ budget, box_tokens_estimate: compiled.tokens, dropped: compiled.dropped, fits: compiled.fits }, null, 2));
console.log(JSON.stringify({ available_tokens: budget.availableTokens, box_tokens_estimate: compiled.tokens, dropped: compiled.dropped.length }));
