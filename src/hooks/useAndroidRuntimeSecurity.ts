import { useEffect, useRef } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import { getAndroidRuntimeSecurityPosture } from '../lib/androidRuntimeSecurity';
import { logSecurityEvent, securityEventCodes } from '../lib/securityEvents';
import type { AppNotification } from '../types';

interface UseAndroidRuntimeSecurityOptions {
  unlocked: boolean;
  onNotify: (notification: AppNotification) => void;
}

export function useAndroidRuntimeSecurity({ unlocked, onNotify }: UseAndroidRuntimeSecurityOptions): void {
  const { t } = useLanguage();
  const warningShown = useRef(false);

  useEffect(() => {
    if (!unlocked || warningShown.current) return;

    const posture = getAndroidRuntimeSecurityPosture();
    if (!posture?.riskDetected) return;

    warningShown.current = true;
    logSecurityEvent(
      securityEventCodes.androidRuntimeRiskDetected,
      'Android runtime integrity signals were detected.',
      'warning',
      { signals: posture.signals.join(',') },
    );
    onNotify({
      title: t('security.androidRiskTitle'),
      message: t('security.androidRiskMessage'),
      type: 'warning',
    });
  }, [onNotify, t, unlocked]);
}