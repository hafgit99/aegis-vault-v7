/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure state machine that powers the vault list pagination. Extracted from
 * VaultWorkspace so the Android scrub-bug regression can be tested in
 * isolation (no React, no @testing-library) and so the logic stays
 * readable.
 *
 * Design constraints (driven by the original bug):
 *   - A single scroll listener (IntersectionObserver on a sentinel) is the
 *     only thing that drives pagination. Window scroll events and inline
 *     container onScroll are deliberately not used; their combination with
 *     framer-motion's layout animations caused the list to grow inside its
 *     own bottom threshold and trigger loadMore 3-4 times per frame.
 *   - The loading guard is reset on the next animation frame so we can
 *     coalesce a burst of sentinel intersections (which Android WebView
 *     sometimes emits when scrollHeight snaps) into a single batch.
 *   - The guard is also re-checked inside the state updater so a stale
 *     closure cannot sneak past it.
 */
export interface VaultPaginationState {
  visibleCount: number;
  totalCount: number;
  loadingMore: boolean;
  /** Frame counter incremented whenever loadMore fires; for debugging. */
  loadCount: number;
}

export interface VaultPaginationCallbacks {
  onLoad?(visibleCount: number, totalCount: number): void;
}

export interface VaultPaginationOptions {
  initialVisibleCount?: number;
  batchSize?: number;
}

export const DEFAULT_INITIAL_VISIBLE_COUNT = 60;
export const DEFAULT_BATCH_SIZE = 30;

/**
 * Increments [state.visibleCount] by [batchSize], capped at [totalCount].
 * Returns the new state. The caller is responsible for invoking
 * [releaseLoadingGuard] on the next frame.
 */
export function advancePagination(
  state: VaultPaginationState,
  totalCount: number,
  batchSize: number = DEFAULT_BATCH_SIZE,
): VaultPaginationState {
  if (state.loadingMore) return state;
  if (state.visibleCount >= totalCount) return state;

  const nextVisibleCount = Math.min(state.visibleCount + batchSize, totalCount);
  return {
    ...state,
    visibleCount: nextVisibleCount,
    loadingMore: true,
    loadCount: state.loadCount + 1,
  };
}

/**
 * Releases the loading guard. The caller (e.g. a `requestAnimationFrame`
 * callback from a React effect) provides the function used to defer the
 * release. This helper exists separately from the reducer so tests can
 * drive the release deterministically.
 */
export function releaseLoadingGuard(state: VaultPaginationState): VaultPaginationState {
  if (!state.loadingMore) return state;
  return { ...state, loadingMore: false };
}

/**
 * Builds a reducer that mirrors the React state updater used inside the
 * vault list. Centralizing the logic here lets us unit test the guard
 * semantics without rendering the component.
 */
export function createVaultPaginationReducer(
  options: VaultPaginationOptions = {},
): (
  state: VaultPaginationState,
  action: { type: 'loadMore' | 'release' | 'reset'; totalCount?: number },
) => VaultPaginationState {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  return (state, action) => {
    if (action.type === 'loadMore') {
      return advancePagination(state, action.totalCount ?? state.totalCount, batchSize);
    }
    if (action.type === 'release') {
      // Returning a new object only when the guard actually flips prevents
      // an extra render when the effect fires after the user has already
      // navigated away or the filter changed.
      return releaseLoadingGuard(state);
    }
    if (action.type === 'reset') {
      return {
        visibleCount: options.initialVisibleCount ?? DEFAULT_INITIAL_VISIBLE_COUNT,
        totalCount: action.totalCount ?? state.totalCount,
        loadingMore: false,
        loadCount: 0,
      };
    }
    return state;
  };
}

/**
 * Convenience initializer used by both VaultWorkspace and the tests.
 */
export function createInitialPaginationState(
  totalCount: number,
  options: VaultPaginationOptions = {},
): VaultPaginationState {
  return {
    visibleCount: options.initialVisibleCount ?? DEFAULT_INITIAL_VISIBLE_COUNT,
    totalCount,
    loadingMore: false,
    loadCount: 0,
  };
}
