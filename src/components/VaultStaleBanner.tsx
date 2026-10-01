/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useLanguage } from '../i18n/LanguageContext';

interface VaultStaleBannerProps {
  isVisible: boolean;
  onRefresh: () => void;
  onDismiss: () => void;
}

/**
 * Y-15: tells the user this tab is showing a vault that is no longer current.
 *
 * The situation is easy to get wrong from the user's side: a save they made
 * moments ago was deliberately refused because another tab already had a newer
 * version, so the screen in front of them does not match the vault on disk. The
 * notification appears once; this banner is what stays until they actually
 * reload the list, because acting on a stale list is what loses work.
 */
export function VaultStaleBanner({ isVisible, onRefresh, onDismiss }: VaultStaleBannerProps) {
  const { t } = useLanguage();

  if (!isVisible) return null;

  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-4 py-2 text-sm bg-brand-error/10 text-on-surface border-b border-brand-error/30"
    >
      <span className="flex-1 min-w-0">{t('vault.writeConflict.banner')}</span>
      <button
        type="button"
        onClick={onRefresh}
        className="shrink-0 px-3 py-1 rounded-md text-xs font-bold bg-brand-primary text-brand-on-primary hover:brightness-110"
      >
        {t('vault.writeConflict.refreshNow')}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('common.close')}
        className="shrink-0 px-2 py-1 rounded-md hover:opacity-70"
      >
        ×
      </button>
    </div>
  );
}
