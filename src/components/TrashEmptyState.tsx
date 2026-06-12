import { Trash2 } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';

export default function TrashEmptyState() {
  const { t } = useLanguage();

  return (
    <div className="glass-panel rounded-2xl p-12 text-center text-on-surface-variant/50 max-w-lg mx-auto shadow-lg hover:border-brand-primary/10 transition-all duration-300">
      <div className="w-14 h-14 rounded-xl bg-surface-low border border-outline-variant/15 flex items-center justify-center mx-auto mb-5 text-on-surface-variant/40 shadow-inner">
        <Trash2 className="w-6 h-6" />
      </div>
      <h3 className="font-display font-bold text-sm text-on-surface">{t('trash.empty.title')}</h3>
      <p className="text-xs max-w-sm mx-auto mt-2 leading-relaxed text-on-surface-variant">
        {t('trash.empty.description')}
      </p>
    </div>
  );
}
