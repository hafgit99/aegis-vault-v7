const TRASH_RETENTION_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';

  const unit = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(unit)), sizes.length - 1);
  const value = bytes / Math.pow(unit, index);

  return `${parseFloat(value.toFixed(2))} ${sizes[index]}`;
}

export function getTrashRemainingDays(deletedAt?: string, nowMs = Date.now()): number {
  if (!deletedAt) return TRASH_RETENTION_DAYS;

  const deletedTime = new Date(deletedAt).getTime();
  if (Number.isNaN(deletedTime)) return TRASH_RETENTION_DAYS;

  const elapsedDays = (nowMs - deletedTime) / DAY_MS;
  const remainingDays = Math.ceil(TRASH_RETENTION_DAYS - elapsedDays);

  return Math.max(0, Math.min(TRASH_RETENTION_DAYS, remainingDays));
}
