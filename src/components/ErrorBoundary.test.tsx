/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function ProblemChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Simulated render explosion');
  }
  return <div>Healthy Child Content</div>;
}

describe('ErrorBoundary (P2-10)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders children normally when no error occurs', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Healthy Child Content')).toBeTruthy();
  });

  it('catches render error, invokes onLock, and renders fallback UI', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onLock = vi.fn();

    render(
      <ErrorBoundary onLock={onLock}>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>,
    );

    // Should render the secure fallback UI
    expect(screen.getByTestId('unlocked-error-boundary-fallback')).toBeTruthy();
    expect(screen.getByText('Unexpected Application Error')).toBeTruthy();

    // onLock should have been called to safeguard decrypted memory
    expect(onLock).toHaveBeenCalled();

    // Clicking manual lock button should call onLock
    const initialCallCount = onLock.mock.calls.length;
    const lockBtn = screen.getByRole('button', { name: /Lock Vault Immediately/i });
    fireEvent.click(lockBtn);
    expect(onLock.mock.calls.length).toBeGreaterThan(initialCallCount);

    consoleError.mockRestore();
  });
});
