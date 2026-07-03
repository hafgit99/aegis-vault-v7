import { useEffect, useState } from 'react';
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

  useEffect(() => {
    void enableNativeScreenCaptureProtection();
  }, []);

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
      listen<boolean>('screen-capture-status-changed', (event) => {
        const isRecording = event.payload;
        setScreenRecordingDetected(isRecording);
        if (isRecording) {
          onSensitiveStateClear();
          onLock();
        }
      }).then((unlisten) => {
        unlistenFn = unlisten;
      }).catch(err => {
        console.error('Failed to listen to screen-capture-status-changed:', err);
      });
    }

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [onLock, onSensitiveStateClear]);

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
      onSensitiveStateClear();
      clearLockTimer();
      lockTimer = setTimeout(() => {
        onLock();
      }, backgroundLockDelayMs);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        shieldAndScheduleLock();
      } else {
        clearLockTimer();
        setPrivacyShieldVisible(false);
      }
    };

    const handleBlur = () => {
      // Suppress privacy shield when autofill is in progress – the
      // autofill intent briefly steals focus from the WebView.
      if (isAutofillMode) return;
      setPrivacyShieldVisible(true);
      onSensitiveStateClear();
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
  }, [backgroundLockDelayMs, isAutofillMode, onLock, onSensitiveStateClear, unlocked]);

  return {
    privacyShieldVisible: privacyShieldVisible || screenRecordingDetected,
    screenRecordingDetected,
  };
}
