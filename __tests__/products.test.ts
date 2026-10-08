import { productSections } from "@/lib/products";
import type { FluidListing } from "@/lib/db";
import type { ApiProduct } from "@/lib/api";

const fluid = (id: string): FluidListing => ({ id, server_id: id, fluid_product_id: "p", kind_id: "k", kind: "Engine oil", brand_id: "b", brand: "Total", product: "Quartz 9000",
  grade: "5W-40", coolant_colour: "", coolant_mix: "", size_label: "4 L", status: "APPROVED", review_status: "OK", hidden: 0, hidden_reason: null, rejected_reason: null,
  price_ghs: 300, photos: "[]", in_stock: 1, price_advice: null, updated_at: "x" });

describe("productSections with fluids", () => {
  it("puts Oils & fluids after Lamps and before the part groups", () => {
    const parts = [{ id: "p1", name: "Fender", priceGhs: 1, condition: "USED", photos: [], inStock: true, category: "Body", createdAt: "x" }] as unknown as ApiProduct[];
    const s = productSections([], [], parts, [fluid("f1"), fluid("f2"), fluid("f3")]);
    expect(s.map((x) => [x.key, x.count])).toEqual([["Oils & fluids", 3], ["Body", 1]]);
    expect(s[0].data).toHaveLength(2);
    expect(s[0].data[0][0]).toMatchObject({ kind: "fluid", id: "f:f1" });
  });
  it("leaves the section out when there are no fluids", () => {
    expect(productSections([], [], [])).toEqual([]);
  });
});
