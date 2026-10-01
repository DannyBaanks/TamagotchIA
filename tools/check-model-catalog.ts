/**
 * CI: every downloadable model must be pinned exactly as iSyCode Móvil pins it, at the same
 * upstream commit the runtime is vendored from. A typo in a hash or a revision fails here,
 * not on a player's phone after 1 GB of download.
 *
 *   npx vite-node tools/check-model-catalog.ts
 */
import { readFileSync } from "node:fs";
import { KNOWN_MODELS } from "../src/persona/knownModels";

const vendor = JSON.parse(readFileSync("vendor/gus-runtime/VENDOR.json", "utf8"));
const commit: string = vendor.upstream.commit;
const url = `https://raw.githubusercontent.com/DannyBaanks/iSyCodeMovil/${commit}/Catalog/models.json`;
const response = await fetch(url);
if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
const upstream = (await response.json()) as { models: Array<Record<string, unknown>> };

const problems: string[] = [];
for (const m of KNOWN_MODELS) {
  const u = upstream.models.find((x) => x.id === m.id);
  if (!u) { problems.push(`${m.id}: not in iSyCode Móvil's catalog at ${commit}`); continue; }
  if (u.status !== "pinned") problems.push(`${m.id}: upstream status is ${String(u.status)}, not pinned`);
  const pairs: Array<[string, unknown, unknown]> = [
    ["repository", m.repository, u.repository],
    ["revision", m.revision, u.revision],
    ["filename", m.filename, u.filename],
    ["bytes", m.bytes, u.byte_count],
    ["sha256", m.sha256, u.sha256],
  ];
  for (const [field, ours, theirs] of pairs) if (ours !== theirs) problems.push(`${m.id}.${field}: ${String(ours)} ≠ upstream ${String(theirs)}`);
}
if (problems.length) {
  console.error(`model catalog drifted from iSyCode Móvil @ ${commit}:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`model catalog OK: ${KNOWN_MODELS.length} models match iSyCode Móvil @ ${commit}`);
