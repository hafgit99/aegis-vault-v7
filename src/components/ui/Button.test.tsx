/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Button } from './Button';

afterEach(() => {
  cleanup();
});

describe('Button', () => {
  it('renders children with default primary variant', () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn.className).toContain('bg-brand-primary');
  });

  it('applies secondary, ghost and danger variants', () => {
    const { rerender } = render(<Button variant="secondary">S</Button>);
    expect(screen.getByRole('button').className).toContain('border-outline-variant/20');

    rerender(<Button variant="ghost">G</Button>);
    expect(screen.getByRole('button').className).toContain('text-on-surface-variant');

    rerender(<Button variant="danger">D</Button>);
    expect(screen.getByRole('button').className).toContain('text-red-300');
  });

  it('defaults to type="button"', () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' }).getAttribute('type')).toBe('button');
  });

  it('preserves explicit type and native attributes', () => {
    render(
      <Button type="submit" aria-label="Submit form">
        Go
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Submit form' });
    expect(btn.getAttribute('type')).toBe('submit');
  });

  it('disables and shows spinner when loading', () => {
    render(<Button loading>Wait</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveProperty('disabled', true);
    expect(btn.querySelector('.animate-spin')).not.toBeNull();
  });

  it('respects fullWidth', () => {
    render(<Button fullWidth>W</Button>);
    expect(screen.getByRole('button').className).toContain('w-full');
  });

  it('forwards onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    screen.getByRole('button', { name: 'Click' }).click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
