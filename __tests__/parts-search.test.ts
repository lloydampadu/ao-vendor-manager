// The generated copy of @abossey/parts must behave like the package (the same golden cases).
import { findPartExact, searchParts, type CatalogPart } from "../lib/parts-search.generated";

declare const __dirname: string; // provided by jest; the project's types do not include node's

const part =(id: string, name: string, aliases: CatalogPart["aliases"]): CatalogPart =>
  ({ id, slug: id, name, sides: "NONE", positions: "NONE", dependsOn: [], groupIds: [], options: [], aliases, description: null, icon: null });
const catalog = { parts: [
  part("pads", "Brake pads", [{ text: "pads", kind: "MARKET" }, { text: "Brake Shoes/Pads", kind: "OLD_NAME" }]),
  part("ind", "Indicator lamp", [{ text: "trafficator", kind: "MARKET" }]),
  part("mirror", "Side mirror", [{ text: "sɛnsɔ mirror", kind: "TWI" }]),
] };

describe("the shared parts search in the vendor app", () => {
  it("finds parts by market words, old names and folded Twi spellings", () => {
    expect(searchParts("pads", catalog)[0].part.id).toBe("pads");
    expect(searchParts("trafficator", catalog)[0].part.id).toBe("ind");
    expect(searchParts("senso mirror", catalog)[0].part.id).toBe("mirror");
    expect(findPartExact("brake shoes / pads", catalog)?.id).toBe("pads");
  });
  it("carries the generated header, so nobody edits it by hand", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../lib/parts-search.generated.ts"), "utf8");
    expect(src.startsWith("// GENERATED from AbosseyOkai packages/parts/src/index.ts")).toBe(true);
  });
});
