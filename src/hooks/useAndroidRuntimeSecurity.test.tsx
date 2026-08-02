// @vitest-environment jsdom

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../i18n/LanguageContext';
import { useAndroidRuntimeSecurity } from './useAndroidRuntimeSecurity';

const getPostureMock = vi.hoisted(() => vi.fn());
const logSecurityEventMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/androidRuntimeSecurity', () => ({
  getAndroidRuntimeSecurityPosture: getPostureMock,
}));

vi.mock('../lib/securityEvents', () => ({
  securityEventCodes: { androidRuntimeRiskDetected: 'android.runtime.riskDetected' },
  logSecurityEvent: logSecurityEventMock,
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

const riskyPosture = {
  releaseBuild: true,
  appDebuggable: false,
  debuggerAttached: false,
  riskDetected: true,
  mode: 'warning-only' as const,
  signals: ['instrumentation' as const],
};

describe('useAndroidRuntimeSecurity', () => {
  beforeEach(() => {
    getPostureMock.mockReset();
    logSecurityEventMock.mockReset();
  });

  it('does not query or notify while the vault is locked', () => {
    const onNotify = vi.fn();
    renderHook(() => useAndroidRuntimeSecurity({ unlocked: false, onNotify }), { wrapper });

    expect(getPostureMock).not.toHaveBeenCalled();
    expect(onNotify).not.toHaveBeenCalled();
  });

  it('stays silent when Android reports no runtime risk', () => {
    getPostureMock.mockReturnValue({ ...riskyPosture, riskDetected: false, signals: [] });
    const onNotify = vi.fn();
    renderHook(() => useAndroidRuntimeSecurity({ unlocked: true, onNotify }), { wrapper });

    expect(onNotify).not.toHaveBeenCalled();
    expect(logSecurityEventMock).not.toHaveBeenCalled();
  });

  it('shows one warning per app session without blocking the vault', async () => {
    getPostureMock.mockReturnValue(riskyPosture);
    const onNotify = vi.fn();
    const { rerender } = renderHook(
      ({ unlocked }) => useAndroidRuntimeSecurity({ unlocked, onNotify }),
      { initialProps: { unlocked: true }, wrapper },
    );

    await waitFor(() => expect(onNotify).toHaveBeenCalledTimes(1));
    expect(onNotify).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' }));
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      'android.runtime.riskDetected',
      expect.any(String),
      'warning',
      { signals: 'instrumentation' },
    );

    rerender({ unlocked: false });
    rerender({ unlocked: true });
    expect(onNotify).toHaveBeenCalledTimes(1);
  });
});