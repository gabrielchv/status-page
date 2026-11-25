import { request as httpRequest, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { lookup as dnsLookup } from "node:dns";
import {
  UnsafeUrlError,
  allowPrivateFromEnv,
  assertMonitoredUrl,
  createGuardedLookup,
} from "./url-guard";

export type CheckResult = {
  statusCode: number | null;
  latencyMs: number;
  success: boolean;
  error: string | null;
};

export type RunCheckOptions = {
  timeoutMs: number;
  expectedStatus: number;
  /**
   * Override the DNS resolver the guard wraps. Tests use this to simulate a
   * hostname answering with a private address; the guard still runs, so an
   * injected resolver cannot be used to bypass it.
   */
  resolver?: typeof dnsLookup;
  /** Permit private/loopback targets. Defaults to MONITOR_ALLOW_PRIVATE. */
  allowPrivate?: boolean;
};

/** Walk the shapes Node and happy-eyeballs use to wrap a lookup failure. */
function findUnsafeUrlError(error: unknown): UnsafeUrlError | null {
  if (error instanceof UnsafeUrlError) return error;
  if (error instanceof AggregateError) {
    for (const inner of error.errors) {
      const found = findUnsafeUrlError(inner);
      if (found) return found;
    }
    return null;
  }
  if (error instanceof Error) return findUnsafeUrlError(error.cause);
  return null;
}

/**
 * Perform a single HTTP check against a monitor's URL.
 * `success` is true when the response status equals `expectedStatus`,
 * or any 2xx status when `expectedStatus` is 0.
 *
 * Uses `node:http(s).request` rather than `fetch` for two reasons:
 *
 *  1. The `lookup` hook. It runs inside the connect path, so the address that is
 *     validated is the address that gets dialled. `fetch` resolves DNS in its own
 *     machinery, leaving a gap in which a hostname can pass a check and then
 *     resolve somewhere else (DNS rebinding).
 *  2. `res.resume()` after reading the status. `fetch` would leave the body
 *     unconsumed, which pins the socket until GC; a target that sends headers
 *     and then trickles a body leaks one connection per check. Reading to the end
 *     is what makes `timeoutMs` a real upper bound on the whole request rather
 *     than just on the headers.
 *
 * Redirects are not followed: a 3xx is reported as a normal non-matching status,
 * which is what a status page should show.
 */
export async function runCheck(url: string, opts: RunCheckOptions): Promise<CheckResult> {
  const started = Date.now();
  const allowPrivate = opts.allowPrivate ?? allowPrivateFromEnv();

  let target: URL;
  try {
    target = assertMonitoredUrl(url, { allowPrivate });
  } catch (error) {
    return {
      statusCode: null,
      latencyMs: Date.now() - started,
      success: false,
      error: error instanceof Error ? error.message : "unsafe url",
    };
  }

  // Always wrap the resolver. There is deliberately no option to supply a
  // ready-made lookup: an injectable hook that replaced the guard would be one
  // mistyped call away from disabling SSRF protection in production.
  const lookup = createGuardedLookup({ allowPrivate }, opts.resolver ?? dnsLookup);

  return new Promise<CheckResult>((resolve) => {
    let settled = false;
    const finish = (result: CheckResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const fail = (error: unknown): void => {
      const unsafe = findUnsafeUrlError(error);
      finish({
        statusCode: null,
        latencyMs: Date.now() - started,
        success: false,
        error: unsafe?.message ?? (error instanceof Error ? error.message : "request failed"),
      });
    };

    const requestOptions: RequestOptions = {
      protocol: target.protocol,
      hostname: target.hostname.replace(/^\[|\]$/g, ""),
      port: target.port === "" ? undefined : Number(target.port),
      path: `${target.pathname}${target.search}`,
      method: "GET",
      headers: { "user-agent": "status-page/1.0 (+uptime-checker)" },
      lookup: lookup as unknown as RequestOptions["lookup"],
      timeout: opts.timeoutMs,
    };

    const send = target.protocol === "https:" ? httpsRequest : httpRequest;

    let outgoing;
    try {
      outgoing = send(requestOptions, (response) => {
        const statusCode = response.statusCode ?? null;
        const success =
          opts.expectedStatus > 0
            ? statusCode === opts.expectedStatus
            : statusCode !== null && statusCode >= 200 && statusCode < 300;

        // Drain the body so the socket is released and the timeout keeps
        // covering the transfer, not just the headers. The status is already
        // known, so the body itself is discarded.
        response.resume();
        response.on("end", () => {
          finish({
            statusCode,
            latencyMs: Date.now() - started,
            success,
            error: null,
          });
        });
        // A truncated body still means we saw the status; report it rather than
        // hanging until the timeout fires.
        response.on("error", () => {
          finish({
            statusCode,
            latencyMs: Date.now() - started,
            success,
            error: null,
          });
        });
      });
    } catch (error) {
      fail(error);
      return;
    }

    outgoing.on("timeout", () => {
      outgoing.destroy(new Error("timeout"));
    });
    outgoing.on("error", (error) => {
      if ((error as Error).message === "timeout") {
        finish({
          statusCode: null,
          latencyMs: Date.now() - started,
          success: false,
          error: "timeout",
        });
        return;
      }
      fail(error);
    });

    outgoing.end();
  });
}
