import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

import { useLanguage } from '../i18n/LanguageContext';
import { verifyRuntimeAssetIntegrity, type AssetIntegrityResult } from '../lib/assetIntegrity';
import { logSecurityEvent, securityEventCodes } from '../lib/securityEvents';
import type { AppNotification } from '../types';

interface UseAssetIntegrityOptions {
  unlocked: boolean;
  onNotify: (notification: AppNotification) => void;
}

/**
 * Mirrors the verdict into the native app-data directory.
 *
 * The check is fail-closed and only reports a `reason` through the console, and
 * a release build has no devtools — so the one string that says *which* check
 * failed is otherwise unreachable. A user reporting an integrity warning could
 * not tell us anything actionable. Writing it next to the other diagnostics is
 * what makes a support report answerable.
 *
 * Best-effort: a diagnostic that cannot be written must not turn a skipped or
 * failed verdict into something worse.
 */
async function recordIntegrityOutcome(result: AssetIntegrityResult): Promise<void> {
  // `verified` carries an asset count rather than a reason, and it is the one
  // outcome worth not recording: the file exists so a *failure* can be
  // explained, and writing a success every time would leave a stale "verified"
  // that a later failed run is the only thing that can overwrite.
  if (result.status === 'verified') return;
  try {
    await invoke('record_asset_integrity_result', { reason: result.reason });
  } catch {
    // Nothing to do. The verdict is already reported through the notification
    // and the security event log.
  }
}

export function useAssetIntegrity({ unlocked, onNotify }: UseAssetIntegrityOptions): { failureReason: string | null } {
  const { t } = useLanguage();
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const warningShown = useRef(false);

  useEffect(() => {
    let active = true;
    // O-33: verification itself must be fail-closed. A rejected promise
    // (unexpected exception, unavailable API) is treated as an integrity
    // failure — never as an invisible "pass".
    void verifyRuntimeAssetIntegrity()
      .then((result) => {
        if (!active) return;
        void recordIntegrityOutcome(result);
        if (result.status !== 'failed') return;
        logSecurityEvent(
          securityEventCodes.assetIntegrityFailed,
          'Application asset integrity verification failed.',
          'critical',
          { reason: result.reason },
        );
        setFailureReason(result.reason);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const reason = err instanceof Error ? err.message : 'asset-integrity-unverifiable';
        logSecurityEvent(
          securityEventCodes.assetIntegrityFailed,
          'Application asset integrity verification could not be completed (fail-closed).',
          'critical',
          { reason },
        );
        void recordIntegrityOutcome({ status: 'failed', reason });
        setFailureReason(reason);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!unlocked || !failureReason || warningShown.current) return;
    warningShown.current = true;
    onNotify({
      title: t('security.assetIntegrityTitle'),
      message: t('security.assetIntegrityMessage'),
      type: 'danger',
    });
  }, [failureReason, onNotify, t, unlocked]);

  return { failureReason };
}