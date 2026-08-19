import { describe, expect, it } from 'vitest';
import {
  AVATAR_GRADIENT_PRESETS,
  isAvatarGradient,
  avatarClassNameForValue,
} from './avatarStyles';

describe('avatarStyles', () => {
  it('detects linear-gradient and gradient prefixed values', () => {
    expect(isAvatarGradient('linear-gradient(135deg, #10b981 0%, #059669 100%)')).toBe(true);
    expect(isAvatarGradient('gradient(#aaa, #bbb)')).toBe(true);
    expect(isAvatarGradient('#10b981')).toBe(false);
    expect(isAvatarGradient('url(image.png)')).toBe(false);
    expect(isAvatarGradient('')).toBe(false);
  });

  it('returns matching class for known preset value', () => {
    const preset = AVATAR_GRADIENT_PRESETS[1]!;
    expect(avatarClassNameForValue(preset.value)).toBe(preset.className);
  });

  it('returns default class for unknown gradient value', () => {
    expect(avatarClassNameForValue('linear-gradient(0deg, #000 0%, #fff 100%)')).toBe(
      AVATAR_GRADIENT_PRESETS[0]!.className,
    );
  });
});
