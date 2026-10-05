import { afterEach, describe, expect, it, vi } from "vitest";
import { runCheck } from "./runner";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runCheck", () => {
  it("reports success on a 2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );

    const result = await runCheck("https://example.com", {
      timeoutMs: 1000,
      expectedStatus: 200,
    });

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
  });

  it("honors a custom expectedStatus", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 302 })),
    );

    const result = await runCheck("https://example.com", {
      timeoutMs: 1000,
      expectedStatus: 302,
    });

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(302);
  });

  it("treats a non-2xx response as failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );

    const result = await runCheck("https://example.com", {
      timeoutMs: 1000,
      expectedStatus: 200,
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(500);
  });

  it("reports a timeout when the request aborts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, opts: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            opts.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );

    const result = await runCheck("https://example.com", {
      timeoutMs: 30,
      expectedStatus: 200,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("timeout");
  });
});
