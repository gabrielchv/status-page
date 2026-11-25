import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { runCheck } from "./runner";

/**
 * These run against a real local HTTP server rather than a stubbed `fetch`.
 * `runCheck` now dials through `node:http` with a guarded `lookup`, and a stub
 * of the global fetch would exercise none of the code under test — including
 * the address validation that is the point of it.
 *
 * Every call passes `allowPrivate: true` unless it is specifically testing the
 * guard, because the fixture server is on loopback.
 */

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
});

/** Starts a local server and returns its base URL. */
async function serve(handler: Parameters<typeof createServer>[1]): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return `http://127.0.0.1:${address.port}`;
}

describe("runCheck", () => {
  it("reports success on a 2xx response", async () => {
    const base = await serve((_req, res) => res.writeHead(200).end("ok"));

    const result = await runCheck(base, {
      timeoutMs: 2000,
      expectedStatus: 200,
      allowPrivate: true,
    });

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.error).toBeNull();
  });

  it("honors a custom expectedStatus", async () => {
    const base = await serve((_req, res) => res.writeHead(302, { location: "/x" }).end());

    const result = await runCheck(base, {
      timeoutMs: 2000,
      expectedStatus: 302,
      allowPrivate: true,
    });

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(302);
  });

  it("treats a non-matching response as failure", async () => {
    const base = await serve((_req, res) => res.writeHead(500).end("boom"));

    const result = await runCheck(base, {
      timeoutMs: 2000,
      expectedStatus: 200,
      allowPrivate: true,
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(500);
  });

  it("does not follow a redirect", async () => {
    const base = await serve((_req, res) => res.writeHead(301, { location: "/elsewhere" }).end());

    const result = await runCheck(base, {
      timeoutMs: 2000,
      expectedStatus: 200,
      allowPrivate: true,
    });

    expect(result.statusCode).toBe(301);
    expect(result.success).toBe(false);
  });

  it("reports a timeout when the server never responds", async () => {
    const base = await serve(() => {
      // Hold the connection open and never reply.
    });

    const result = await runCheck(base, {
      timeoutMs: 100,
      expectedStatus: 200,
      allowPrivate: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("timeout");
  });

  it("drains a body that is sent slowly, so the socket is released", async () => {
    // Headers arrive immediately; the body trickles. Reading to the end is what
    // makes the result land after the body rather than at header time.
    const base = await serve((_req, res) => {
      res.writeHead(200);
      res.write("a");
      setTimeout(() => res.end("b"), 50);
    });

    const result = await runCheck(base, {
      timeoutMs: 2000,
      expectedStatus: 200,
      allowPrivate: true,
    });

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
  });
});

describe("runCheck URL guard", () => {
  it("refuses a loopback target when private addresses are not allowed", async () => {
    const base = await serve((_req, res) => res.writeHead(200).end());

    const result = await runCheck(base, {
      timeoutMs: 2000,
      expectedStatus: 200,
      allowPrivate: false,
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBeNull();
    expect(result.error).toMatch(/private or reserved range/);
  });

  it("refuses the cloud metadata address", async () => {
    const result = await runCheck("http://169.254.169.254/latest/meta-data/", {
      timeoutMs: 2000,
      expectedStatus: 200,
      allowPrivate: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/private or reserved range/);
  });

  it("refuses a hostname that resolves to a private address", async () => {
    // Simulates the rebinding case: the URL looks public, the answer is not.
    // Node calls `lookup` with `all: true` on some paths (happy eyeballs), so
    // the stub has to honour both callback shapes the real resolver uses.
    const resolver = ((
      _hostname: string,
      options: { all?: boolean },
      callback: (
        err: Error | null,
        address?: string | Array<{ address: string; family: number }>,
        family?: number,
      ) => void,
    ) => {
      if (options?.all) {
        callback(null, [{ address: "10.0.0.7", family: 4 }]);
        return;
      }
      callback(null, "10.0.0.7", 4);
    }) as unknown as typeof import("node:dns").lookup;

    const result = await runCheck("http://rebind.example/health", {
      timeoutMs: 2000,
      expectedStatus: 200,
      allowPrivate: false,
      resolver,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/resolved to 10\.0\.0\.7/);
  });

  it("refuses a non-http scheme", async () => {
    const result = await runCheck("file:///etc/passwd", {
      timeoutMs: 2000,
      expectedStatus: 200,
      allowPrivate: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/http or https/);
  });

  it("refuses embedded credentials", async () => {
    const result = await runCheck("http://user:pass@example.com/", {
      timeoutMs: 2000,
      expectedStatus: 200,
      allowPrivate: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/credentials/);
  });

});
