import { useLanguage } from '../i18n/LanguageContext';
import { VaultItem } from '../types';

interface SecureNoteDetailProps {
  item: VaultItem;
  copiedField: string | null;
  onCopyText: (text: string, field: string) => void;
}

export default function SecureNoteDetail({ item, copiedField, onCopyText }: SecureNoteDetailProps) {
  const { t } = useLanguage();

  if (item.category !== 'secure_note') return null;

  return (
    <div className="glass-panel p-5 rounded-xl space-y-4">
      <div className="flex justify-between items-center border-b border-outline-variant/10 pb-2">
        <label className="block text-[10px] font-bold tracking-wider text-brand-secondary uppercase">
          {t('secureNoteDetail.title')}
        </label>
        <button
          onClick={() => onCopyText(item.notes || '', 'secure_notes_copy')}
          className="text-xs text-brand-primary hover:underline hover:brightness-110 flex items-center gap-1 focus:outline-none focus:ring-0"
        >
          {copiedField === 'secure_notes_copy' ? t('secureNoteDetail.copied') : t('secureNoteDetail.copy')}
        </button>
      </div>
      <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap select-all font-mono py-1.5 max-h-96 overflow-y-auto bg-[#131513] p-4 rounded-xl border border-outline-variant/5">
        {item.notes || t('secureNoteDetail.empty')}
      </p>
    </div>
  );
}
