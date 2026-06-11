/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type SecurityEventSeverity = 'info' | 'warning' | 'critical';

export const securityEventCodes = {
  storageDesktopReadFailed: 'storage.desktop.readFailed',
  storageDesktopWriteFailed: 'storage.desktop.writeFailed',
  storageLocalFallbackUsed: 'storage.localFallback.used',
  storageLegacyMigrationFailed: 'storage.legacyMigration.failed',
  attachmentLegacyMigrationFailed: 'attachment.legacyMigration.failed',
  networkBlocked: 'network.blocked',
  unexpectedUiError: 'ui.unexpectedError',
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

function redactMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;

  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => {
      if (/password|secret|token|key|hash|metadata|payload/i.test(key)) {
        return [key, '[redacted]'];
      }
      if (typeof value === 'string') {
        return [key, value.replace(/[\r\n\t]/g, ' ').slice(0, 160)];
      }
      return [key, value];
    }),
  );
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
    message,
    meta: redactMeta(meta),
  };

  if (severity === 'critical') {
    console.error(entry);
  } else if (severity === 'warning') {
    console.warn(entry);
  } else {
    console.info(entry);
  }
}

export function publicSecurityErrorMessage(): string {
  return 'A secure operation could not be completed. Please try again or restart Aegis Vault.';
}
