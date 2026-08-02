// @vitest-environment jsdom

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { useAssetIntegrity } from './useAssetIntegrity';

const verifyMock = vi.hoisted(() => vi.fn());
const logSecurityEventMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/assetIntegrity', () => ({ verifyRuntimeAssetIntegrity: verifyMock }));
vi.mock('../lib/securityEvents', () => ({
  securityEventCodes: { assetIntegrityFailed: 'application.assetIntegrity.failed' },
  logSecurityEvent: logSecurityEventMock,
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

describe('useAssetIntegrity', () => {
  beforeEach(() => {
    verifyMock.mockReset();
    logSecurityEventMock.mockReset();
  });

  it('stays silent after a successful or skipped check', async () => {
    verifyMock.mockResolvedValue({ status: 'verified', assetCount: 4 });
    const onNotify = vi.fn();
    renderHook(() => useAssetIntegrity({ unlocked: true, onNotify }), { wrapper });

    await waitFor(() => expect(verifyMock).toHaveBeenCalledTimes(1));
    expect(onNotify).not.toHaveBeenCalled();
    expect(logSecurityEventMock).not.toHaveBeenCalled();
  });

  it('logs immediately and shows one warning after unlock', async () => {
    verifyMock.mockResolvedValue({ status: 'failed', reason: 'asset-hash-mismatch' });
    const onNotify = vi.fn();
    const { rerender, result } = renderHook(
      ({ unlocked }) => useAssetIntegrity({ unlocked, onNotify }),
      { initialProps: { unlocked: false }, wrapper },
    );

    await waitFor(() => expect(logSecurityEventMock).toHaveBeenCalledWith(
      'application.assetIntegrity.failed',
      expect.any(String),
      'critical',
      { reason: 'asset-hash-mismatch' },
    ));
    expect(onNotify).not.toHaveBeenCalled();
    expect(result.current.failureReason).toBe('asset-hash-mismatch');

    rerender({ unlocked: true });
    await waitFor(() => expect(onNotify).toHaveBeenCalledTimes(1));
    expect(onNotify).toHaveBeenCalledWith(expect.objectContaining({ type: 'danger' }));

    rerender({ unlocked: false });
    rerender({ unlocked: true });
    expect(onNotify).toHaveBeenCalledTimes(1);
  });
});