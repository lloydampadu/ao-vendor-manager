// getWithEtag: sends If-None-Match, reads the ETag back, treats 304 as "keep your copy" and every other
// failure as an ApiError (status 0 = offline), without changing how ordinary requests behave.
jest.mock("expo-constants", () => ({ expoConfig: { version: "test" } }));
jest.mock("../lib/auth", () => ({ getToken: jest.fn(async () => "tok"), notifyUnauthorized: jest.fn() }));
jest.mock("../lib/logger", () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }));

import { ApiError, api, getWithEtag } from "../lib/api";
import { notifyUnauthorized } from "../lib/auth";

const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  ({ ok: status >= 200 && status < 300, status, headers: { get: (k: string) => headers[k] ?? null }, text: async () => (body === null ? "" : JSON.stringify(body)) });
const fetchMock = jest.fn();
beforeEach(() => { fetchMock.mockReset(); (globalThis as { fetch: unknown }).fetch = fetchMock; (notifyUnauthorized as jest.Mock).mockClear(); });

describe("getWithEtag", () => {
  it("sends no If-None-Match the first time and returns the body with its ETag", async () => {
    fetchMock.mockResolvedValue(reply(200, { version: "p1" }, { ETag: '"p1"' }));
    expect(await getWithEtag("/parts/catalog", null)).toEqual({ status: 200, body: { version: "p1" }, etag: '"p1"' });
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers["If-None-Match"]).toBeUndefined();
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("sends the stored ETag and returns 304 without a body", async () => {
    fetchMock.mockResolvedValue(reply(304, null, { ETag: '"p1"' }));
    expect(await getWithEtag("/parts/catalog", '"p1"')).toEqual({ status: 304 });
    expect(fetchMock.mock.calls[0][1].headers["If-None-Match"]).toBe('"p1"');
  });

  it("still throws an ApiError for real failures, and signs out on a 401", async () => {
    fetchMock.mockResolvedValue(reply(500, { error: "boom" }));
    await expect(getWithEtag("/parts/catalog", null)).rejects.toMatchObject({ status: 500 });
    fetchMock.mockResolvedValue(reply(401, { error: "no" }));
    await expect(getWithEtag("/parts/catalog", null)).rejects.toBeInstanceOf(ApiError);
    expect(notifyUnauthorized).toHaveBeenCalledTimes(1);
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));
    await expect(getWithEtag("/parts/catalog", null)).rejects.toMatchObject({ status: 0 });
  });

  it("leaves ordinary requests alone: a 304 is still an error for api.get", async () => {
    fetchMock.mockResolvedValue(reply(304, null));
    await expect(api.get("/x")).rejects.toMatchObject({ status: 304 });
  });
});
