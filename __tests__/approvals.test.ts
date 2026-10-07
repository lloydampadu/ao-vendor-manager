import {
  approvalKey, approvedKinds, approvedLampTypes, approvedTypesIn, groupOf, isApproved, needsBrandsStep, onlyKind, requestableSections,
} from "@/lib/approvals";
import { productSections } from "@/lib/products";
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
  it("offers Tyres, Lamps and parts, leaving out what's approved or waiting", () => {
    const s = requestableSections(["Tyres", "Fender"], ["Grille"]);
    expect(s[0]).toEqual({ title: "Whole kinds", items: ["Lamps"] });
    const body = s.find((x) => x.title === "Body")!.items;
    expect(body).toContain("B Pillar Trim");
    expect(body).not.toContain("Fender");
    expect(body).not.toContain("Grille");
  });

  it("once Lamps is approved or asked for, single lamps aren't offered", () => {
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
