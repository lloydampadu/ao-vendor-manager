import {
  NOT_LISTED, batteryListingTitle, batteryPickProblem, brandOptions, catalogProductFor, chooseBrand, emptyBatteryPick, findExistingBattery, pickBrand, pickSize, pickTerminal, ALREADY_LISTED_MESSAGE, resolveTypedBrand,
  reconcileBatteryPick, warrantyProblem, withCatalogFigures, type BatteryPick,
} from "@/lib/battery-form";
import type { ApiBatteryCatalog } from "@/lib/api";
import type { BatteryListing } from "@/lib/db";

const catalog: ApiBatteryCatalog = {
  brands: [{ id: "b-varta", name: "Varta" }],
  sizes: [{ id: "s60", code: "NS60", standard: "JIS" }, { id: "s23", code: "55D23", standard: "JIS" }],
  products: [{ id: "p1", brandId: "b-varta", sizeId: "s60", terminal: "LEFT", voltage: 12, capacityAh: 45, cca: 330, type: "MF" }],
  types: [{ value: "MF", label: "Maintenance-free" }, { value: "WET", label: "Wet (refillable)" }],
  terminals: [{ value: "LEFT", label: "Positive on the left" }, { value: "RIGHT", label: "Positive on the right" }],
  voltages: [12, 24], warrantyMaxMonths: 60,
};
const picked = (over: Partial<BatteryPick> = {}): BatteryPick => ({ ...emptyBatteryPick(), brandId: "b-varta", sizeId: "s60", terminal: "LEFT", warranty: "12", genuine: true, ...over });

describe("battery form", () => {
  it("offers the catalog's brands, then Not in the list", () => {
    expect(brandOptions(catalog)).toEqual(["Varta", NOT_LISTED]);
  });
  it("a battery in the catalog fills its own figures", () => {
    expect(catalogProductFor(catalog, picked())?.id).toBe("p1");
    expect(withCatalogFigures(catalog, picked())).toMatchObject({ type: "MF", voltage: 12, capacityAh: "45", cca: "330" });
    expect(catalogProductFor(catalog, picked({ terminal: "RIGHT" }))).toBeNull();
  });
  it("checks the pick before anything is queued", () => {
    expect(batteryPickProblem(catalog, withCatalogFigures(catalog, picked()))).toBeNull();
    expect(batteryPickProblem(catalog, picked({ sizeId: "" }))).toBe("Choose the size code.");
    expect(batteryPickProblem(catalog, picked({ terminal: "" }))).toBe("Choose the side of the positive terminal.");
    expect(batteryPickProblem(catalog, picked({ terminal: "RIGHT", type: "MF" }))).toBe("This battery isn't in our list yet. Enter the capacity in Ah, from 20 to 250.");
    expect(batteryPickProblem(catalog, picked({ terminal: "RIGHT", type: "MF", capacityAh: "45", cca: "50" }))).toBe("This battery isn't in our list yet. Enter the CCA from 100 to 1500, or leave it empty.");
    expect(batteryPickProblem(catalog, picked({ terminal: "RIGHT", type: "MF", capacityAh: "45" }))).toBeNull();
    expect(batteryPickProblem(catalog, withCatalogFigures(catalog, picked({ genuine: false })))).toBe('Tick "This is a genuine Varta battery" to list it.');
    expect(batteryPickProblem(catalog, picked({ brandId: null, brandName: "F" }))).toBe("Choose the brand, or type it in full.");
  });
  it("needs a warranty in whole months from 0 to the catalog's maximum", () => {
    expect(warrantyProblem("12", 60)).toBeNull();
    expect(warrantyProblem("0", 60)).toBeNull();
    expect(warrantyProblem("", 60)).toBe("Enter the warranty in months, from 0 to 60.");
    expect(warrantyProblem("61", 60)).toBe("Enter the warranty in months, from 0 to 60.");
  });
  it("a new brand clears the genuine tick, which named the old one", () => {
    expect(chooseBrand(picked(), null)).toMatchObject({ brandId: null, brandName: "", genuine: false });
  });
  it("drops picks the catalog no longer has", () => {
    const gone = { ...catalog, brands: [], sizes: [catalog.sizes[1]] };
    expect(reconcileBatteryPick(gone, picked())).toMatchObject({ brandId: null, sizeId: "" });
    expect(reconcileBatteryPick(catalog, picked())).toEqual(picked());
  });
  it("finds the vendor's own listing of the same battery, and says the title the customer sees", () => {
    const row = { id: "l1", status: "APPROVED", brand_id: "b-varta", brand: "Varta", size_id: "s60", size_code: "NS60", terminal: "LEFT", voltage: 12, capacity_ah: 45, cca: 330 } as BatteryListing;
    expect(findExistingBattery([row], picked())?.id).toBe("l1");
    expect(findExistingBattery([{ ...row, status: "REJECTED" }], picked())).toBeNull();
    expect(findExistingBattery([row], picked({ terminal: "RIGHT" }))).toBeNull();
    expect(batteryListingTitle(row)).toBe("Varta NS60 · 12V 45Ah · 330 CCA · Positive on the left");
  });
});

