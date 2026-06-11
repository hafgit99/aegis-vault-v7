import { useLanguage } from '../i18n/LanguageContext';
import { getLogoForPlatform } from '../lib/display';
import { VaultItem } from '../types';

interface RecentVaultItemProps {
  item: VaultItem;
  copiedField: string | null;
  onSelect: (item: VaultItem) => void;
  onCopyText: (text: string, field: string) => void;
}

export default function RecentVaultItem({ item, copiedField, onSelect, onCopyText }: RecentVaultItemProps) {
  const { t } = useLanguage();
  const logoUrl = getLogoForPlatform(item.title, item.url);
  const usernameCopyField = `recent-user-${item.id}`;
  const passwordCopyField = `recent-pass-${item.id}`;

  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-[#141614]/50 border border-outline-variant/5 hover:border-brand-primary/20 transition-all hover:bg-surface-container/20 group">
      <div className="flex items-center gap-3 cursor-pointer min-w-0 flex-1" onClick={() => onSelect(item)}>
        <div className="w-8 h-8 rounded-lg bg-[#1a1c1a] border border-outline-variant/10 flex items-center justify-center shrink-0 overflow-hidden">
          {logoUrl ? (
            <img alt={item.title} className="w-5 h-5 object-contain" src={logoUrl} referrerPolicy="no-referrer" />
          ) : (
            <span className="font-display font-bold text-xs text-brand-primary">
              {item.title.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-xs text-on-surface group-hover:text-brand-primary transition-colors truncate">
            {item.title}
          </p>
          <p className="text-[10px] text-on-surface-variant font-mono truncate">{item.username}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => onCopyText(item.username, usernameCopyField)}
          className="p-1 px-1.5 rounded bg-[#1a1c1a] border border-outline-variant/10 text-[9px] text-on-surface-variant hover:text-brand-primary hover:bg-brand-primary/5 transition-all font-mono whitespace-nowrap cursor-pointer"
          title={t('vaultItem.copyUsername')}
        >
          {copiedField === usernameCopyField ? '✓' : t('vaultItem.usernameLabel')}
        </button>
        <button
          onClick={() => onCopyText(item.password || '', passwordCopyField)}
          className="p-1 px-1.5 rounded bg-[#1a1c1a] border border-outline-variant/10 text-[9px] text-on-surface-variant hover:text-brand-primary hover:bg-brand-primary/5 transition-all font-mono whitespace-nowrap cursor-pointer"
          title={t('vaultItem.copyPassword')}
        >
          {copiedField === passwordCopyField ? '✓' : t('vaultItem.passwordLabel')}
        </button>
      </div>
    </div>
  );
}
