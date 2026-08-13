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
import { initializeStorage } from './lib/storage';

const UnlockedApp = React.lazy(() => import('./UnlockedApp'));

const MIN_BACKGROUND_LOCK_DELAY_MS = 60_000;
const MAX_BACKGROUND_LOCK_DELAY_MS = 15 * 60_000;

function backgroundLockDelayFromAutoLock(autoLockDurationSeconds: number): number {
  if (autoLockDurationSeconds === 0) return MAX_BACKGROUND_LOCK_DELAY_MS;
  return Math.min(
    Math.max(autoLockDurationSeconds * 1000, MIN_BACKGROUND_LOCK_DELAY_MS),
    MAX_BACKGROUND_LOCK_DELAY_MS,
  );
}

export default function App() {
  const [isStorageReady, setIsStorageReady] = useState(false);

  useEffect(() => {
    let isMounted = true;
    initializeStorage()
      .catch((err) => console.error('Storage init failed:', err))
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

  // 1. If locked, render LockScreen IMMEDIATELY (0.3s cold start).
  // Storage hydration continues in the background while user sees master password prompt.
  if (!unlocked) {
    return <LockScreen />;
  }

  // 2. While storage is still hydrating in background AND user is unlocked, show splash.
  if (!isStorageReady) {
    return <AppSplashLoader />;
  }

  // 3. When unlocked and storage is ready, render UnlockedApp lazily.
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
