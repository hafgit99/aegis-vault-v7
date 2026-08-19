/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Modal } from './Modal';

afterEach(() => {
  cleanup();
});

function Harness({ open = true, onClose }: { open?: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="dialog-title">
      <div>
        <h2 id="dialog-title">Dialog</h2>
        <button type="button">First</button>
        <button type="button">Last</button>
      </div>
    </Modal>
  );
}

describe('Modal', () => {
  it('renders role="dialog" with aria-modal and labelled-by', () => {
    render(<Harness open onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('dialog-title');
  });

  it('renders nothing when closed', () => {
    render(<Harness open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click, not on inner panel click', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.click(screen.getByTestId('shared-modal-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('traps focus: Tab wraps from last to first and Shift+Tab from first to last', () => {
    render(<Harness onClose={vi.fn()} />);
    const first = screen.getByText('First');
    const last = screen.getByText('Last');

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('locks body scroll while open and restores it after close', () => {
    const { rerender } = render(<Harness onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<Harness open={false} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('');
  });
});