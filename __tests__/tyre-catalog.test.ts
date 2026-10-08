import { brandsOf, catalogChoices, modelsOf, parsePriceAdvice, priceNote } from "@/lib/tyre-catalog";

const resp = {
  brands: [
    { brandName: "Michelin", models: [{ sizeId: "s1", modelName: "Primacy 4" }, { sizeId: "s2", modelName: "Pilot Sport" }] },
    { brandName: "Bridgestone", models: [{ sizeId: "s3", modelName: "Turanza" }] },
  ],
};

describe("tyre catalog in the app", () => {
  it("lists brand and model choices for a size", () => {
    expect(catalogChoices({ brands: [{ brandName: "Michelin", models: [{ sizeId: "s1", modelName: "Primacy 4" }] }] }))
      .toEqual([{ sizeId: "s1", brand: "Michelin", model: "Primacy 4" }]);
  });

  it("returns nothing for an empty catalog", () => {
    expect(catalogChoices({ brands: [] })).toEqual([]);
  });

  it("lists brands once, sorted, and the models of one brand", () => {
    const choices = catalogChoices(resp);
    expect(brandsOf(choices)).toEqual(["Bridgestone", "Michelin"]);
    expect(modelsOf(choices, "Michelin").map((c) => c.model)).toEqual(["Primacy 4", "Pilot Sport"]);
    expect(modelsOf(choices, "Nope")).toEqual([]);
  });

  it("explains the price band without naming anyone", () => {
    expect(priceNote({ lowestGhs: 300, maxGhs: 330 })).toBe("Other vendors sell this for GHS 300. Price it at GHS 330 or less to get orders.");
    expect(priceNote(null)).toBeNull();
  });

  it("parses stored price advice and ignores junk", () => {
    expect(parsePriceAdvice('{"lowestGhs":300,"maxGhs":330}')).toEqual({ lowestGhs: 300, maxGhs: 330 });
    expect(parsePriceAdvice(null)).toBeNull();
    expect(parsePriceAdvice("not json")).toBeNull();
    expect(parsePriceAdvice('{"lowestGhs":"x"}')).toBeNull();
  });
});
