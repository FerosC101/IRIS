import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, qs, request, setDemoUser } from "@/services/client";

afterEach(() => vi.restoreAllMocks());

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("api client", () => {
  it("sends the demo user header", async () => {
    setDemoUser("U-PROV-MLY");
    const f = mockFetch(200, { ok: true });
    await request("/meta");
    const headers = f.mock.calls[0][1]!.headers as Headers;
    expect(headers.get("X-IRIS-User")).toBe("U-PROV-MLY");
  });
  it("surfaces server messages and row-level issues", async () => {
    mockFetch(422, { detail: { message: "The file still has validation errors.", errors: [{ row: 3, column: "cases", message: "Not a number" }] } });
    await expect(request("/imports/commit", { method: "POST", json: {} })).rejects.toMatchObject({ status: 422, message: "The file still has validation errors.", issues: [{ row: 3 }] });
  });
  it("explains an unreachable server", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const err = (await request("/meta").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toMatch(/could not be reached/);
  });
  it("omits empty query parameters", () => {
    expect(qs({ a: 1, b: "", c: null, d: "x y" })).toBe("?a=1&d=x+y");
  });
});
