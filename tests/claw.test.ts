import { compile, fingerprint } from "../src/avatar/render";
import { ERAS, POSES, parseSpec } from "../src/avatar/spec";
import { CLAW_SPEC, SPECIES, speciesById } from "../src/species";

describe("Claw, the crab", () => {
  it("is a real species in the catalog, next to the other two", () => {
    const ids = SPECIES.map((s) => s.id);
    expect(ids).toContain("claw-crab");
    const claw = speciesById("claw-crab");
    expect(claw.label).toBe("Claw");
    expect(claw.accent).toBe("#ce3434");
  });

  it("gives a drawable sprite for every pose", () => {
    const claw = speciesById("claw-crab");
    for (const pose of POSES) {
      const src = claw.sprite(pose);
      expect(src.startsWith("data:image/svg+xml;utf8,")).toBe(true);
      const svg = decodeURIComponent(src.split(",", 2)[1]!);
      expect(svg).toContain("<svg");
      // something was actually painted
      expect((svg.match(/<rect /g) ?? []).length).toBeGreaterThan(60);
    }
  });

  it("uses the coral and cian of the logo, not another species' colors", () => {
    const svg = decodeURIComponent(speciesById("claw-crab").sprite("idle").split(",", 2)[1]!);
    expect(svg.toUpperCase()).toContain("#CE3434");
    expect(svg.toUpperCase()).toContain("#00DEC6");
    // and it is not borrowing the cat's lime
    expect(svg.toUpperCase()).not.toContain("#C6FF3D");
  });

  it("is drawn by the compiler, not shipped as an image file", () => {
    const claws = resolveSpec();
    expect(claws.ok).toBe(true);
    if (!claws.ok) return;
    const sprite = compile(claws.spec);
    expect(sprite.size).toBe(ERAS["16bit"].size);
    // deterministic: same spec, same pixels
    expect(fingerprint(sprite)).toBe(fingerprint(compile(claws.spec)));
  });

  it("accepts the crab body in the closed catalog", () => {
    const parsed = parseSpec({ ...CLAW_SPEC });
    expect(parsed.ok).toBe(true);
  });

  it("is not the same sprite as the other species", () => {
    const spec = resolveSpec();
    if (!spec.ok || spec.spec.kind !== "partes") throw new Error("spec must parse as partes");
    const crab = fingerprint(compile(spec.spec));
    // same era, same everything, only the body and palette change
    const cat = fingerprint(compile({ ...spec.spec, body: "gato", color: "lima", accent: "amarillo" }));
    expect(crab).not.toBe(cat);
  });
});

function resolveSpec() {
  return parseSpec({ ...CLAW_SPEC });
}
