jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  AndroidImportance: { DEFAULT: 3, MAX: 5 },
}));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: "p" } } } } }));

import { targetFromData } from "@/lib/notifications";

describe("targetFromData", () => {
  it("routes order-paid pushes to the order screen", () => {
    expect(targetFromData({ screen: "orders", assignmentId: "a1" })).toEqual({ kind: "order", orderId: "a1" });
  });

  it("routes new-request pushes to the request screen", () => {
    expect(targetFromData({ assignmentId: "a1" })).toEqual({ kind: "assignment", assignmentId: "a1" });
    expect(targetFromData({ screen: "inbox", assignmentId: "a1" })).toEqual({ kind: "assignment", assignmentId: "a1" });
  });

  it("ignores payloads without an assignment id", () => {
    expect(targetFromData({ screen: "orders" })).toBeNull();
    expect(targetFromData(undefined)).toBeNull();
    expect(targetFromData({ assignmentId: 42 })).toBeNull();
  });
});
