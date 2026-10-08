import type { ApiFluidCatalog } from "@/lib/api";
import type { FluidListing } from "@/lib/db";
import {
  ALREADY_LISTED_MESSAGE, NOT_LISTED, NO_GRADE, brandOptions, chooseBrand, chooseKind, emptyPick, findExistingFluid, gradeOptions, productOptions, typedProduct,
} from "@/lib/fluid-form";

const catalog: ApiFluidCatalog = {
  kinds: [
    { id: "k-oil", slug: "engine-oil", name: "Engine oil", grades: ["5W-30", "5W-40"], gradeRequired: true, coolant: false },
    { id: "k-brake", slug: "brake-fluid", name: "Brake fluid", grades: ["DOT 4"], gradeRequired: false, coolant: false },
  ],
  brands: [{ id: "b-total", name: "Total" }, { id: "b-castrol", name: "Castrol" }],
  lines: [{ kindId: "k-oil", brandId: "b-total", name: "Quartz 9000" }],
  sizes: [{ label: "4 L", ml: 4000 }],
  coolantColours: [], coolantMixes: [],
};

const full = { ...emptyPick(), kindId: "k-oil", brandId: "b-total", product: "Quartz 9000", grade: "5W-40", size: "4 L", genuine: true };

describe("fluid form pickers", () => {
  it("changing the kind clears every dependent pick", () => {
    expect(chooseKind(full, "k-brake")).toEqual({ ...emptyPick(), kindId: "k-brake" });
  });
  it("changing the brand clears the product and the genuine tick, and keeps kind, grade and size", () => {
    expect(chooseBrand(full, "b-castrol")).toMatchObject({ kindId: "k-oil", brandId: "b-castrol", product: "", genuine: false, grade: "5W-40", size: "4 L" });
    expect(chooseBrand(full, null)).toMatchObject({ brandId: null, brandName: "", product: "", genuine: false });
  });
  it("offers 'Not in the list' last on brands and products, and 'No grade' only when a grade is optional", () => {
    expect(brandOptions(catalog)).toEqual(["Total", "Castrol", NOT_LISTED]);
    expect(productOptions(catalog, full)).toEqual(["Quartz 9000", NOT_LISTED]);
    expect(productOptions(catalog, { ...full, brandId: null })).toEqual([NOT_LISTED]);
    expect(gradeOptions(catalog.kinds[0])).toEqual(["5W-30", "5W-40"]);
    expect(gradeOptions(catalog.kinds[1])).toEqual([NO_GRADE, "DOT 4"]);
  });
  it("a typed product line only sets the product, never the brand", () => {
    expect(typedProduct(full, "Titan GT1")).toMatchObject({ brandId: "b-total", product: "Titan GT1" });
  });
});

const row = (over: Partial<FluidListing> = {}): FluidListing => ({
  id: "f1", server_id: "s1", fluid_product_id: "p", kind_id: "k-oil", kind: "Engine oil", brand_id: "b-total", brand: "Total", product: "Quartz 9000",
  grade: "5W-40", coolant_colour: "", coolant_mix: "", size_label: "4 L", status: "APPROVED", review_status: "OK", hidden: 0, hidden_reason: null, rejected_reason: null,
  price_ghs: 300, photos: "[]", in_stock: 1, price_advice: null, updated_at: "x", ...over,
});

describe("findExistingFluid", () => {
  it("finds the vendor's own listing of the same product, and says so in plain words", () => {
    expect(findExistingFluid([row()], full)?.id).toBe("f1");
    expect(ALREADY_LISTED_MESSAGE).toBe("You already list this. Edit your existing listing.");
  });
  it("matches a typed brand and product without caring about case", () => {
    const typed = { ...full, brandId: null, brandName: " fuchs ", product: "TITAN gt1" };
    expect(findExistingFluid([row({ brand_id: null, brand: "Fuchs", product: "Titan GT1" })], typed)?.id).toBe("f1");
  });
  it("ignores a different size, and a refused row (it can be added again)", () => {
    expect(findExistingFluid([row({ size_label: "1 L" })], full)).toBeNull();
    expect(findExistingFluid([row({ status: "REJECTED" })], full)).toBeNull();
  });
});
