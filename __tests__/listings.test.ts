jest.mock("@/lib/db", () => ({}));
jest.mock("../lib/db", () => ({}));

import { fluidPayload, tyrePayload } from "@/lib/listings";
import type { TyreListing } from "@/lib/db";

const row: TyreListing = {
  id: "t1", server_id: "t1", width: 205, height: 55, diameter: 16, brand: "Michelin", model: "Primacy 4",
  condition: "NEW", price_ghs: 850, photos: '["u"]', in_stock: 1, tyre_size_id: null, price_advice: null, proposed: 0, updated_at: "now",
};

describe("tyrePayload", () => {
  it("sends tyreSizeId when linked", () => {
    expect(tyrePayload({ ...row, tyre_size_id: "s1" })).toMatchObject({ tyreSizeId: "s1", brand: "Michelin", priceGhs: 850 });
  });
  it("omits the tyreSizeId key when unlinked", () => {
    expect("tyreSizeId" in tyrePayload(row)).toBe(false);
  });
  it("asks for an unlinked proposed tyre to be added to the catalog", () => {
    const proposed = { ...row, tyre_size_id: null, proposed: 1 };
    expect(tyrePayload(proposed)).toMatchObject({ proposal: true, brand: proposed.brand, model: proposed.model });
    expect(tyrePayload({ ...proposed, proposed: 0 })).not.toHaveProperty("proposal");
    expect(tyrePayload({ ...proposed, tyre_size_id: "s1" })).not.toHaveProperty("proposal");
  });
});

describe("fluidPayload", () => {
  it("sends a typed brand as brandName, a picked one as brandId, and always the genuine tick", () => {
    const base = { id: "local-1", server_id: null, fluid_product_id: null, kind_id: "k", kind: "Engine oil", brand_id: "b", brand: "Total", product: "Quartz 9000",
      grade: "5W-40", coolant_colour: "", coolant_mix: "", size_label: "4 L", status: "LOCAL", review_status: "OK", hidden: 0, hidden_reason: null, price_ghs: 300, photos: "[]", in_stock: 1, price_advice: null, updated_at: "x" };
    expect(fluidPayload(base)).toEqual({
      server_id: null, kindId: "k", brandId: "b", productName: "Quartz 9000", grade: "5W-40", coolantColour: null, coolantMix: null, sizeLabel: "4 L",
      priceGhs: 300, photos: [], inStock: true, genuine: true,
    });
    expect(fluidPayload({ ...base, brand_id: null, brand: "Fuchs" })).toMatchObject({ brandName: "Fuchs" });
    expect(fluidPayload({ ...base, brand_id: null, brand: "Fuchs" })).not.toHaveProperty("brandId");
  });
});
