/**
 * @file Button.tsx
 * @description Shared button primitive. Centralizes the duplicated primary /
 * secondary / ghost / danger button styles that were previously copy-pasted
 * across modals and settings cards with inconsistent paddings, radii and focus
 * styles. Mirrors the design tokens used across the app.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  children: React.ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-primary text-neutral-950 hover:bg-brand-primary/90 shadow-lg shadow-brand-primary/10',
  secondary:
    'bg-surface-lowest text-on-surface border border-outline-variant/20 hover:border-brand-primary/40 hover:bg-surface-low/60',
  ghost: 'text-on-surface-variant hover:text-on-surface hover:bg-surface-low/60',
  danger: 'bg-red-500/10 text-red-300 border border-red-500/20 hover:bg-red-500/15',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-[11px] gap-1.5',
  md: 'px-4 py-2 text-xs gap-2',
  lg: 'px-5 py-3 text-sm gap-2.5',
};

const BASE_CLASSES =
  'inline-flex items-center justify-center rounded-xl font-semibold transition-all select-none ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent';

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    BASE_CLASSES,
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    fullWidth ? 'w-full' : '',
    loading ? 'cursor-wait' : '',
    className || '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} disabled={disabled || loading} className={classes} {...rest}>
      {loading && (
        <span
          aria-hidden="true"
          className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin"
        />
      )}
      {children}
    </button>
  );
}