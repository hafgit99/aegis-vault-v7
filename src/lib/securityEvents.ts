/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { secureRandomToken } from './random';

export type SecurityEventSeverity = 'info' | 'warning' | 'critical';

export const securityEventCodes = {
  storageDesktopReadFailed: 'storage.desktop.readFailed',
  storageDesktopWriteFailed: 'storage.desktop.writeFailed',
  storageLocalFallbackUsed: 'storage.localFallback.used',
  storageLegacyMigrationFailed: 'storage.legacyMigration.failed',
  storageLegacyMigrationSuccess: 'storage.legacyMigration.success',
  storageLegacyDataPurged: 'storage.legacyData.purged',
  attachmentLegacyMigrationFailed: 'attachment.legacyMigration.failed',
  networkBlocked: 'network.blocked',
  passkeyCreateFailed: 'passkey.create.failed',
  passkeyAuthenticateFailed: 'passkey.authenticate.failed',
  passkeyUnwrapFailed: 'passkey.unwrap.failed',
  unexpectedUiError: 'ui.unexpectedError',
  androidAutofillRequested: 'android.autofill.requested',
  androidAutofillCancelled: 'android.autofill.cancelled',
  androidAutofillCompleted: 'android.autofill.completed',
  androidAutofillFailed: 'android.autofill.failed',
  androidRuntimeRiskDetected: 'android.runtime.riskDetected',
  assetIntegrityFailed: 'application.assetIntegrity.failed',
  securityLegacyCryptoWarning: 'security.legacyCryptoWarning',
  cspViolation: 'security.cspViolation',
} as const;

export type SecurityEventCode = (typeof securityEventCodes)[keyof typeof securityEventCodes];

export class AegisSecurityError extends Error {
  public readonly code: SecurityEventCode;
  public readonly severity: SecurityEventSeverity;
  public readonly cause?: unknown;

  constructor(code: SecurityEventCode, message: string, severity: SecurityEventSeverity = 'warning', cause?: unknown) {
    super(message);
    this.name = 'AegisSecurityError';
    this.code = code;
    this.severity = severity;
    this.cause = cause;
  }
}

export interface BlockedNetworkEvent {
  id: string;
  timestamp: string;
  url: string;
  protocol: string;
}

type SecurityEventCallback = (event: BlockedNetworkEvent) => void;

const subscribers = new Set<SecurityEventCallback>();
let blockedEvents: BlockedNetworkEvent[] = [];
const MAX_BLOCKED_EVENTS = 30;

export function subscribeToSecurityEvents(callback: SecurityEventCallback): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

export function getBlockedNetworkEvents(): BlockedNetworkEvent[] {
  return [...blockedEvents];
}

export function clearBlockedNetworkEvents(): void {
  blockedEvents = [];
}

function redactMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;

  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => {
      if (/password|secret|token|key|hash|metadata|payload|credential|pin|cvv|totp|auth|cookie|session/i.test(key)) {
        return [key, '[redacted]'];
      }
      if (typeof value === 'string') {
        const sanitized = value
          .replace(/(bearer\s+)[a-zA-Z0-9_\-\.]+/gi, '$1[redacted]')
          .replace(/[\r\n\t]/g, ' ')
          .slice(0, 160);
        return [key, sanitized];
      }
      return [key, value];
    }),
  );
}

function sanitizeSecurityMessage(msg: string): string {
  if (typeof msg !== 'string') return '';
  return msg
    .replace(/(bearer\s+)[a-zA-Z0-9_\-\.]+/gi, '$1[redacted]')
    .replace(/(password[:=\s]+)[^\s,;]+/gi, '$1[redacted]')
    .replace(/(secret_?key[:=\s]+)[^\s,;]+/gi, '$1[redacted]')
    .replace(/(token[:=\s]+)[^\s,;]+/gi, '$1[redacted]')
    .replace(/[\r\n\t]/g, ' ')
    .slice(0, 300);
}

export function logSecurityEvent(
  code: SecurityEventCode,
  message: string,
  severity: SecurityEventSeverity = 'warning',
  meta?: Record<string, unknown>,
): void {
  const entry = {
    source: 'AegisSecurity',
    code,
    severity,
    message: sanitizeSecurityMessage(message),
    meta: redactMeta(meta),
  };

  if (severity === 'critical') {
    console.error(entry);
  } else if (severity === 'warning') {
    console.warn(entry);
  } else {
    console.info(entry);
  }

  // Handle network.blocked specifically for UI notification and historical log
  if (code === securityEventCodes.networkBlocked) {
    const rawUrl = String(meta?.url || 'unknown');
    let protocol = 'http/https';
    if (rawUrl.startsWith('ws://') || rawUrl.startsWith('wss://')) {
      protocol = 'websocket';
    } else if (rawUrl.startsWith('webrtc:')) {
      protocol = 'webrtc';
    }

    const event: BlockedNetworkEvent = {
      id: secureRandomToken(12),
      timestamp: new Date().toLocaleTimeString(),
      url: rawUrl,
      protocol,
    };

    blockedEvents = [event, ...blockedEvents].slice(0, MAX_BLOCKED_EVENTS);

    // Notify active subscribers (e.g. toast listener)
    subscribers.forEach((cb) => {
      try {
        cb(event);
      } catch (err) {
        console.error('Error in security event subscriber:', err);
      }
    });
  }
}

export function publicSecurityErrorMessage(): string {
  return 'A secure operation could not be completed. Please try again or restart Aegis Vault.';
}

