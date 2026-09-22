/**
 * @vitest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useOnboardingTour, ONBOARDING_STORAGE_KEYS } from './useOnboardingTour';
import type { VaultItem } from '../types';

const sampleItem: VaultItem = {
  id: '1',
  title: 'Sample Login',
  username: 'user',
  url: 'https://example.com',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  category: 'login',
};

describe('useOnboardingTour', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes with step 1 incomplete when items list is empty', () => {
    const { result } = renderHook(() => useOnboardingTour([]));

    expect(result.current.isVisible).toBe(true);
    expect(result.current.completedCount).toBe(0);
    expect(result.current.steps[0]?.isComplete).toBe(false);
  });

  it('marks step 1 complete automatically when vault has items', () => {
    const { result } = renderHook(() => useOnboardingTour([sampleItem]));

    expect(result.current.steps[0]?.isComplete).toBe(true);
    expect(result.current.completedCount).toBe(1);
  });

  it('marks step complete manually', () => {
    const { result } = renderHook(() => useOnboardingTour([]));

    act(() => {
      result.current.markStepComplete(2);
    });

    expect(result.current.steps[1]?.isComplete).toBe(true);
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.EXT_EXPLORED)).toBe('true');
  });

  it('hides tour when dismissed and persists dismissal', () => {
    const { result } = renderHook(() => useOnboardingTour([]));

    expect(result.current.isVisible).toBe(true);

    act(() => {
      result.current.dismissTour();
    });

    expect(result.current.isVisible).toBe(false);
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEYS.DISMISSED)).toBe('true');
  });

  it('automatically hides when all 4 steps are completed', () => {
    const { result } = renderHook(() => useOnboardingTour([sampleItem]));

    act(() => {
      result.current.markStepComplete(2);
      result.current.markStepComplete(3);
      result.current.markStepComplete(4);
    });

    expect(result.current.completedCount).toBe(4);
    expect(result.current.isVisible).toBe(false);
  });
});
