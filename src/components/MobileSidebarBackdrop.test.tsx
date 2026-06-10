// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MobileSidebarBackdrop from './MobileSidebarBackdrop';

describe('MobileSidebarBackdrop', () => {
  it('does not render when closed', () => {
    const { container } = render(<MobileSidebarBackdrop isOpen={false} onClose={vi.fn()} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders and calls onClose when clicked', () => {
    const onClose = vi.fn();
    render(<MobileSidebarBackdrop isOpen onClose={onClose} />);

    const backdrop = screen.getByTestId('mobile-sidebar-backdrop');
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledOnce();
  });
});
