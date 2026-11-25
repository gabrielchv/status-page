/**
 * Outbound-request guard for monitor targets.
 *
 * A status monitor takes a URL from a user and makes the server fetch it. That
 * is a server-side request forgery primitive: the same request can reach the
 * metadata service (`169.254.169.254`), the Postgres instance, or any other
 * service sharing the network namespace. Registration is open, so "the user is
 * authenticated" is not a mitigation.
 *
 * The guard has two halves for the same reason hookrelay's does:
 *
 *  1. `assertMonitoredUrl` — a static check of the URL: scheme, embedded
 *     credentials, blocked hostnames and IP literals. No DNS, so it is cheap
 *     enough to run on every write and every check.
 *  2. `createGuardedLookup` — a `lookup` replacement handed to
 *     `http(s).request`. Node calls it inside the connect path, immediately
 *     before opening the socket, and dials the address it returns. Validating
 *     that answer is what closes the rebinding window: there is no gap between
 *     the check and the connect.
 *
 * `MONITOR_ALLOW_PRIVATE` exists for local development, where a monitor is
 * expected to point at `localhost:3000`. It is opt-in and never the default.
 */
import { isIP } from "node:net";
import { lookup as dnsLookup, type LookupOptions } from "node:dns";

export type UnsafeUrlCode =
  | "invalid_url"
  | "blocked_scheme"
  | "url_has_credentials"
  | "blocked_hostname"
  | "blocked_address"
  | "blocked_resolution";

/** A URL that must not be dialled. Carries a stable code for callers to branch on. */
export class UnsafeUrlError extends Error {
  constructor(
    message: string,
    readonly code: UnsafeUrlCode,
  ) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export interface UrlGuardOptions {
  /** Permit loopback/private/link-local targets. Off unless explicitly set. */
  allowPrivate?: boolean;
}

// ---------------------------------------------------------------- addresses

function parseIPv4(input: string): number[] | null {
  const parts = input.split(".");
  if (parts.length !== 4) return null;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    bytes.push(value);
  }
  return bytes;
}

function parseIPv6(input: string): number[] | null {
  let text = input.trim();
  if (text.startsWith("[") && text.endsWith("]")) text = text.slice(1, -1);
  const zone = text.indexOf("%");
  if (zone !== -1) text = text.slice(0, zone);
  if (!text.includes(":")) return null;

  const halves = text.split("::");
  if (halves.length > 2) return null;

  // A colon-separated token is two bytes; an embedded dotted quad is four.
  const tokenBytes = (token: string): number[] | null => {
    if (token.includes(".")) {
      const v4 = parseIPv4(token);
      if (!v4) return null;
      return v4;
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(token)) return null;
    const value = Number.parseInt(token, 16);
    return [value >> 8, value & 0xff];
  };

  const collect = (side: string): number[] | null => {
    if (side === "") return [];
    const bytes: number[] = [];
    for (const token of side.split(":")) {
      const parsed = tokenBytes(token);
      if (!parsed) return null;
      bytes.push(...parsed);
    }
    return bytes;
  };

  const head = collect(halves[0]);
  const tail = halves.length === 2 ? collect(halves[1]) : [];
  if (!head || !tail) return null;

  if (halves.length === 2) {
    const zeros = 16 - head.length - tail.length;
    if (zeros < 0) return null;
    return [...head, ...new Array<number>(zeros).fill(0), ...tail];
  }

  return head.length === 16 ? head : null;
}

function inRange(bytes: number[], network: number[], prefix: number): boolean {
  let remaining = prefix;
  for (let index = 0; index < bytes.length && remaining > 0; index += 1) {
    const bits = Math.min(8, remaining);
    const mask = (0xff << (8 - bits)) & 0xff;
    if ((bytes[index] & mask) !== (network[index] & mask)) return false;
    remaining -= bits;
  }
  return true;
}

const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this host"
  ["10.0.0.0", 8], // RFC 1918
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. 169.254.169.254 metadata
  ["172.16.0.0", 12], // RFC 1918
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16], // RFC 1918
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, incl. 255.255.255.255
];

const BLOCKED_V6: Array<[string, number]> = [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["100::", 64], // discard-only
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
];

function isBlockedV4(bytes: number[]): boolean {
  return BLOCKED_V4.some(([network, prefix]) => inRange(bytes, parseIPv4(network)!, prefix));
}

