import { useState } from 'react';

const AUTO_LOCK_DURATION_KEY = 'auto_lock_duration';
const DEFAULT_AUTO_LOCK_DURATION_SECONDS = 300;

function readStoredAutoLockDuration() {
  const saved = localStorage.getItem(AUTO_LOCK_DURATION_KEY);
  if (saved === null) return DEFAULT_AUTO_LOCK_DURATION_SECONDS;

  const duration = parseInt(saved, 10);
  return Number.isFinite(duration) ? duration : DEFAULT_AUTO_LOCK_DURATION_SECONDS;
}

export function useAutoLockDuration() {
  const [autoLockDuration, setAutoLockDuration] = useState<number>(readStoredAutoLockDuration);

  const changeAutoLockDuration = (duration: number) => {
    localStorage.setItem(AUTO_LOCK_DURATION_KEY, duration.toString());
    setAutoLockDuration(duration);
  };

  return {
    autoLockDuration,
    changeAutoLockDuration,
  };
}
