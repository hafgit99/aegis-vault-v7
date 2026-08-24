import { useState } from 'react';

export const AUTO_LOCK_DURATION_KEY = 'auto_lock_duration';
export const DEFAULT_AUTO_LOCK_DURATION_SECONDS = 300;
export const MIN_AUTO_LOCK_DURATION_SECONDS = 15;
export const MAX_AUTO_LOCK_DURATION_SECONDS = 7200;

export function sanitizeAutoLockDuration(raw: number | null | undefined): number {
  if (raw === null || raw === undefined || !Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_AUTO_LOCK_DURATION_SECONDS;
  }
  return Math.min(Math.max(raw, MIN_AUTO_LOCK_DURATION_SECONDS), MAX_AUTO_LOCK_DURATION_SECONDS);
}

function readStoredAutoLockDuration() {
  const saved = localStorage.getItem(AUTO_LOCK_DURATION_KEY);
  if (saved === null) return DEFAULT_AUTO_LOCK_DURATION_SECONDS;

  const duration = parseInt(saved, 10);
  return sanitizeAutoLockDuration(duration);
}

export function useAutoLockDuration() {
  const [autoLockDuration, setAutoLockDuration] = useState<number>(readStoredAutoLockDuration);

  const changeAutoLockDuration = (duration: number) => {
    const sanitized = sanitizeAutoLockDuration(duration);
    localStorage.setItem(AUTO_LOCK_DURATION_KEY, sanitized.toString());
    setAutoLockDuration(sanitized);
  };

  return {
    autoLockDuration,
    changeAutoLockDuration,
  };
}
