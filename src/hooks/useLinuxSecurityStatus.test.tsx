// @vitest-environment jsdom

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { useLinuxSecurityStatus } from './useLinuxSecurityStatus';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

describe('useLinuxSecurityStatus', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ is_x11: false });
  });

  it('warns when the desktop session runs under X11', async () => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue({ is_x11: true, wayland_active: false });

    const onNotify = vi.fn();
    renderHook(() => useLinuxSecurityStatus({ unlocked: true, onNotify }), { wrapper });

    await waitFor(() => expect(onNotify).toHaveBeenCalledTimes(1));
    expect(onNotify.mock.calls[0]![0]).toMatchObject({ type: 'warning' });
    expect(invokeMock).toHaveBeenCalledWith('get_linux_security_status');
  });

  it('stays silent on Wayland sessions and when locked or non-desktop', async () => {
    const onNotify = vi.fn();
    const { rerender } = renderHook(
      ({ unlocked }) => useLinuxSecurityStatus({ unlocked, onNotify }),
      { initialProps: { unlocked: false }, wrapper },
    );

    // Locked: no IPC call at all.
    expect(invokeMock).not.toHaveBeenCalled();
    rerender({ unlocked: true });
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(onNotify).not.toHaveBeenCalled();

    // Non-desktop runtime: no subscription.
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    rerender({ unlocked: true });
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the IPC call rejects', async () => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    invokeMock.mockRejectedValueOnce(new Error('ipc unavailable'));

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onNotify = vi.fn();
    renderHook(() => useLinuxSecurityStatus({ unlocked: true, onNotify }), { wrapper });

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(onNotify).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
