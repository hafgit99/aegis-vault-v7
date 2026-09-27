import { useEffect } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import { consumeVaultFallbackMirrorStale } from '../lib/sqliteOpfsPersistence';
import type { AppNotification } from '../types';

interface UseVaultFallbackMirrorStaleAlertProps {
  unlocked: boolean;
  onNotify: (notification: AppNotification) => void;
}

/**
 * O-2: surfaces a stale localStorage vault mirror to the user.
 *
 * Follows the same one-shot pattern as `useVaultRollbackAlert`, deliberately. A
 * backup that is silently out of date is the failure mode here: the mirror is
 * still the only copy when the authoritative store is genuinely gone, so it is
 * still used, but a user who restores from it deserves to know it predates
 * their last save rather than finding out later.
 *
 * The flag is consumed once per occurrence so the warning does not reappear on
 * every render.
 */
export function useVaultFallbackMirrorStaleAlert({
  unlocked,
  onNotify,
}: UseVaultFallbackMirrorStaleAlertProps) {
  const { t } = useLanguage();

  useEffect(() => {
    if (!unlocked) return;
    if (!consumeVaultFallbackMirrorStale()) return;

    onNotify({
      title: t('vault.mirrorStale.title'),
      message: t('vault.mirrorStale.desc'),
      type: 'danger',
    });
  }, [unlocked, onNotify, t]);
}
