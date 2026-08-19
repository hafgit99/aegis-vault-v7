/**
 * @file Input.tsx
 * @description Shared text input primitive. Centralizes the label + input +
 * leading/trailing adornment layout that was previously copy-pasted across
 * modals and forms with inconsistent styling.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import React, { useId } from 'react';

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  /** Icon rendered at the start of the field. */
  leadingIcon?: React.ReactNode;
  /** React node rendered at the end of the field (e.g. eye toggle). */
  trailing?: React.ReactNode;
  error?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES: Record<NonNullable<InputProps['size']>, string> = {
  sm: 'py-1.5 text-xs',
  md: 'py-2.5 text-sm',
  lg: 'py-3 text-sm',
};

export function Input({
  label,
  leadingIcon,
  trailing,
  error = false,
  size = 'md',
  className,
  id,
  ...rest
}: InputProps) {
  const generatedId = useId();
  const inputId = id || generatedId;

  const fieldClasses = [
    'w-full bg-neutral-950/80 border rounded-xl text-neutral-100 placeholder-neutral-600',
    'transition-all outline-none',
    leadingIcon ? 'pl-10' : 'pl-3.5',
    trailing ? 'pr-11' : 'pr-3.5',
    SIZE_CLASSES[size],
    error
      ? 'border-red-500/60 focus:border-red-500 focus:ring-1 focus:ring-red-500/60'
      : 'border-neutral-800 focus:border-brand-primary/60 focus:ring-1 focus:ring-brand-primary/60',
    className || '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div>
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-neutral-300 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {leadingIcon && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none flex items-center">
            {leadingIcon}
          </span>
        )}
        <input id={inputId} className={fieldClasses} aria-invalid={error || undefined} {...rest} />
        {trailing && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
            {trailing}
          </span>
        )}
      </div>
    </div>
  );
}