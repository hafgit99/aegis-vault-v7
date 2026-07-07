/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface BulkSelectWrapperProps {
  id: string;
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggle: (id: string) => void;
  onSelectOnly: (id: string) => void;
  onShiftSelect?: (id: string) => void;
  children: React.ReactNode;
}

/**
 * BulkSelectWrapper wraps a selectable list item. When selection mode is active,
 * it displays a checkbox to the left of the child and handles click overrides (Shift+Click, Ctrl+Click).
 */
export default function BulkSelectWrapper({
  id,
  isSelectionMode,
  isSelected,
  onToggle,
  onSelectOnly,
  onShiftSelect,
  children,
}: BulkSelectWrapperProps) {
  const handleClick = (event: React.MouseEvent) => {
    if (isSelectionMode) {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey && onShiftSelect) {
        onShiftSelect(id);
      } else {
        onToggle(id);
      }
    } else {
      // If Ctrl/Meta is held, enter selection mode with this item
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
        onSelectOnly(id);
      }
    }
  };

  const handleCheckboxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation();
    onToggle(id);
  };

  return (
    <div className="flex items-center gap-2 w-full group/bulk">
      {isSelectionMode && (
        <input
          type="checkbox"
          data-testid="bulk-select-checkbox"
          checked={isSelected}
          onChange={handleCheckboxChange}
          onClick={(event) => event.stopPropagation()}
          className="w-4 h-4 rounded border-outline-variant/30 text-brand-primary focus:ring-brand-primary/40 cursor-pointer"
        />
      )}
      <div className="flex-1 min-w-0" onClick={handleClick}>
        {children}
      </div>
    </div>
  );
}
