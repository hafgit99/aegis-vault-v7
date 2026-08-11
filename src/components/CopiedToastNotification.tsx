import React from 'react';
import { Check } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface CopiedToastNotificationProps {
  copiedField: string | null;
}

export const CopiedToastNotification: React.FC<CopiedToastNotificationProps> = ({ copiedField }) => {
  const { t } = useLanguage();

  if (!copiedField) return null;

  return (
    <div
      data-testid="copy-toast-notification"
      className="fixed bottom-6 right-6 z-[110] flex items-center gap-2.5 bg-[#1a1c1a] px-4 py-3 rounded-xl border border-brand-primary/10 shadow-2xl animate-fade-in"
    >
      <div className="w-5 h-5 rounded-full bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary">
        <Check className="w-3 h-3" />
      </div>
      <span className="text-xs font-semibold text-on-surface">
        {t('top.copied')}
      </span>
    </div>
  );
};
