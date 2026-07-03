const TRASH_RETENTION_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

const PLATFORM_LOGOS = {
  github:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBkPSJNMTIgMGMtNi42MjYgMC0xMiA1LjM3My0xMiAxMiAwIDUuMzAyIDMuNDM4IDkuOCA4LjIwNyAxMS4zODcuNTk5LjExMS43OTMtLjI2MS43OTMtLjU3N3YtMi4yMzRjLTMuMzM4LjcyNi00LjAzMy0xLjQxNi0uNTQ2LTEuMzg3LTEuMzMzLTEuNzU2LTEuMzMzLTEuNzU2LTEuMDg5LS43NDUuMDgzLS43MjkuMDgzLS43MjkgMS4yMDUuMDg0IDEuODM5IDEuMjM3IDEuODM5IDEuMjM3IDEuMDcgMS44MzQgMi44MDcgMS4zMDQgMy40OTIuOTk3LjEwNy0uNzc1LjQxOC0xLjMwNS43NjItMS42MDQtMi42NjUtLjMwNS01LjQ2Ny0xLjMzNC01LjQ2Ny05LjkzMSAwLTEuMzExLjQ2OS0yLjM4MSAxLjIzNi0zLjIyMS0uMTI0LS43MDMtLjUzNS0xLjUyNC4xMTctMy4xNzYgMCAwIDEuMDA4LS4zMjIgMy4zMDEgMS4yMy.Jk5Ny0uMjY2IDEuOTgzLS4zOTkgMy4wMDMtLjQwNCAxLjAyLjAwNSAyLjA0Ny4xMzggMy4wMDYuNDA0IDIuMjkxLTEuNTUyIDMuMjk3LTEuMjMgMy4yOTctMS4yMy42NTMgMS42NTMuMjQyIDIuODc0LjxMTggMy4xNzYuNzcuODQgMS4yMzUgMS45MTEgMS4yMzUgMy4yMjEgMCA0LjYwOS0yLjgwNyA1LjYyNC01LjQ3OSA1LjkyMS40My4zNzIuODIzIDEuMTAyLjgyMyAyLjIyMnYzLjI5M2MwIC4zMTkuMTkyLjY5NC44MDEuNTc2IDQuNzY1LTEuNTg5IDguMTk5LTYuMDg2IDguMTk5LTExLjM4NiAwLTYuNjI3LTUuMzczLTEyLTEyLTEyeiIvPjwvc3ZnPg==',
  google:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBkPSJNMTIuMjQgMTAuMjg1VjE0LjRoNi44ODdjLS42NDggMi40MTAtMi41MTkgNC4xMTQtNi44ODcgNC4xMTQtNC42OTQgMC04LjUwMy0zLjgwOS04LjUwMy04LjUwMy0wLTQuNjk0IDMuODA5LTguNTAzIDguNTAzLTguNTAzIDIuMTM4IDAwIDQuMDkzLjgxOCA1LjU5MSAyLjMxOGwzLjA1My0zLjA1M0MxOC4xNzUgLjk4OCAxNS4zNTggMCAxMi4yNCAwIDUuNTggMCAwIDUuNTggMCAxMi4yNHM1LjU4IDEyLjI0IDEyLjI0IDEyLjI0YzYuODg2IDAgMTIuMjQtNS41OCAxMi4yNC0xMi4yNCAwLS43NTYtLjA3NS0xLjUxMi0uMi0yLjI1NUgxMi4yNHoiLz48L3N2Zz4=',
  chase:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBkPSJNMTIgMkwyIDIyaDIwTDEyIDJ6bTAgNGw2LjUgMTNINS41TDEyIDZ6Ii8+PC9zdmc+',
  spotify:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBkPSJNMTIgMEM1LjQgMCAwIDUuNCAwIDEyczUuNCAxMiAxMiAxMiAxMi01LjQgMTItMTJTMTguNiAwIDEyIDB6bTUuNSAxNy4zYy0uMi4zLS42LjQtLjkuMi0yLjgtMS43LTYuMi0yLjEtMTAuMy0xLjEtLjQuMS0uNy0uMi0uOC0uNS0uMS0uNC4yLS43LjUtLjggNC41LTEgOC4zLS42IDExLjQgMS4zLjMuMi40LjYuMS45em0xLjUtMy4zYy0uMy40LS44LjUtMS4yLjMtMy4yLTItOC4xLTIuNi0xMS45LTEuNC0uNS4xLS45LS4yLTEtLjctLjEtLjUuMi0uOS43LTEgNC4zLTEuMyA5LjctLjcgMTMuNCAxLjYuNC4yLjUuOC4yIDEuMnptLjEtMy40QzE1LjUgOC4zIDkuNCA4IDUuOCA5LjFjLS42LjItMS4yLS4yLTEuNC0uOC0uMi0uNi4yLTEuMi44LTEuNCA0LjEtMS4yIDEwLjktLjkgMTUuMSAxLjYuNS4zLjcuMS40IDEuNS0uMy41LTEgLjctMS41LjR6Ii8+PC9zdmc+',
} as const;

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

export function getLogoForPlatform(title: string, url: string): string | null {
  const normTitle = title.toLowerCase();
  const normUrl = url.toLowerCase();

  if (normTitle.includes('github') || normUrl.includes('github')) {
    return PLATFORM_LOGOS.github;
  }
  if (normTitle.includes('google') || normUrl.includes('google') || normUrl.includes('workspace')) {
    return PLATFORM_LOGOS.google;
  }
  if (normTitle.includes('chase') || normUrl.includes('chase')) {
    return PLATFORM_LOGOS.chase;
  }
  if (normTitle.includes('spotify') || normUrl.includes('spotify')) {
    return PLATFORM_LOGOS.spotify;
  }

  return null;
}
