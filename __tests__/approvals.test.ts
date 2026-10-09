import {
  approvalKey, approvedFluidKinds, autoOpenKind, approvedKinds, approvedLampTypes, approvedTypesIn, canListFluidKind, groupOf, isApproved, needsBrandsStep, OILS_FLUIDS, onlyKind, requestableSections,
} from "@/lib/approvals";
import { productSections } from "@/lib/products";
import { catalogNameLine } from "@/lib/part-tiles";
import type { LightListing, TyreListing } from "@/lib/db";
import type { ApiProduct } from "@/lib/api";

const kinds = (list: string[]) => approvedKinds(list).map((k) => `${k.label}:${k.form}`);

describe("the approved list", () => {
  it("matches the server's key (case, spacing and punctuation don't matter)", () => {
    expect(approvalKey("  B-Pillar  TRIM ")).toBe("b pillar trim");
    expect(isApproved(["B Pillar Trim"], "b pillar trim")).toBe(true);
    expect(isApproved(["B Pillar Trim"], "Bed Front Panel (Pickup)")).toBe(false);
  });

  it("only approved part types can be picked in a group", () => {
    expect(approvedTypesIn("Body", ["Fender", "Grille", "Alternator"])).toEqual(["Fender", "Grille"]);
    expect(approvedTypesIn("Body", ["Alternator"])).toEqual([]);
  });

  it("Lamps covers every lamp; a single lamp part covers just that type", () => {
    expect(approvedLampTypes(["Lamps"]).length).toBeGreaterThan(30);
    expect(approvedLampTypes(["Tail Light", "Fender"])).toEqual(["Tail Light"]);
    expect(approvedLampTypes(["Fender"])).toEqual([]);
  });
});

describe("What are you adding?", () => {
  it("each approved kind opens its own form", () => {
    expect(kinds(["Tyres", "Lamps", "Fender", "Alternator"])).toEqual(["Body:part", "Electrical:part", "Tyres:tyre", "Lamps:lamp"]);
    expect(approvedKinds(["Fender"])[0]).toMatchObject({ form: "part", partCategory: "Body" });
  });

  it("a group with no approved part isn't offered", () => {
    expect(kinds(["Fender"])).toEqual(["Body:part"]);
    expect(kinds([])).toEqual([]);
  });

  it("is skipped when there is only one kind (a tyres-only vendor lands on the tyre form)", () => {
    expect(onlyKind(approvedKinds(["Tyres"]))).toMatchObject({ form: "tyre" });
    expect(onlyKind(approvedKinds(["Fender", "Grille"]))).toMatchObject({ form: "part", partCategory: "Body" });
    expect(onlyKind(approvedKinds(["Tyres", "Fender"]))).toBeNull();
    expect(onlyKind(approvedKinds([]))).toBeNull();
  });
});

describe("asking for approval", () => {
  it("offers Tyres and parts (lamps as their own group), leaving out what's approved or waiting", () => {
    expect(requestableSections([], [])[0]).toEqual({ title: "Tyres", items: ["Tyres"] });
    const s = requestableSections(["Tyres", "Fender"], ["Grille"]);
    expect(s.some((x) => x.title === "Tyres")).toBe(false);
    // Lamps appear once: as the group of lamp types, never as a separate "every lamp" item.
    expect(s.flatMap((x) => x.items)).not.toContain("Lamps");
    expect(s.find((x) => x.title === "Lamps")!.items).toContain("Tail Light");
    const body = s.find((x) => x.title === "Body")!.items;
    expect(body).toContain("B Pillar Trim");
    expect(body).not.toContain("Fender");
    expect(body).not.toContain("Grille");
  });

  it("an older Lamps entry (approved or asked for) means no single lamps are offered", () => {
    expect(requestableSections(["Lamps"], []).some((x) => x.title === "Lamps")).toBe(false);
    expect(requestableSections([], ["Lamps"]).some((x) => x.title === "Lamps")).toBe(false);
  });

  it("can be narrowed to one group (the part form)", () => {
    expect(requestableSections([], [], "Body").map((x) => x.title)).toEqual(["Body"]);
  });

  it("sends each item with its group", () => {
    expect(groupOf("B Pillar Trim")).toBe("Body");
    expect(groupOf("Tyres")).toBe("Tyres");
    expect(groupOf("Tail Light")).toBe("Lamps");
  });
});

describe("the catalog name next to the customer's words", () => {
  it("shows only when it adds something", () => {
    expect(catalogNameLine("ABS module", "Anti-Lock Brake Computer")).toBe("Also called Anti-Lock Brake Computer");
    expect(catalogNameLine("Caliper", "caliper")).toBeNull();
    expect(catalogNameLine("ABS module", null)).toBeNull();
    expect(catalogNameLine("ABS module", undefined)).toBeNull();
  });
});

