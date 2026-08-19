import { describe, expect, it } from 'vitest';
import { progressWidthClass } from './progressWidth';

describe('progressWidthClass', () => {
  it('returns valid progress class for positive numbers', () => {
    expect(progressWidthClass(50)).toBe('progress-width-50');
    expect(progressWidthClass(100)).toBe('progress-width-100');
  });

  it('clamps values below 0 and above 100', () => {
    expect(progressWidthClass(-20)).toBe('progress-width-0');
    expect(progressWidthClass(150)).toBe('progress-width-100');
  });

  it('handles non-finite and NaN values gracefully', () => {
    expect(progressWidthClass(NaN)).toBe('progress-width-0');
    expect(progressWidthClass(Infinity)).toBe('progress-width-0');
    expect(progressWidthClass(-Infinity)).toBe('progress-width-0');
  });
});
