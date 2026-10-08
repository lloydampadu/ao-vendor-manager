import { conditionDetail, conditionLabel, nextAction, orderSteps } from "@/lib/order-steps";

const states = (stage: string) => orderSteps(stage).map((s) => s.state);

describe("order steps", () => {
  it("shows where a paid order stands", () => {
    expect(states("TO_BRING")).toEqual(["current", "todo", "todo"]);
    expect(states("ON_THE_WAY")).toEqual(["done", "current", "todo"]);
    expect(states("HANDED_OVER")).toEqual(["done", "done", "done"]);
    expect(states("SOMETHING_NEW")).toEqual(["current", "todo", "todo"]);
  });

  it("offers one action per step, none once collected", () => {
    expect(nextAction("TO_BRING")).toBe("mark-ready");
    expect(nextAction("ON_THE_WAY")).toBe("hand-over");
    expect(nextAction("HANDED_OVER")).toBeNull();
  });

  it("says we collect and deliver", () => {
    expect(orderSteps("HANDED_OVER")[2].hint).toBe("We have it and will deliver it to the customer.");
  });
});

describe("item condition", () => {
  it("shortens to New or Used and keeps only extra detail", () => {
    expect(conditionLabel("Brand New")).toBe("New");
    expect(conditionLabel("Home Used")).toBe("Used");
    expect(conditionLabel("Bridgestone 205/55 R16 (NEW)")).toBe("New");
    expect(conditionDetail("Home Used")).toBeNull();
    expect(conditionDetail("Brand New")).toBeNull();
    expect(conditionDetail("Used")).toBeNull();
    expect(conditionDetail("Home Used, tested and working")).toBe("Home Used, tested and working");
    expect(conditionLabel("Refurbished")).toBe("Refurbished");
    expect(conditionDetail("Refurbished")).toBeNull();
  });
});
