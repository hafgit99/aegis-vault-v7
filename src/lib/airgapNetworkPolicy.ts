/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { KalderaShieldSecurityError, logSecurityEvent, securityEventCodes } from './securityEvents';

const HIBP_RANGE_ORIGIN = 'https://api.pwnedpasswords.com';
const HIBP_RANGE_PATH_PATTERN = /^\/range\/[0-9A-Fa-f]{5}$/;

/**
 * Runtime-managed set of HTTPS origins approved for E2EE sync providers.
 * Origins are added when a user configures WebDAV (or similar) and removed
 * when they disable sync. Only HTTPS origins are ever stored here.
 */
const syncAllowedOrigins = new Set<string>();

export function isPrivateOrLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1') return true;
  if (normalized.startsWith('192.168.') || normalized.startsWith('10.')) return true;

  const octets = normalized.split('.').map((part) => Number(part));
  const first = octets[0];
  const second = octets[1];
  return octets.length === 4
    && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    && first === 172
    && second !== undefined
    && second >= 16
    && second <= 31;
}

/**
 * Register a sync provider origin in the air-gap whitelist.
 * Only HTTPS origins (or localhost / LAN) are accepted.
 */
export function addSyncAllowedOrigin(origin: string): void {
  try {
    const parsed = new URL(origin);
    const isLocal = isPrivateOrLoopbackHostname(parsed.hostname);
    if (parsed.protocol !== 'https:' && !isLocal) {
      console.warn('[KalderaShieldAirGap] Refused to whitelist non-HTTPS sync origin:', origin);
      return;
    }
    syncAllowedOrigins.add(parsed.origin);
  } catch {
    console.warn('[KalderaShieldAirGap] Invalid sync origin, not whitelisted:', origin);
  }
}

/** Remove a previously registered sync provider origin from the whitelist. */
export function removeSyncAllowedOrigin(origin: string): void {
  try {
    syncAllowedOrigins.delete(new URL(origin).origin);
  } catch { /* ignore */ }
}

/**
 * O-21: how many live leases each whitelisted origin has.
 *
 * `syncAllowedOrigins` is a `Set`, so a bare add/remove cannot tell "this origin
 * is still in use" from "this origin was added and never taken back out". The
 * concrete leak: `handleSyncTest` constructs a provider — which whitelists its
 * origin — and never called `dispose()`. Every click therefore added a permanent
 * network exemption, and removing the sync configuration did not revoke it. A
 * user could "test" twenty servers and keep twenty origins able to reach the
 * network for the rest of the session.
 *
 * Reference counting makes the lifecycle explicit: a lease is taken when a
 * provider is constructed and released by `dispose()`, and the origin leaves the
 * whitelist only when the last lease is gone.
 */
const syncOriginLeases = new Map<string, number>();

/**
 * Registers a lease for `origin`, whitelisting it on the first one.
 *
 * @returns a release function that is safe to call more than once.
 */
export function acquireSyncOriginLease(origin: string): () => void {
  let key: string;
  try {
    key = new URL(origin).origin;
  } catch {
    // A malformed origin is never whitelisted, so there is nothing to release.
    return () => undefined;
  }

  const held = (syncOriginLeases.get(key) ?? 0) + 1;
  syncOriginLeases.set(key, held);
  // Whitelist unconditionally: `addSyncAllowedOrigin` re-validates the scheme,
  // and the Set is idempotent.
  addSyncAllowedOrigin(key);

  let released = false;
  return () => {
    // Idempotent: a double dispose must not decrement someone else's lease.
    if (released) return;
    released = true;

    const remaining = (syncOriginLeases.get(key) ?? 1) - 1;
    if (remaining > 0) {
      syncOriginLeases.set(key, remaining);
      return;
    }
    syncOriginLeases.delete(key);
    removeSyncAllowedOrigin(key);
  };
}

/** Number of live leases for `origin`. Exposed for tests and diagnostics. */
export function getSyncOriginLeaseCount(origin: string): number {
  try {
    return syncOriginLeases.get(new URL(origin).origin) ?? 0;
  } catch {
    return 0;
  }
}

/** Total number of origins currently holding a lease. Exposed for diagnostics. */
export function getLeasedSyncOriginCount(): number {
  return syncOriginLeases.size;
}

/** Returns a read-only snapshot of currently whitelisted sync origins (for diagnostics). */
export function getSyncAllowedOrigins(): ReadonlySet<string> {
  return syncAllowedOrigins;
}

