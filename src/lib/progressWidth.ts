export function progressWidthClass(percent: number): string {
  const normalized = Number.isFinite(percent) ? percent : 0;
  const clamped = Math.max(0, Math.min(100, Math.round(normalized)));
  return `progress-width-${clamped}`;
}
