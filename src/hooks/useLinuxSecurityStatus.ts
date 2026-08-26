import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useLanguage } from '../i18n/LanguageContext';
import type { AppNotification } from '../types';

interface LinuxSecurityStatus {
  is_x11?: boolean;
  wayland_active?: boolean;
}

interface UseLinuxSecurityStatusProps {
  unlocked: boolean;
  onNotify: (notification: AppNotification) => void;
}

/**
 * Warns the user when the desktop session runs under X11, where the
 * compositor offers no screen-capture protection guarantees.
 */
export function useLinuxSecurityStatus({ unlocked, onNotify }: UseLinuxSecurityStatusProps) {
  const { t } = useLanguage();

  useEffect(() => {
    if (unlocked && typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
      invoke<LinuxSecurityStatus>('get_linux_security_status')
        .then((status) => {
          if (status && status.is_x11) {
            onNotify({
              title: t('security.x11WarningTitle'),
              message: t('security.x11WarningMessage'),
              type: 'warning',
            });
          }
        })
        .catch((err) => {
          console.error('Failed to query Linux security status:', err);
        });
    }
  }, [unlocked, onNotify, t]);
}
