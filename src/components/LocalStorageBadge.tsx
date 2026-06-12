import { Shield } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';

export default function LocalStorageBadge() {
  const { t } = useLanguage();

  return (
    <div className="hidden md:flex items-center gap-2 px-3 py-1.5 surface-card rounded-lg">
      <Shield className="text-brand-tertiary w-3.5 h-3.5" />
      <span className="font-display font-bold text-[9px] text-brand-tertiary uppercase tracking-wider">
        {t('localStorageBadge.label')}
      </span>
    </div>
  );
}
