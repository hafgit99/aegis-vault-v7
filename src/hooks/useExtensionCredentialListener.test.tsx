// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useExtensionCredentialListener } from './useExtensionCredentialListener';

type ListenHandler = (event: { payload: unknown }) => void;

const listenMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/event', () => ({ listen: listenMock }));

function emitCredentialEvent(handler: ListenHandler, payload: unknown) {
  handler({ payload });
}

describe('useExtensionCredentialListener', () => {
  let unlisten: ReturnType<typeof vi.fn>;
  let capturedHandler: ListenHandler;

  beforeEach(() => {
    unlisten = vi.fn();
    capturedHandler = () => undefined;
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    listenMock.mockReset().mockImplementation((_event: string, handler: ListenHandler) => {
      capturedHandler = handler;
      return Promise.resolve(unlisten);
    });
  });

  it('normalises the extension payload and forwards it to the callback', async () => {
    const onAddCredential = vi.fn();
    renderHook(() => useExtensionCredentialListener(onAddCredential));

    await waitFor(() => expect(listenMock).toHaveBeenCalledWith('add-credential-from-extension', expect.any(Function)));
    emitCredentialEvent(capturedHandler, { title: 'GitHub', username: 'octo', password: 's3cret' });

    expect(onAddCredential).toHaveBeenCalledWith({
      title: 'GitHub',
      username: 'octo',
      password: 's3cret',
      url: '',
    });
  });

  it('ignores empty payloads and unsubscribes on unmount', async () => {
    const onAddCredential = vi.fn();
    const { unmount } = renderHook(() => useExtensionCredentialListener(onAddCredential));

    await waitFor(() => expect(listenMock).toHaveBeenCalled());
    emitCredentialEvent(capturedHandler, null);
    expect(onAddCredential).not.toHaveBeenCalled();

    unmount();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe outside the Tauri runtime', () => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    const onAddCredential = vi.fn();
    renderHook(() => useExtensionCredentialListener(onAddCredential));
    expect(listenMock).not.toHaveBeenCalled();
  });});
