/**
 * @file useSettingsExtensionToken.ts
 * @description Owns the desktop browser-extension pairing-token rotation flow.
 * Extracted from SettingsPanel.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';

import { invoke } from '@tauri-apps/api/core';

export function useSettingsExtensionToken() {
  const [tokenRotateStatus, setTokenRotateStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [tokenRotateMessage, setTokenRotateMessage] = useState<string | null>(null);

  const handleRotateToken = async () => {
    if (!window.__TAURI_INTERNALS__) return;
    setTokenRotateStatus('loading');
    setTokenRotateMessage(null);
    try {
      await invoke('rotate_pairing_token');
      setTokenRotateStatus('success');
      setTokenRotateMessage('Extension token rotated successfully. Reconnect the browser extension.');
      setTimeout(() => { setTokenRotateStatus('idle'); setTokenRotateMessage(null); }, 6000);
    } catch (err: unknown) {
      setTokenRotateStatus('error');
      const message = err instanceof Error ? err.message : String(err);
      setTokenRotateMessage(`Failed to rotate token: ${message}`);
    }
  };

  return {
    tokenRotateStatus,
    tokenRotateMessage,
    handleRotateToken,
  };
}