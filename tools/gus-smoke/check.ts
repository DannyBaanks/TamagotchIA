/**
 * Invariants of the native smoke (not the exact words: sampling is not a fixed string).
 *
 *   npx vite-node tools/gus-smoke/check.ts <out-dir> <smoke.json>
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateReply } from "../../src/persona/contract";

const [dir = "gus-smoke", resultPath = join(dir, "smoke.json")] = process.argv.slice(2);
const result = JSON.parse(readFileSync(resultPath, "utf8"));
const raw = readFileSync(join(dir, "text.bin"));
const problems: string[] = [];

if (result.status !== "OK") problems.push(`status ${result.status}: ${result.error}`);
if (result.reload_after_destroy !== true) problems.push("the model could not be loaded again after destroy");
let text = "";
try {
  text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
} catch {
  problems.push("output is not valid UTF-8");
}
if (!text.trim()) problems.push("empty output");
const leaks = ["<|im_start|>", "<|im_end|>", "<|endoftext|>", "<|eot_id|>", "<|start_header_id|>", "</s>", "<s>"].filter((t) => text.includes(t));
if (leaks.length) problems.push(`control tokens leaked: ${leaks.join(" ")}`);

// Informational: does this small model already meet the persona contract without a grammar (M4)?
const contract = validateReply(text);
console.log(JSON.stringify({ ...result, text, contract: contract.ok ? "ok" : contract.error }, null, 2));
if (problems.length) {
  console.error("smoke failed:\n  - " + problems.join("\n  - "));
  process.exit(1);
}
console.log("smoke invariants OK");
