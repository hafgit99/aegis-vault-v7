// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAirgapAlerts } from './useAirgapAlerts';
import { logSecurityEvent, securityEventCodes } from '../lib/securityEvents';
import { LanguageProvider } from '../i18n/LanguageContext';
import React from 'react';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

describe('useAirgapAlerts', () => {
  it('triggers onNotify with a danger alert when a network.blocked event occurs and vault is unlocked', () => {
    const onNotify = vi.fn();
    const { unmount } = renderHook(() => useAirgapAlerts({ unlocked: true, onNotify }), { wrapper });

    logSecurityEvent(
      securityEventCodes.networkBlocked,
      'Blocked outbound network request by air-gap policy.',
      'critical',
      { url: 'https://evil.example.com' }
    );

    expect(onNotify).toHaveBeenCalledTimes(1);
    expect(onNotify).toHaveBeenCalledWith({
      title: 'Ağ İsteği Engellendi',
      message: 'Air-gap politikası tarafından dış ağ isteği engellendi: https://evil.example.com',
      type: 'danger',
    });

    unmount();
  });

  it('does not trigger onNotify when vault is locked', () => {
    const onNotify = vi.fn();
    const { unmount } = renderHook(() => useAirgapAlerts({ unlocked: false, onNotify }), { wrapper });

    logSecurityEvent(
      securityEventCodes.networkBlocked,
      'Blocked outbound network request by air-gap policy.',
      'critical',
      { url: 'https://evil.example.com' }
    );

    expect(onNotify).not.toHaveBeenCalled();

    unmount();
  });
});