describe("onboarding", () => {
  it("only a tyres-only vendor skips the brands step", () => {
    expect(needsBrandsStep(["Tyres"])).toBe(false);
    expect(needsBrandsStep(["Tyres", "Fender"])).toBe(true);
    expect(needsBrandsStep(["Lamps"])).toBe(true);
  });
});

describe("one Products list", () => {
  const tyre = { id: "t1", brand: "Bridgestone" } as TyreListing;
  const lamp = { id: "l1", light_type: "Tail Light" } as LightListing;
  const part = (id: string, category: string | null) => ({ id, name: id, category } as ApiProduct);

  it("shows tyres, lamps and parts together, tyres and lamps first, rows of two", () => {
    const s = productSections([tyre], [lamp], [part("p1", "Engine"), part("p2", "Body"), part("p3", "Body"), part("p4", "Body"), part("p5", null)]);
    expect(s.map((x) => [x.key, x.count])).toEqual([["Tyres", 1], ["Lamps", 1], ["Body", 3], ["Engine", 1], ["Other", 1]]);
    expect(s[2].data.map((r) => r.length)).toEqual([2, 1]);
    expect(s[0].data[0][0]).toMatchObject({ kind: "tyre", id: "t:t1" });
  });

  it("leaves out empty kinds", () => {
    expect(productSections([], [], [part("p1", "Body")]).map((x) => x.key)).toEqual(["Body"]);
    expect(productSections([], [], [])).toEqual([]);
  });
});

describe("autoOpenKind", () => {
  it("waits for the cached fluid kinds, so a Tyres + one-kind vendor is not sent to Tyres", () => {
    expect(autoOpenKind(approvedKinds(["Tyres", "Engine oil"]), false)).toBeNull();
    expect(autoOpenKind(approvedKinds(["Tyres", "Engine oil"], ["Engine oil"]), true)).toBeNull();
    expect(autoOpenKind(approvedKinds(["Tyres"]), false)).toBeNull();
    expect(autoOpenKind(approvedKinds(["Tyres"]), true)).toMatchObject({ form: "tyre" });
  });
});

describe("Oils & fluids approval", () => {
  const fluidKinds = [{ id: "k1", name: "Engine oil" }, { id: "k2", name: "Brake fluid" }];
  it("the whole family covers every kind; a single kind covers itself", () => {
    expect(canListFluidKind([OILS_FLUIDS], "Brake fluid")).toBe(true);
    expect(canListFluidKind(["Engine oil"], "Brake fluid")).toBe(false);
    expect(approvedFluidKinds(["Engine oil"], fluidKinds).map((k) => k.id)).toEqual(["k1"]);
    expect(approvedFluidKinds(["Tyres"], fluidKinds)).toEqual([]);
  });
  it("offers the Oils & fluids form only when something is approved", () => {
    expect(approvedKinds([OILS_FLUIDS]).map((k) => k.form)).toEqual(["fluid"]);
    expect(approvedKinds(["Engine oil"], ["Engine oil", "Brake fluid"]).map((k) => k.key)).toEqual(["fluids"]);
    expect(approvedKinds(["Tyres"]).some((k) => k.form === "fluid")).toBe(false);
  });
  it("lets a vendor ask for the whole family or one kind", () => {
    const s = requestableSections([], [], undefined, ["Engine oil", "Brake fluid"]).find((x) => x.title === OILS_FLUIDS);
    expect(s?.items).toEqual([OILS_FLUIDS, "Engine oil", "Brake fluid"]);
    expect(requestableSections([OILS_FLUIDS], [], undefined, ["Engine oil"]).some((x) => x.title === OILS_FLUIDS)).toBe(false);
  });
  it("groups the family under itself, and skips the brands step for tyres and oils only", () => {
    expect(groupOf(OILS_FLUIDS)).toBe(OILS_FLUIDS);
    expect(needsBrandsStep([OILS_FLUIDS, "Tyres"])).toBe(false);
    expect(needsBrandsStep([OILS_FLUIDS, "Fender"])).toBe(true);
  });
});

import { canListBatteries } from "@/lib/approvals";

describe("Batteries approval", () => {
  it("Batteries, or the catalog part Battery, lets a vendor list batteries", () => {
    expect(canListBatteries(["Batteries"])).toBe(true);
    expect(canListBatteries(["battery"])).toBe(true);
    expect(canListBatteries(["Battery Cable"])).toBe(false);
  });
  it("adds a Batteries tile and asks for no brands from a battery-only vendor", () => {
    expect(approvedKinds(["Batteries"]).map((k) => `${k.label}:${k.form}`)).toEqual(["Batteries:battery"]);
    expect(needsBrandsStep(["Batteries"])).toBe(false);
    expect(requestableSections([], []).map((s) => s.title)).toContain("Batteries");
    expect(groupOf("Batteries")).toBe("Batteries");
  });
});