describe("editing a listed battery", () => {
  it("only the warranty is checked again: the battery itself is fixed once listed", () => {
    expect(warrantyProblem("24", catalog.warrantyMaxMonths)).toBeNull();
    expect(warrantyProblem("-1", catalog.warrantyMaxMonths)).toBe("Enter the warranty in months, from 0 to 60.");
    expect(warrantyProblem("2.5", catalog.warrantyMaxMonths)).toBe("Enter the warranty in months, from 0 to 60.");
  });
});

describe("changing a pick clears what depended on it", () => {
  const full = () => withCatalogFigures(catalog, picked());
  it("a new brand clears size, side and figures, and the genuine tick", () => {
    expect(pickBrand(full(), null)).toMatchObject({ brandId: null, sizeId: "", terminal: "", type: "", capacityAh: "", cca: "", genuine: false });
  });
  it("a new size clears side and figures but keeps the brand", () => {
    expect(pickSize(full(), "s23")).toMatchObject({ brandId: "b-varta", sizeId: "s23", terminal: "", type: "", capacityAh: "", cca: "" });
  });
  it("a new side clears the figures so none of another battery's are kept", () => {
    expect(pickTerminal(full(), "RIGHT")).toMatchObject({ sizeId: "s60", terminal: "RIGHT", type: "", capacityAh: "", cca: "" });
  });
  it("takes its picker wording and name matching from the module the fluid form uses", () => {
    jest.isolateModules(() => {
      jest.doMock("@/lib/listing-pick", () => ({ NOT_LISTED: "probe: not listed", ALREADY_LISTED_MESSAGE: "probe: already listed", sameName: () => true }));
      const battery = require("@/lib/battery-form");
      const fluid = require("@/lib/fluid-form");
      expect([battery.ALREADY_LISTED_MESSAGE, fluid.ALREADY_LISTED_MESSAGE]).toEqual(["probe: already listed", "probe: already listed"]);
      expect([battery.NOT_LISTED, fluid.NOT_LISTED]).toEqual(["probe: not listed", "probe: not listed"]);
      expect(battery.brandOptions({ ...catalog, brands: [] })).toEqual(["probe: not listed"]);
      // Name matching too: with the probe every typed brand matches the first catalog brand.
      expect(battery.resolveTypedBrand(catalog, { ...emptyBatteryPick(), brandName: "anything" }).brandId).toBe(catalog.brands[0].id);
    });
    expect(ALREADY_LISTED_MESSAGE).toBe("You already list this. Edit your existing listing.");
  });
});

describe("a brand typed under Not in the list", () => {
  const typed = (name: string, over: Partial<BatteryPick> = {}) => picked({ brandId: null, brandName: name, ...over });
  const synced = { id: "l2", status: "PENDING", brand_id: "b-new", brand: "Fengli", size_id: "s60", size_code: "NS60", terminal: "LEFT" } as BatteryListing;
  it("finds a synced listing of the same typed brand, whatever brand id the server gave it", () => {
    expect(findExistingBattery([synced], typed(" fengli "))?.id).toBe("l2");
    expect(findExistingBattery([synced], typed("Fengli", { terminal: "RIGHT" }))).toBeNull();
  });
  it("a typed name equal to a listed brand is that brand, so its figures come from the list", () => {
    const resolved = resolveTypedBrand(catalog, typed("varta"));
    expect(resolved).toMatchObject({ brandId: "b-varta", brandName: "" });
    expect(withCatalogFigures(catalog, resolved)).toMatchObject({ capacityAh: "45", type: "MF" });
    expect(resolveTypedBrand(catalog, typed("Fengli"))).toEqual(typed("Fengli"));
    expect(resolveTypedBrand(catalog, picked())).toEqual(picked());
  });
  it("finds the listing of a listed brand typed in lower case", () => {
    const row = { id: "l1", status: "APPROVED", brand_id: "b-varta", brand: "Varta", size_id: "s60", terminal: "LEFT" } as BatteryListing;
    expect(findExistingBattery([row], resolveTypedBrand(catalog, typed("varta")))?.id).toBe("l1");
  });
});
