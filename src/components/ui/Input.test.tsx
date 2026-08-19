/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Input } from './Input';

afterEach(() => {
  cleanup();
});

describe('Input', () => {
  it('renders a labelled text input by default', () => {
    render(<Input label="Master Password" />);
    const field = screen.getByLabelText('Master Password') as HTMLInputElement;
    expect(field.type).toBe('text');
  });

  it('forwards value and onChange', () => {
    const onChange = vi.fn();
    render(<Input value="abc" onChange={onChange} />);
    const field = screen.getByRole('textbox');
    expect((field as HTMLInputElement).value).toBe('abc');
    fireEvent.change(field, { target: { value: 'xyz' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('passes through type and aria-invalid on error', () => {
    const { rerender } = render(<Input type="password" />);
    expect((screen.getByDisplayValue('') as HTMLInputElement).type).toBe('password');

    rerender(<Input error />);
    expect(screen.getByDisplayValue('').getAttribute('aria-invalid')).toBe('true');
  });

  it('renders trailing adornment and wires label htmlFor to the input id', () => {
    render(<Input label="Code" trailing={<button type="button">Reveal</button>} />);
    const reveal = screen.getByRole('button', { name: 'Reveal' });
    expect(reveal).not.toBeNull();
    const field = screen.getByLabelText('Code');
    const label = document.querySelector('label');
    expect(label?.getAttribute('for')).toBe(field.id);
  });

  it('applies leading icon padding when a leading icon is present', () => {
    render(<Input leadingIcon={<span data-testid="icon" />} />);
    expect(screen.getByTestId('icon')).not.toBeNull();
    expect(screen.getByRole('textbox').className).toContain('pl-10');
  });
});
