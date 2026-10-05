export type CheckResult = {
  statusCode: number | null;
  latencyMs: number;
  success: boolean;
  error: string | null;
};

/**
 * Perform a single HTTP check against a monitor's URL.
 * `success` is true when the response status equals `expectedStatus`,
 * or any 2xx status when `expectedStatus` is 0.
 */
export async function runCheck(
  url: string,
  opts: { timeoutMs: number; expectedStatus: number },
): Promise<CheckResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { "user-agent": "status-page/1.0 (+uptime-checker)" },
    });

    const statusCode = res.status;
    const success =
      opts.expectedStatus > 0
        ? statusCode === opts.expectedStatus
        : statusCode >= 200 && statusCode < 300;

    return {
      statusCode,
      latencyMs: Date.now() - started,
      success,
      error: null,
    };
  } catch (err) {
    const isTimeout =
      err instanceof DOMException && err.name === "AbortError";
    return {
      statusCode: null,
      latencyMs: Date.now() - started,
      success: false,
      error: isTimeout ? "timeout" : err instanceof Error ? err.message : "request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}
