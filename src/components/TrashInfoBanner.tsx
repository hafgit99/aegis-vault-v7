import { AlertTriangle } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';

export default function TrashInfoBanner() {
  const { t } = useLanguage();

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-2xl p-4 flex gap-3 text-xs text-yellow-400">
      <AlertTriangle className="w-5 h-5 shrink-0" />
      <div>
        <p className="font-bold mb-1">{t('trash.info.title')}</p>
        <p className="leading-relaxed opacity-90">
          {t('trash.info.description')}
        </p>
      </div>
    </div>
  );
}
