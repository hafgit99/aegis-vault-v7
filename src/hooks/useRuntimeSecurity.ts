import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';

import { enableNativeScreenCaptureProtection } from '../lib/nativeSecurity';

interface UseRuntimeSecurityOptions {
  unlocked: boolean;
  onLock: () => void;
  onSensitiveStateClear: () => void;
  backgroundLockDelayMs?: number;
  isAutofillMode?: boolean;
}

export function useRuntimeSecurity({
  unlocked,
  onLock,
  onSensitiveStateClear,
  backgroundLockDelayMs = 15_000,
  isAutofillMode = false,
}: UseRuntimeSecurityOptions) {
  const [privacyShieldVisible, setPrivacyShieldVisible] = useState(false);
  const [screenRecordingDetected, setScreenRecordingDetected] = useState(false);

  // Y-23: keep the latest callbacks in refs so the native listener and the
  // visibility/lock-timer effects bind ONCE. Unstable callback identities
  // (UnlockedApp re-renders at 1 Hz) used to re-run these effects every
  // render, leaking Tauri listeners and cancelling pending background locks.
  const onLockRef = useRef(onLock);
  const onSensitiveStateClearRef = useRef(onSensitiveStateClear);
  useEffect(() => {
    onLockRef.current = onLock;
    onSensitiveStateClearRef.current = onSensitiveStateClear;
  });

  useEffect(() => {
    void enableNativeScreenCaptureProtection();
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlistenFn: (() => void) | null = null;

    if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
      listen<boolean>('screen-capture-status-changed', (event) => {
        const isRecording = event.payload;
        setScreenRecordingDetected(isRecording);
        if (isRecording) {
          onSensitiveStateClearRef.current();
          onLockRef.current();
        }
      }).then((unlisten) => {
        // Y-23: the IPC round-trip resolves after cleanup on fast unmounts —
        // unlisten immediately instead of dropping it into a dead ref.
        if (disposed) unlisten();
        else unlistenFn = unlisten;
      }).catch(err => {
        console.error('Failed to listen to screen-capture-status-changed:', err);
      });
    }

    return () => {
      disposed = true;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  useEffect(() => {
    if (!unlocked) {
      setPrivacyShieldVisible(false);
      return;
    }

    // When autofill mode activates, immediately dismiss any
    // shield that was already raised before the request arrived.
    if (isAutofillMode) {
      setPrivacyShieldVisible(false);
    }

    let lockTimer: ReturnType<typeof setTimeout> | null = null;
    let backgroundDeadline = 0;

    const clearLockTimer = () => {
      if (lockTimer) {
        clearTimeout(lockTimer);
        lockTimer = null;
      }
    };

    const shieldAndScheduleLock = () => {
      // During autofill flow, the Activity is temporarily re-launched which
      // causes blur/visibility-change events. Suppress the shield and lock
      // timer so the user does not see a black screen.
      if (isAutofillMode) return;
      setPrivacyShieldVisible(true);
      onSensitiveStateClearRef.current();
      clearLockTimer();
      backgroundDeadline = Date.now() + backgroundLockDelayMs;
      lockTimer = setTimeout(() => {
        onLockRef.current();
      }, backgroundLockDelayMs);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        shieldAndScheduleLock();
      } else {
        // Y-6: browsers throttle or suspend timers while hidden — returning
        // to the window must honour the deadline instead of unconditionally
        // cancelling the pending lock.
        const deadlinePassed = Date.now() >= backgroundDeadline;
        clearLockTimer();
        if (deadlinePassed) {
          onLockRef.current();
          return;
        }
        setPrivacyShieldVisible(false);
      }
    };

    const handleBlur = () => {
      // Suppress privacy shield when autofill is in progress – the
      // autofill intent briefly steals focus from the WebView.
      if (isAutofillMode) return;
      setPrivacyShieldVisible(true);
      onSensitiveStateClearRef.current();
    };

    const handleFocus = () => {
      if (!document.hidden) {
        setPrivacyShieldVisible(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearLockTimer();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [backgroundLockDelayMs, isAutofillMode, unlocked]);

  return {
    privacyShieldVisible: privacyShieldVisible || screenRecordingDetected,
    screenRecordingDetected,
  };
}
