import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AegisSecurityError,
  logSecurityEvent,
  publicSecurityErrorMessage,
  securityEventCodes,
} from './securityEvents';

describe('security event taxonomy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates structured security errors with stable codes and severity', () => {
    const cause = new Error('disk failure');
    const error = new AegisSecurityError(
      securityEventCodes.storageDesktopReadFailed,
      'Could not read desktop vault payload.',
      'critical',
      cause,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AegisSecurityError');
    expect(error.code).toBe(securityEventCodes.storageDesktopReadFailed);
    expect(error.severity).toBe('critical');
    expect(error.cause).toBe(cause);
    expect(error.message).toBe('Could not read desktop vault payload.');
  });

  it('uses warning severity by default for structured security errors', () => {
    const error = new AegisSecurityError(securityEventCodes.networkBlocked, 'Blocked outbound request.');

    expect(error.severity).toBe('warning');
  });

  it('redacts sensitive metadata and normalizes control characters before warning logs', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    logSecurityEvent(securityEventCodes.storageLocalFallbackUsed, 'Loaded fallback mirror.', 'warning', {
      password: 'plain-text',
      secretKey: 'A3-SECRET',
      apiToken: 'token-value',
      payload: { raw: true },
      username: 'alice\nadmin\troot',
      fileName: 'vault.json',
      retryCount: 2,
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toEqual({
      source: 'AegisSecurity',
      code: securityEventCodes.storageLocalFallbackUsed,
      severity: 'warning',
      message: 'Loaded fallback mirror.',
      meta: {
        password: '[redacted]',
        secretKey: '[redacted]',
        apiToken: '[redacted]',
        payload: '[redacted]',
        username: 'alice admin root',
        fileName: 'vault.json',
        retryCount: 2,
      },
    });
  });

  it('truncates long string metadata before it reaches logs', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const longValue = 'x'.repeat(220);

    logSecurityEvent(securityEventCodes.androidAutofillRequested, 'Autofill requested.', 'info', {
      packageName: longValue,
    });

    const entry = infoSpy.mock.calls[0]![0] as { meta: { packageName: string } };
    expect(entry.meta.packageName).toHaveLength(160);
    expect(entry.meta.packageName).toBe('x'.repeat(160));
  });

  it('routes critical, warning, and info events to the matching console channel', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    logSecurityEvent(securityEventCodes.storageDesktopWriteFailed, 'Write failed.', 'critical');
    logSecurityEvent(securityEventCodes.networkBlocked, 'Network blocked.', 'warning');
    logSecurityEvent(securityEventCodes.androidAutofillCompleted, 'Autofill completed.', 'info');

    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'critical' }));
    expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warning' }));
    expect(infoSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'info' }));
  });

  it('omits metadata when none is provided and exposes a generic public error message', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    logSecurityEvent(securityEventCodes.unexpectedUiError, 'Unexpected UI failure.');

    expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({ meta: undefined }));
    expect(publicSecurityErrorMessage()).toBe(
      'A secure operation could not be completed. Please try again or restart Aegis Vault.',
    );
  });

  it('supports cspViolation security event code', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    logSecurityEvent(
      securityEventCodes.cspViolation,
      'CSP violation: script-src blocked eval',
      'warning',
      { violatedDirective: 'script-src', blockedURI: 'eval' },
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        code: securityEventCodes.cspViolation,
        severity: 'warning',
      }),
    );
  });
});
