// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSensitiveReveal } from './useSensitiveReveal';

describe('useSensitiveReveal', () => {
  it('toggles sensitive field reveal state independently', () => {
    const { result } = renderHook(() => useSensitiveReveal());

    act(() => {
      result.current.toggleReveal('password');
      result.current.toggleReveal('cardCvv');
    });

    expect(result.current.revealed.password).toBe(true);
    expect(result.current.revealed.cardCvv).toBe(true);
    expect(result.current.revealed.cardNumber).toBe(false);
  });

  it('resets all reveal state', () => {
    const { result } = renderHook(() => useSensitiveReveal());

    act(() => {
      result.current.toggleReveal('password');
      result.current.toggleReveal('cardPin');
    });
    act(() => {
      result.current.resetReveals();
    });

    expect(Object.values(result.current.revealed).every((value) => value === false)).toBe(true);
  });
});
