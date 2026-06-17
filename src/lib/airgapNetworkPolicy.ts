/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AegisSecurityError, logSecurityEvent, securityEventCodes } from './securityEvents';

const HIBP_RANGE_ORIGIN = 'https://api.pwnedpasswords.com';
const HIBP_RANGE_PATH_PREFIX = '/range/';

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

  return url.origin === HIBP_RANGE_ORIGIN && url.pathname.startsWith(HIBP_RANGE_PATH_PREFIX);
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
}
