import { describe, expect, it } from "vitest";
import { GUS_MODELS, DEFAULT_GUS_MODEL, findGusModel } from "../src/persona/gus";
import { PRESETS } from "../src/store/settings";

describe("GUS offline model catalog", () => {
  it("includes approved GGUF artifacts with verified digests", () => {
    expect(GUS_MODELS.length).toBeGreaterThanOrEqual(2);

    const smol = findGusModel("smollm2-360m-q4km");
    expect(smol).toBeDefined();
    expect(smol?.filename).toBe("smollm2-360m-instruct-q4_k_m.gguf");
    expect(smol?.sizeBytes).toBe(270590528);
    expect(smol?.sha256).toMatch(/^[0-9a-f]{64}$/);

    const qwen = findGusModel("qwen25-05b-q4km");
    expect(qwen).toBeDefined();
    expect(qwen?.filename).toBe("qwen2.5-0.5b-instruct-q4_k_m.gguf");
    expect(qwen?.sizeBytes).toBe(491400032);
  });

  it("finds models by filename case-insensitively", () => {
    expect(findGusModel("SMOLLM2-360M-INSTRUCT-Q4_K_M.GGUF")).toBeDefined();
    expect(findGusModel("nonexistent-model.gguf")).toBeUndefined();
  });

  it("default model matches recommended artifact", () => {
    expect(DEFAULT_GUS_MODEL).toBe("smollm2-360m-instruct-q4_k_m.gguf");
  });

  it("GUS Local preset is present in settings presets", () => {
    const gusPreset = PRESETS.find((p) => p.label.includes("GUS Local"));
    expect(gusPreset).toBeDefined();
    expect(gusPreset?.baseUrl).toBe("http://localhost:8080/v1");
    expect(gusPreset?.model).toContain("smollm2");
  });
});