function isBlockedV6(bytes: number[]): boolean {
  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d) reach an IPv4
  // host, so they inherit the IPv4 rules rather than escaping them.
  const mapped =
    bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  if (mapped) return isBlockedV4(bytes.slice(12));

  if (inRange(bytes, parseIPv6("64:ff9b::")!, 96)) return isBlockedV4(bytes.slice(12));

  // 6to4 carries the IPv4 destination in bytes 2..5.
  if (inRange(bytes, parseIPv6("2002::")!, 16)) return isBlockedV4(bytes.slice(2, 6));

  return BLOCKED_V6.some(([network, prefix]) => inRange(bytes, parseIPv6(network)!, prefix));
}

/**
 * True when `address` is an IP literal that must not be dialled. Hostnames are
 * handled by the guarded lookup; an unparseable string is not a routable
 * address, so it is left to the socket layer to reject.
 */
export function isBlockedAddress(address: string): boolean {
  const v4 = parseIPv4(address);
  if (v4) return isBlockedV4(v4);
  const v6 = parseIPv6(address);
  if (v6) return isBlockedV6(v6);
  return false;
}

// --------------------------------------------------------------------- URLs

/** Hostnames that never need a DNS answer to be known-bad. */
const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "metadata.google.internal"]);

function bareHostname(url: URL): string {
  let host = url.hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  // A single trailing dot is a legal fully-qualified form: `localhost.` means
  // the same host as `localhost`.
  return host.endsWith(".") ? host.slice(0, -1) : host;
}

/** Reads the opt-in flag once per process. */
export function allowPrivateFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.MONITOR_ALLOW_PRIVATE?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

/**
 * Static validation of a monitor target. Throws `UnsafeUrlError` when the URL
 * can never be a legitimate endpoint. Deliberately does no DNS: a hostname that
 * looks fine here is still checked again at connect time.
 */
export function assertMonitoredUrl(raw: string, options: UrlGuardOptions = {}): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("url must be an absolute http(s) URL", "invalid_url");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("url must use http or https", "blocked_scheme");
  }

  // `http://user:pass@host/` leaks credentials into logs and into the request,
  // and is a common way to disguise the real host (`http://good.example@evil`).
  if (url.username !== "" || url.password !== "") {
    throw new UnsafeUrlError("url must not embed credentials", "url_has_credentials");
  }

  if (options.allowPrivate) return url;

  const host = bareHostname(url);
  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new UnsafeUrlError(
      `host "${host}" is internal; monitoring internal addresses is disabled`,
      "blocked_hostname",
    );
  }

  if (isIP(host) !== 0 && isBlockedAddress(host)) {
    throw new UnsafeUrlError(
      `host ${host} is in a private or reserved range`,
      "blocked_address",
    );
  }

  return url;
}

// ------------------------------------------------------------------- lookup

export interface ResolvedAddress {
  address: string;
  family: number;
}

export type ResolveCallback = (
  error: NodeJS.ErrnoException | null,
  address?: string | ResolvedAddress[],
  family?: number,
) => void;

export type GuardedLookup = (
  hostname: string,
  options: LookupOptions,
  callback: ResolveCallback,
) => void;

type Resolver = typeof dnsLookup;

/**
 * Wraps `dns.lookup` so the address Node is about to connect to is validated at
 * the moment it is returned, not earlier. Pass the result straight into
 * `http.request({ lookup })`.
 *
 * `resolver` is injectable so tests can simulate rebinding without a DNS server.
 */
export function createGuardedLookup(
  options: UrlGuardOptions = {},
  resolver: Resolver = dnsLookup,
): GuardedLookup {
  return (hostname, lookupOptions, callback) => {
    resolver(hostname, lookupOptions, (error, address, family) => {
      if (error) {
        callback(error);
        return;
      }

      if (options.allowPrivate) {
        callback(null, address, family);
        return;
      }

      const resolved: ResolvedAddress[] = Array.isArray(address)
        ? address
        : [{ address: address ?? "", family: family ?? 0 }];

      for (const entry of resolved) {
        if (isBlockedAddress(entry.address)) {
          callback(
            new UnsafeUrlError(
              `host "${hostname}" resolved to ${entry.address}, which is in a private or reserved range`,
              "blocked_resolution",
            ),
          );
          return;
        }
      }

      callback(null, address, family);
    });
  };
}
