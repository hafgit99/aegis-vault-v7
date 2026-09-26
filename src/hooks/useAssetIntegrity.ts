import { useEffect, useRef, useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import { verifyRuntimeAssetIntegrity } from '../lib/assetIntegrity';
import { logSecurityEvent, securityEventCodes } from '../lib/securityEvents';
import type { AppNotification } from '../types';

interface UseAssetIntegrityOptions {
  unlocked: boolean;
  onNotify: (notification: AppNotification) => void;
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
        if (!active || result.status !== 'failed') return;
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