let installed = false;

function resolveUrl(input: string | URL): URL | null {
  try {
    return new URL(String(input), typeof location !== 'undefined' ? location.href : undefined);
  } catch {
    return null;
  }
}

export function isNetworkUrlAllowed(input: string | URL): boolean {
  const url = resolveUrl(input);
  if (!url) return false;

  if (['data:', 'blob:', 'file:', 'tauri:', 'ipc:'].includes(url.protocol)) return true;
  if (url.hostname === 'ipc.localhost' || url.hostname === 'tauri.localhost') return true;
  if (typeof location !== 'undefined' && url.origin === location.origin) return true;

  if (url.origin === HIBP_RANGE_ORIGIN && HIBP_RANGE_PATH_PATTERN.test(url.pathname) && url.search === '') return true;

  // E2EE sync provider origins, user-approved at configuration time
  if (syncAllowedOrigins.has(url.origin)) return true;

  return false;
}

export function assertNetworkUrlAllowed(input: string | URL): void {
  if (isNetworkUrlAllowed(input)) return;

  const normalized = resolveUrl(input)?.origin || String(input).slice(0, 120);
  logSecurityEvent(
    securityEventCodes.networkBlocked,
    'Blocked outbound network request by air-gap policy.',
    'critical',
    { url: normalized },
  );
  throw new KalderaShieldSecurityError(
    securityEventCodes.networkBlocked,
    'Outbound network access is blocked by KalderaShield air-gap policy.',
    'critical',
  );
}

export function installAirgapNetworkPolicy(): void {
  if (installed || typeof globalThis === 'undefined') return;
  installed = true;

  const nativeFetch = globalThis.fetch?.bind(globalThis);
  if (nativeFetch) {
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input;
      assertNetworkUrlAllowed(url);
      return nativeFetch(input, init);
    }) as typeof fetch;
  }

  if (typeof XMLHttpRequest !== 'undefined') {
    const nativeOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function guardedOpen(
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null,
    ) {
      assertNetworkUrlAllowed(url);
      return nativeOpen.call(this, method, url, async ?? true, username ?? null, password ?? null);
    };
  }

  if (typeof WebSocket !== 'undefined') {
    const NativeWebSocket = WebSocket;
    const GuardedWebSocket = function guardedWebSocket(
      this: WebSocket,
      url: string | URL,
      protocols?: string | string[],
    ) {
      assertNetworkUrlAllowed(url);
      return new NativeWebSocket(url, protocols);
    } as unknown as typeof WebSocket;

    GuardedWebSocket.prototype = NativeWebSocket.prototype;
    Object.assign(GuardedWebSocket, NativeWebSocket);
    globalThis.WebSocket = GuardedWebSocket;
  }

  const navigatorWithBeacon = globalThis.navigator as Navigator & {
    sendBeacon?: (url: string | URL, data?: BodyInit | null) => boolean;
  };
  const nativeSendBeacon = navigatorWithBeacon?.sendBeacon?.bind(navigatorWithBeacon);
  if (nativeSendBeacon) {
    navigatorWithBeacon.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
      assertNetworkUrlAllowed(url);
      return nativeSendBeacon(url, data);
    };
  }

  if (typeof EventSource !== 'undefined') {
    const NativeEventSource = EventSource;
    const GuardedEventSource = function guardedEventSource(
      this: EventSource,
      url: string | URL,
      eventSourceInitDict?: EventSourceInit,
    ) {
      assertNetworkUrlAllowed(url);
      return new NativeEventSource(url, eventSourceInitDict);
    } as unknown as typeof EventSource;

    GuardedEventSource.prototype = NativeEventSource.prototype;
    Object.assign(GuardedEventSource, NativeEventSource);
    globalThis.EventSource = GuardedEventSource;
  }

  if (typeof RTCPeerConnection !== 'undefined') {
    const GuardedRTCPeerConnection = function guardedRTCPeerConnection() {
      logSecurityEvent(
        securityEventCodes.networkBlocked,
        'Blocked WebRTC connection by air-gap policy.',
        'critical',
        { url: 'webrtc:' },
      );
      throw new KalderaShieldSecurityError(
        securityEventCodes.networkBlocked,
        'WebRTC is blocked by KalderaShield air-gap policy.',
        'critical',
      );
    } as unknown as typeof RTCPeerConnection;

    globalThis.RTCPeerConnection = GuardedRTCPeerConnection;
  }
}
