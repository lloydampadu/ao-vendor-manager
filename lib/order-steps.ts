// The three steps of a paid order from the vendor's side. Pure, so it is unit-tested.
//   TO_BRING     the vendor gets the items ready
//   ON_THE_WAY   ready; our rider is coming to collect
//   HANDED_OVER  collected; we deliver it to the customer

export type OrderStage = "TO_BRING" | "ON_THE_WAY" | "HANDED_OVER";
export type StepState = "done" | "current" | "todo";

export const ORDER_STEPS: { stage: OrderStage; title: string; hint: string }[] = [
  { stage: "TO_BRING", title: "Get it ready", hint: "Prepare the items below, then tap Mark ready." },
  { stage: "ON_THE_WAY", title: "Ready for pickup", hint: "Our rider is coming to collect it. Take a photo when you hand it over." },
  { stage: "HANDED_OVER", title: "Collected", hint: "We have it and will deliver it to the customer." },
];

/** Each step with its state. An unknown stage counts as the first step. */
export function orderSteps(stage: string): { stage: OrderStage; title: string; hint: string; state: StepState }[] {
  const at = Math.max(0, ORDER_STEPS.findIndex((s) => s.stage === stage));
  return ORDER_STEPS.map((s, i) => ({ ...s, state: i < at ? "done" : i === at ? (stage === "HANDED_OVER" ? "done" : "current") : "todo" }));
}

/** What the vendor does next, if anything. */
export function nextAction(stage: string): "mark-ready" | "hand-over" | null {
  if (stage === "HANDED_OVER") return null;
  return stage === "ON_THE_WAY" ? "hand-over" : "mark-ready";
}

// Tyre options embed condition as "... (NEW)"; regular parts use "Brand New" /
// "Home Used". Anything else falls back to the raw label.
export function conditionLabel(raw: string): string {
  const m = raw.match(/\b(new|used)\b/i);
  if (m) return m[1].toLowerCase() === "new" ? "New" : "Used";
  return raw.trim();
}

/** The full condition text, only when it says more than the short label ("Home Used (tested)"). */
export function conditionDetail(raw: string): string | null {
  const short = conditionLabel(raw).toLowerCase();
  const plain = raw.trim().toLowerCase();
  if (!plain || plain === short) return null;
  if (["brand new", "home used"].includes(plain)) return null;
  return raw.trim();
}
