/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import LockScreen from './components/LockScreen';
import { useAutoLockDuration } from './hooks/useAutoLockDuration';
import { useVaultLock } from './hooks/useVaultLock';
import { useSensitiveReveal } from './hooks/useSensitiveReveal';
import { useClipboardFeedback } from './hooks/useClipboardFeedback';
import { AppSplashLoader } from './components/AppSplashLoader';
import { useLanguage } from './i18n/LanguageContext';
import { initializeStorage, isVaultStorageUnavailableError } from './lib/storage';

const UnlockedApp = React.lazy(() => import('./UnlockedApp'));

const MAX_BACKGROUND_LOCK_DELAY_MS = 15 * 60_000;

// Y-6: honour the user's configured auto-lock duration for background locks
// — the old 60 s floor silently gave 15/30 s users a minute of open vault.
function backgroundLockDelayFromAutoLock(autoLockDurationSeconds: number): number {
  if (autoLockDurationSeconds === 0) return MAX_BACKGROUND_LOCK_DELAY_MS;
  return Math.min(autoLockDurationSeconds * 1000, MAX_BACKGROUND_LOCK_DELAY_MS);
}

export default function App() {
  const [isStorageReady, setIsStorageReady] = useState(false);
  /**
   * Y-13: a persisted wa-sqlite vault exists but could not be opened on this
   * attempt. The promotion marker is deliberately preserved, so the vault is
   * intact and a retry can reach it.
   *
   * This must be surfaced. Falling through to the normal lock screen would put
   * the user in front of a password field that cannot succeed, and would read
   * as "wrong password" for a storage problem.
   */
  const [isVaultStorageUnavailable, setIsVaultStorageUnavailable] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    let isMounted = true;
    initializeStorage()
      .catch((err) => {
        if (isVaultStorageUnavailableError(err)) {
          if (isMounted) setIsVaultStorageUnavailable(true);
          return;
        }
        console.error('Storage init failed:', err);
      })
      .finally(() => {
        if (isMounted) {
          setIsStorageReady(true);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const { clearCopiedField } = useClipboardFeedback();
  const { resetReveals } = useSensitiveReveal();

  const {
    autoLockDuration,
    changeAutoLockDuration: handleAutoLockDurationChange,
  } = useAutoLockDuration();

  const {
    unlocked,
    lock: handleLock,
  } = useVaultLock({
    autoLockDuration,
    resetReveals,
    clearCopiedField,
  });

  // 1. Y-13: the vault exists but storage is temporarily unavailable. Show a
  // dedicated retry screen — never a password prompt that cannot succeed, and
  // never a path that would set up a new vault over this one.
  if (isVaultStorageUnavailable) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-lg font-semibold">{t('lock.error.vaultStorageUnavailableTitle')}</h1>
          <p className="text-sm text-slate-300">{t('lock.error.vaultStorageUnavailable')}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium"
          >
            {t('lock.error.vaultStorageRetry')}
          </button>
        </div>
      </div>
    );
  }

  // 2. If locked, render LockScreen IMMEDIATELY (0.3s cold start).
  // Storage hydration continues in the background while user sees master password prompt.
  if (!unlocked) {
    return <LockScreen />;
  }

  // 3. While storage is still hydrating in background AND user is unlocked, show splash.
  if (!isStorageReady) {
    return <AppSplashLoader />;
  }

  // 4. When unlocked and storage is ready, render UnlockedApp lazily.
  return (
    <React.Suspense fallback={<AppSplashLoader />}>
      <UnlockedApp
        unlocked={unlocked}
        autoLockDuration={autoLockDuration}
        handleLock={handleLock}
        handleAutoLockDurationChange={handleAutoLockDurationChange}
        backgroundLockDelayMs={backgroundLockDelayFromAutoLock(autoLockDuration)}
      />
    </React.Suspense>
  );
}
