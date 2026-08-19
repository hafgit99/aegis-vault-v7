/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BulkSelectWrapper from './BulkSelectWrapper';
import React from 'react';

describe('BulkSelectWrapper', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders children and hides checkbox when isSelectionMode is false', () => {
    render(
      <BulkSelectWrapper
        id="item-1"
        isSelectionMode={false}
        isSelected={false}
        onToggle={vi.fn()}
        onSelectOnly={vi.fn()}
      >
        <div>Item Content</div>
      </BulkSelectWrapper>,
    );

    expect(screen.queryByText('Item Content')).not.toBeNull();
    expect(screen.queryByTestId('bulk-select-checkbox')).toBeNull();
  });

  it('renders checkbox and handles toggle in selection mode', () => {
    const onToggle = vi.fn();
    render(
      <BulkSelectWrapper
        id="item-1"
        isSelectionMode={true}
        isSelected={true}
        onToggle={onToggle}
        onSelectOnly={vi.fn()}
      >
        <div>Item Content</div>
      </BulkSelectWrapper>,
    );

    const checkbox = screen.getByTestId('bulk-select-checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith('item-1');
  });

  it('enters selection mode when Ctrl+click is performed on item', () => {
    const onSelectOnly = vi.fn();
    render(
      <BulkSelectWrapper
        id="item-1"
        isSelectionMode={false}
        isSelected={false}
        onToggle={vi.fn()}
        onSelectOnly={onSelectOnly}
      >
        <div>Item Content</div>
      </BulkSelectWrapper>,
    );

    fireEvent.click(screen.getByText('Item Content'), { ctrlKey: true });
    expect(onSelectOnly).toHaveBeenCalledWith('item-1');
  });
});
