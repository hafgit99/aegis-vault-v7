// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsExtensionTokenCard } from './SettingsExtensionTokenCard';


// M10 Dilim 1: components resolve translations via useLanguage(); these tests
// assert on rendered keys, so the context is mocked with an identity translator.
vi.mock('../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'tr',
    setLanguage: vi.fn(),
    t: (key: string) => key,
    isRtl: false,
  }),
}));
describe('SettingsExtensionTokenCard', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('renders nothing outside the Tauri runtime', () => {
    const { container } = render(
      <SettingsExtensionTokenCard
        tokenRotateStatus="idle"
        tokenRotateMessage={null}
        onRotateToken={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders the token card and triggers rotation', () => {
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {};
    const onRotateToken = vi.fn();

    render(
      <SettingsExtensionTokenCard
        tokenRotateStatus="idle"
        tokenRotateMessage={null}
        onRotateToken={onRotateToken}
      />,
    );

    expect(screen.getByText('settings.extension.title')).toBeTruthy();
    expect(screen.getByText('settings.extension.rotateBtn')).toBeTruthy();

    fireEvent.click(screen.getByRole('button'));

    expect(onRotateToken).toHaveBeenCalledTimes(1);
  });

  it('renders loading, success and error message states', () => {
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {};
    const { rerender } = render(
      <SettingsExtensionTokenCard
        tokenRotateStatus="loading"
        tokenRotateMessage="working…"
        onRotateToken={vi.fn()}
      />,
    );

    const button = screen.getByRole('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText('settings.extension.rotating')).toBeTruthy();

    rerender(
      <SettingsExtensionTokenCard
        tokenRotateStatus="success"
        tokenRotateMessage="done"
        onRotateToken={vi.fn()}
      />,
    );
    expect(screen.getByText('done').className).toContain('text-green-400');

    rerender(
      <SettingsExtensionTokenCard
        tokenRotateStatus="error"
        tokenRotateMessage="boom"
        onRotateToken={vi.fn()}
      />,
    );
    expect(screen.getByText('boom').className).toContain('text-red-400');
  });
});