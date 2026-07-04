import { useEffect } from 'react';
import { subscribeToSecurityEvents } from '../lib/securityEvents';
import { useLanguage } from '../i18n/LanguageContext';
import { AppNotification } from '../types';

interface UseAirgapAlertsProps {
  unlocked: boolean;
  onNotify: (notification: AppNotification) => void;
}

export function useAirgapAlerts({ unlocked, onNotify }: UseAirgapAlertsProps) {
  const { t } = useLanguage();

  useEffect(() => {
    if (!unlocked) return;

    const unsubscribe = subscribeToSecurityEvents((event) => {
      onNotify({
        title: t('airgap.toast.title'),
        message: t('airgap.toast.message').replace('{url}', event.url),
        type: 'danger',
      });
    });

    return unsubscribe;
  }, [unlocked, onNotify, t]);
}
