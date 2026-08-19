/**
 * @file Modal.tsx
 * @description Shared accessible modal primitive. Centralizes the overlay,
 * focus trap, Escape-to-close, backdrop click handling and body scroll lock
 * that were previously copy-pasted across modal components with inconsistent
 * z-index values and no a11y semantics.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  describedBy?: string;
  /** Backdrop click closes the modal. Defaults to `true`. */
  closeOnBackdrop?: boolean;
  /** Overlay z-index. Defaults to `100`. */
  zIndex?: number;
  /** data-testid for the overlay element. Defaults to `shared-modal-overlay`. */
  overlayTestId?: string;
  /** Extra classes appended to the overlay (e.g. `safe-modal`). */
  className?: string;
  children: React.ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
  );
}

function getZIndexClass(zIndex?: number): string {
  if (!zIndex || zIndex <= 50) return 'z-50';
  if (zIndex <= 100) return 'z-[100]';
  if (zIndex <= 110) return 'z-[110]';
  if (zIndex <= 200) return 'z-[200]';
  if (zIndex <= 260) return 'z-[260]';
  return 'z-[300]';
}

export function Modal({
  open,
  onClose,
  labelledBy,
  describedBy,
  closeOnBackdrop = true,
  zIndex = 100,
  overlayTestId = 'shared-modal-overlay',
  className = '',
  children,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Focus trap + Escape-to-close + return focus on unmount.
  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !overlayRef.current) return;

      const focusable = getFocusable(overlayRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && (active === first || !overlayRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !overlayRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown, true);

    const raf = window.requestAnimationFrame(() => {
      const focusable = overlayRef.current ? getFocusable(overlayRef.current) : [];
      if (focusable.length > 0) focusable[0]!.focus();
    });

    return () => {
      window.cancelAnimationFrame(raf);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const zIndexClass = getZIndexClass(zIndex);

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      data-testid={overlayTestId}
      onClick={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in${className ? ` ${className}` : ''}`}
    >
      {children}
    </div>
  );
}