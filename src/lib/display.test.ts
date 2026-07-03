import { describe, expect, it } from 'vitest';
import { formatFileSize, getLogoForPlatform, getTrashRemainingDays } from './display';

describe('display helpers', () => {
  it('formats file sizes with compact units', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB');
  });

  it('calculates remaining trash retention days', () => {
    const now = new Date('2026-06-10T12:00:00.000Z').getTime();

    expect(getTrashRemainingDays(undefined, now)).toBe(15);
    expect(getTrashRemainingDays('2026-06-10T12:00:00.000Z', now)).toBe(15);
    expect(getTrashRemainingDays('2026-06-09T12:00:01.000Z', now)).toBe(15);
    expect(getTrashRemainingDays('2026-06-09T11:59:59.000Z', now)).toBe(14);
    expect(getTrashRemainingDays('2026-05-20T12:00:00.000Z', now)).toBe(0);
  });

  it('falls back safely for invalid deletion dates', () => {
    const now = new Date('2026-06-10T12:00:00.000Z').getTime();

    expect(getTrashRemainingDays('not-a-date', now)).toBe(15);
  });

  it('resolves known platform logos from title or url', () => {
    expect(getLogoForPlatform('GitHub', '')).toContain('data:image/svg+xml;base64,');
    expect(getLogoForPlatform('Team Workspace', 'https://workspace.google.com')).toContain('data:image/svg+xml;base64,');
    expect(getLogoForPlatform('Bank', 'https://secure.chase.com')).toContain('data:image/svg+xml;base64,');
    expect(getLogoForPlatform('Music', 'https://spotify.com')).toContain('data:image/svg+xml;base64,');
  });

  it('returns null for unknown platform logos', () => {
    expect(getLogoForPlatform('Internal Wiki', 'https://wiki.example.com')).toBeNull();
  });
});
