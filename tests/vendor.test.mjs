// Tests for tools/sync-gus-runtime.mjs against real throwaway git repositories (no network).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ALLOWLIST, DEFAULT_DEST, SyncError, check, readUpstream, sync, verify } from "../tools/sync-gus-runtime.mjs";

const temps = [];
const temp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); temps.push(d); return d; };
afterEach(() => { while (temps.length) rmSync(temps.pop(), { recursive: true, force: true }); });

const BRIDGE_C = '#include "GUSLlamaBridge.h"\n#include <llama/llama.h>\n#include <string.h>\nint gus(void) { return 1; }\n';
const BRIDGE_H = "#include <stdint.h>\nint gus(void);\n";
const BUILD = '#!/usr/bin/env bash\nreadonly LLAMA_COMMIT="842b1880415d6f508f03b789e5ce70194def7bfd"\n';

/** A fake upstream with the real layout; returns { dir, commit(files) → sha }. */
function upstream() {
  const dir = temp("gus-up-");
  const g = (...a) => execFileSync("git", a, { cwd: dir }).toString().trim();
  g("init", "-q");
  const commit = (files) => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      if (text === null) rmSync(join(dir, path)); else writeFileSync(join(dir, path), text);
    }
    g("add", "-A");
    g("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "c");
    return g("rev-parse", "HEAD");
  };
  const base = {
    "Sources/Model/GUSLlamaBridge.c": BRIDGE_C,
    "Sources/Model/GUSLlamaBridge.h": BRIDGE_H,
    "scripts/build-llama-xcframework.sh": BUILD,
    "Sources/UI/App.swift": "// app code that must never be vendored\n",
  };
  return { dir, commit, first: commit(base) };
}

describe("sync-gus-runtime", () => {
  it("refuses anything but an explicit full commit SHA", () => {
    const up = upstream();
    for (const bad of ["HEAD", "main", "latest", up.first.slice(0, 7), "", undefined]) {
      expect(() => readUpstream(bad, up.dir)).toThrow(SyncError);
    }
    expect(() => readUpstream("0".repeat(40), up.dir)).toThrow(/not found upstream/);
  });

  it("copies only the allowlist, byte for byte, with matching hashes", () => {
    const up = upstream();
    const dest = temp("gus-dest-");
    const m = sync({ commit: up.first, source: up.dir, dest, syncedAt: "t" });
    expect(m.upstream.commit).toBe(up.first);
    expect(m.llama_cpp_commit).toBe("842b1880415d6f508f03b789e5ce70194def7bfd");
    expect(m.files.map((f) => f.source)).toEqual(ALLOWLIST);
    expect(readFileSync(join(dest, "Sources/Model/GUSLlamaBridge.c"), "utf8")).toBe(BRIDGE_C);
    expect(existsSync(join(dest, "Sources/UI/App.swift"))).toBe(false);
    expect(verify(dest)).toEqual([]);
  });

  it("is deterministic: the same SHA always gives the same snapshot", () => {
    const up = upstream();
    const a = temp("gus-a-"), b = temp("gus-b-");
    sync({ commit: up.first, source: up.dir, dest: a, syncedAt: "t" });
    sync({ commit: up.first, source: up.dir, dest: b, syncedAt: "t" });
    for (const f of [...ALLOWLIST, "VENDOR.json", "README.md"]) {
      expect(readFileSync(join(a, f)).equals(readFileSync(join(b, f)))).toBe(true);
    }
  });

  it("reads the pinned commit, not whatever upstream has now", () => {
    const up = upstream();
    up.commit({ "Sources/Model/GUSLlamaBridge.c": BRIDGE_C + "// newer upstream\n" });
    const dest = temp("gus-dest-");
    sync({ commit: up.first, source: up.dir, dest, syncedAt: "t" });
    expect(readFileSync(join(dest, "Sources/Model/GUSLlamaBridge.c"), "utf8")).toBe(BRIDGE_C);
    expect(check({ source: up.dir, dest })).toEqual([]);
  });

  it("detects a manual edit to the vendored copy, offline and against upstream", () => {
    const up = upstream();
    const dest = temp("gus-dest-");
    sync({ commit: up.first, source: up.dir, dest, syncedAt: "t" });
    writeFileSync(join(dest, "Sources/Model/GUSLlamaBridge.c"), BRIDGE_C + "// quick local fix\n");
    expect(verify(dest)).toEqual(["Sources/Model/GUSLlamaBridge.c was modified (sha256 differs from VENDOR.json)"]);
    expect(check({ source: up.dir, dest }).join("\n")).toMatch(/drifted from upstream/);
  });

  it("detects a manifest that was edited to hide a change, and extra files", () => {
    const up = upstream();
    const dest = temp("gus-dest-");
    sync({ commit: up.first, source: up.dir, dest, syncedAt: "t" });
    writeFileSync(join(dest, "Sources/Model/GUSLlamaBridge.c"), "tampered\n");
    const manifest = JSON.parse(readFileSync(join(dest, "VENDOR.json"), "utf8"));
    manifest.files[0].sha256 = "0".repeat(64);
    writeFileSync(join(dest, "VENDOR.json"), JSON.stringify(manifest, null, 2) + "\n");
    writeFileSync(join(dest, "patch.c"), "int extra;\n");
    const problems = check({ source: up.dir, dest }).join("\n");
    expect(problems).toMatch(/VENDOR.json differs from the pinned upstream/);
    expect(problems).toMatch(/patch.c is not part of the snapshot/);
  });

  it("fails on an unexpected upstream layout instead of copying something else", () => {
    const up = upstream();
    const moved = up.commit({ "Sources/Model/GUSLlamaBridge.h": null, "Sources/Runtime/GUSLlamaBridge.h": BRIDGE_H });
    expect(() => readUpstream(moved, up.dir)).toThrow(/Sources\/Model\/GUSLlamaBridge.h is missing/);
    const newDep = up.commit({ "Sources/Model/GUSLlamaBridge.h": BRIDGE_H, "Sources/Model/GUSLlamaBridge.c": BRIDGE_C + '#include "GUSSignalTrap.h"\n' });
    expect(() => readUpstream(newDep, up.dir)).toThrow(/now includes GUSSignalTrap.h/);
  });

  it("owns only its directory: stale files inside are removed, siblings are untouched", () => {
    const up = upstream();
    const root = temp("gus-root-");
    const dest = join(root, "vendor", "gus-runtime");
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "stale.c"), "old\n");
    writeFileSync(join(root, "vendor", "sibling.txt"), "keep\n");
    sync({ commit: up.first, source: up.dir, dest, syncedAt: "t" });
    expect(existsSync(join(dest, "stale.c"))).toBe(false);
    expect(readFileSync(join(root, "vendor", "sibling.txt"), "utf8")).toBe("keep\n");
  });

  it("the committed snapshot in this repo matches its manifest", () => {
    expect(verify(DEFAULT_DEST)).toEqual([]);
    const m = JSON.parse(readFileSync(join(DEFAULT_DEST, "VENDOR.json"), "utf8"));
    expect(m.upstream).toEqual({ repo: "https://github.com/DannyBaanks/iSyCodeMovil", commit: expect.stringMatching(/^[0-9a-f]{40}$/) });
  });
});
