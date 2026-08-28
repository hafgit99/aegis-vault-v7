import { useEffect } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import { consumeVaultRollbackDetected } from '../lib/sqliteOpfsPersistence';
import type { AppNotification } from '../types';

interface UseVaultRollbackAlertProps {
  unlocked: boolean;
  onNotify: (notification: AppNotification) => void;
}

/**
 * N-1: surfaces a vault database rollback (an older snapshot replacing newer
 * data) to the user as a danger notification instead of only logging it.
 * The detection flag is consumed once per occurrence.
 */
export function useVaultRollbackAlert({ unlocked, onNotify }: UseVaultRollbackAlertProps) {
  const { t } = useLanguage();

  useEffect(() => {
    if (!unlocked) return;
    if (!consumeVaultRollbackDetected()) return;

    onNotify({
      title: t('vault.rollback.title'),
      message: t('vault.rollback.desc'),
      type: 'danger',
    });
  }, [unlocked, onNotify, t]);
}
