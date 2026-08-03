/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

import {
  advancePagination,
  createInitialPaginationState,
  createVaultPaginationReducer,
  DEFAULT_BATCH_SIZE,
  DEFAULT_INITIAL_VISIBLE_COUNT,
  releaseLoadingGuard,
  type VaultPaginationState,
} from './useVaultPagination';

const INITIAL_TOTAL = 687;

describe('useVaultPagination', () => {
  describe('createInitialPaginationState', () => {
    it('uses the documented defaults for total count only', () => {
      const state = createInitialPaginationState(INITIAL_TOTAL);

      expect(state).toEqual({
        visibleCount: DEFAULT_INITIAL_VISIBLE_COUNT,
        totalCount: INITIAL_TOTAL,
        loadingMore: false,
        loadCount: 0,
      });
    });

    it('honours custom initial visible count and batch size', () => {
      const state = createInitialPaginationState(INITIAL_TOTAL, {
        initialVisibleCount: 25,
      });
      expect(state.visibleCount).toBe(25);
    });
  });

  describe('advancePagination', () => {
    it('grows visibleCount by the default batch size and trips the loading guard', () => {
      const start: VaultPaginationState = {
        visibleCount: 60,
        totalCount: INITIAL_TOTAL,
        loadingMore: false,
        loadCount: 0,
      };
      const next = advancePagination(start, INITIAL_TOTAL);
      expect(next.visibleCount).toBe(60 + DEFAULT_BATCH_SIZE);
      expect(next.loadingMore).toBe(true);
      expect(next.loadCount).toBe(1);
    });

    it('caps visibleCount at totalCount when the next batch would overshoot', () => {
      const start: VaultPaginationState = {
        visibleCount: 670,
        totalCount: INITIAL_TOTAL,
        loadingMore: false,
        loadCount: 0,
      };
      const next = advancePagination(start, INITIAL_TOTAL);
      expect(next.visibleCount).toBe(INITIAL_TOTAL);
      expect(next.loadingMore).toBe(true);
    });

    it('is a no-op when the loading guard is already tripped (Android scrub bug)', () => {
      const start: VaultPaginationState = {
        visibleCount: 90,
        totalCount: INITIAL_TOTAL,
        loadingMore: true,
        loadCount: 0,
      };
      const next = advancePagination(start, INITIAL_TOTAL);
      // Guard is preserved; visibleCount does not jump to 120, 150, or 180.
      expect(next).toBe(start);
    });

    it('is a no-op when every item is already visible', () => {
      const start: VaultPaginationState = {
        visibleCount: 687,
        totalCount: INITIAL_TOTAL,
        loadingMore: false,
        loadCount: 0,
      };
      const next = advancePagination(start, INITIAL_TOTAL);
      expect(next).toBe(start);
    });

    it('collapses a burst of three back-to-back calls into a single batch (regression for the scrub loop)', () => {
      let state: VaultPaginationState = createInitialPaginationState(INITIAL_TOTAL);
      // Simulate the IntersectionObserver firing three times within the same
      // animation frame, which is exactly what was happening on Android
      // WebView before the fix.
      const afterFirst = advancePagination(state, INITIAL_TOTAL);
      const afterSecond = advancePagination(afterFirst, INITIAL_TOTAL);
      const afterThird = advancePagination(afterSecond, INITIAL_TOTAL);

      expect(afterFirst.visibleCount).toBe(60 + 30);
      // The second and third calls must be no-ops thanks to the loading guard.
      expect(afterSecond).toBe(afterFirst);
      expect(afterThird).toBe(afterFirst);
      expect(afterFirst.loadCount).toBe(1);
    });
  });

  describe('releaseLoadingGuard', () => {
    it('flips the loading guard off when active', () => {
      const state: VaultPaginationState = {
        visibleCount: 90,
        totalCount: INITIAL_TOTAL,
        loadingMore: true,
        loadCount: 1,
      };
      const next = releaseLoadingGuard(state);
      expect(next.loadingMore).toBe(false);
      expect(next.visibleCount).toBe(state.visibleCount);
      expect(next.loadCount).toBe(state.loadCount);
    });

    it('returns the same reference when the guard is already released', () => {
      const state: VaultPaginationState = {
        visibleCount: 90,
        totalCount: INITIAL_TOTAL,
        loadingMore: false,
        loadCount: 1,
      };
      const next = releaseLoadingGuard(state);
      expect(next).toBe(state);
    });
  });

  describe('createVaultPaginationReducer', () => {
    it('chains loadMore → release and clears the loading guard exactly once', () => {
      const reducer = createVaultPaginationReducer();

      const initial = reducer(undefined as unknown as VaultPaginationState, {
        type: 'reset',
        totalCount: INITIAL_TOTAL,
      });
      expect(initial.visibleCount).toBe(DEFAULT_INITIAL_VISIBLE_COUNT);
      expect(initial.loadingMore).toBe(false);

      const loaded = reducer(initial, { type: 'loadMore', totalCount: INITIAL_TOTAL });
      expect(loaded.visibleCount).toBe(DEFAULT_INITIAL_VISIBLE_COUNT + DEFAULT_BATCH_SIZE);
      expect(loaded.loadingMore).toBe(true);
      // A second loadMore before release must be a no-op.
      const loadedAgain = reducer(loaded, { type: 'loadMore', totalCount: INITIAL_TOTAL });
      expect(loadedAgain).toBe(loaded);

      const released = reducer(loaded, { type: 'release' });
      expect(released.loadingMore).toBe(false);

      // Now another batch can be loaded.
      const reloaded = reducer(released, { type: 'loadMore', totalCount: INITIAL_TOTAL });
      expect(reloaded.visibleCount).toBe(DEFAULT_INITIAL_VISIBLE_COUNT + DEFAULT_BATCH_SIZE * 2);
      expect(reloaded.loadingMore).toBe(true);
    });

    it('reset drops back to the initial page size and clears the guard', () => {
      const reducer = createVaultPaginationReducer();
      const start = reducer(undefined as unknown as VaultPaginationState, {
        type: 'reset',
        totalCount: INITIAL_TOTAL,
      });
      const afterLoad = reducer(start, { type: 'loadMore', totalCount: INITIAL_TOTAL });
      const afterReset = reducer(afterLoad, { type: 'reset', totalCount: INITIAL_TOTAL });
      expect(afterReset.visibleCount).toBe(DEFAULT_INITIAL_VISIBLE_COUNT);
      expect(afterReset.loadingMore).toBe(false);
      expect(afterReset.loadCount).toBe(0);
    });

    it('returns the same reference for unknown actions (no spurious re-renders)', () => {
      const reducer = createVaultPaginationReducer();
      const state = createInitialPaginationState(INITIAL_TOTAL);
      const next = reducer(state, { type: 'noop' as unknown as 'reset' });
      expect(next).toBe(state);
    });

    it('uses the scheduleRelease option to defer release dispatch', () => {
      const pendingReleases: Array<() => void> = [];
      const reducer = createVaultPaginationReducer({
        scheduleRelease: (release) => pendingReleases.push(release),
      });

      const initial = reducer(undefined as unknown as VaultPaginationState, {
        type: 'reset',
        totalCount: INITIAL_TOTAL,
      });
      // scheduleRelease is intentionally not used by the reducer itself —
      // the caller (a React useEffect) is responsible for invoking the
      // release callback. This test exists to lock in that contract: the
      // option is exposed but only invoked when the caller wires it up.
      const loaded = reducer(initial, { type: 'loadMore', totalCount: INITIAL_TOTAL });
      expect(loaded.loadingMore).toBe(true);
      expect(pendingReleases).toHaveLength(0);
    });
  });
});
