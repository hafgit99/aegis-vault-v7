/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AegisSecurityError, logSecurityEvent, securityEventCodes } from './securityEvents';

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
  return octets.length === 4
    && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    && octets[0] === 172
    && octets[1] >= 16
    && octets[1] <= 31;
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
      console.warn('[AegisAirGap] Refused to whitelist non-HTTPS sync origin:', origin);
      return;
    }
    syncAllowedOrigins.add(parsed.origin);
  } catch {
    console.warn('[AegisAirGap] Invalid sync origin, not whitelisted:', origin);
  }
}

/** Remove a previously registered sync provider origin from the whitelist. */
export function removeSyncAllowedOrigin(origin: string): void {
  try {
    syncAllowedOrigins.delete(new URL(origin).origin);
  } catch { /* ignore */ }
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
  throw new AegisSecurityError(
    securityEventCodes.networkBlocked,
    'Outbound network access is blocked by Aegis Vault air-gap policy.',
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
      throw new AegisSecurityError(
        securityEventCodes.networkBlocked,
        'WebRTC is blocked by Aegis Vault air-gap policy.',
        'critical',
      );
    } as unknown as typeof RTCPeerConnection;

    globalThis.RTCPeerConnection = GuardedRTCPeerConnection;
  }
}
