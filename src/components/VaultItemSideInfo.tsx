import { AlertTriangle, Calendar, Clock } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/translations';
import { getPasswordAgeInDays, isUnsecureHttpUrl } from '../lib/security';
import type { VaultItem } from '../types';

interface VaultItemSideInfoProps {
  item: VaultItem;
}

function getCategoryLabelKey(category: VaultItem['category']): TranslationKey {
  switch (category) {
    case 'card':
      return 'detail.category.card';
    case 'passkey':
      return 'detail.category.passkey';
    case 'identity':
      return 'detail.category.identity';
    case 'secure_note':
      return 'detail.category.secureNote';
    case 'login':
    default:
      return 'detail.category.login';
  }
}

export default function VaultItemSideInfo({ item }: VaultItemSideInfoProps) {
  const { t } = useLanguage();

  const passwordAge = (item.category === 'login' || Boolean(item.password))
    ? getPasswordAgeInDays(item.updatedAt || item.createdAt)
    : 0;
  const isHttp = isUnsecureHttpUrl(item.url);

  return (
    <div className="space-y-3 sm:space-y-4 text-left">
      <div className="glass-panel p-4 sm:p-5 rounded-xl space-y-3">
        <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
          {t('detail.side.title')}
        </label>
        <div className="flex justify-between items-center text-xs">
          <span className="text-on-surface-variant">{t('detail.side.created')}</span>
          <span className="text-on-surface font-semibold flex items-center gap-1">
            <Calendar className="w-3 h-3 text-on-surface-variant" />
            <span>{item.createdAt}</span>
          </span>
        </div>
        <div className="flex justify-between items-center text-xs border-t border-outline-variant/10 pt-2.5">
          <span className="text-on-surface-variant">{t('detail.side.updated')}</span>
          <span className="text-on-surface font-semibold flex items-center gap-1">
            <Calendar className="w-3 h-3 text-on-surface-variant" />
            <span>{item.updatedAt}</span>
          </span>
        </div>
        {passwordAge >= 90 && (
          <div className="flex justify-between items-center text-xs border-t border-outline-variant/10 pt-2.5">
            <span className="text-on-surface-variant flex items-center gap-1">
              <Clock className="w-3 h-3 text-amber-400" />
              <span>{t('vault.item.oldPasswordNotice')}</span>
            </span>
            <span
              data-testid="sideinfo-password-age-badge"
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                passwordAge >= 180
                  ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                  : 'bg-amber-500/15 text-amber-300 border border-amber-500/20'
              }`}
            >
              {passwordAge >= 180 ? t('passwordAge.warning180') : t('passwordAge.warning90')}
            </span>
          </div>
        )}
        <div className="flex justify-between items-center text-xs border-t border-outline-variant/10 pt-2.5">
          <span className="text-on-surface-variant">{t('detail.side.category')}</span>
          <span className="text-brand-secondary font-bold md:text-[11px]">{t(getCategoryLabelKey(item.category))}</span>
        </div>
        {isHttp && (
          <div
            data-testid="sideinfo-http-warning"
            className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs border-t mt-1"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <div className="space-y-0.5">
              <p className="font-semibold text-[11px]">{t('security.httpWarning')}</p>
              <p className="text-[10px] text-amber-200/80 leading-normal">{t('security.httpWarningDesc')}</p>
            </div>
          </div>
        )}
      </div>

      {item.category !== 'secure_note' && (
        <div className="bg-surface-high p-4 sm:p-5 rounded-xl border border-outline-variant/10 space-y-2">
          <h5 className="font-bold text-xs uppercase tracking-wider text-on-surface">{t('detail.side.notesTitle')}</h5>
          <p className="text-xs text-on-surface-variant italic leading-relaxed break-words whitespace-pre-wrap">
            {item.notes || t('detail.side.emptyNotes')}
          </p>
        </div>
      )}
    </div>
  );
}
