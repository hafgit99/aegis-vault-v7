/**
 * @file PasswordHistoryPanel.tsx
 * @description Collapsible panel displaying historical passwords for a vault login item.
 * Capped to the last 3 passwords for the Free tier.
 *
 * @license Apache-2.0
 */

import { Check, ChevronDown, ChevronRight, Copy, Eye, EyeOff, History, Shield } from 'lucide-react';
import { useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import { getPasswordHistory } from '../lib/passwordHistory';
import type { VaultItem } from '../types';

interface PasswordHistoryPanelProps {
  item: VaultItem;
  onCopyText?: (text: string, field: string) => void;
}

export default function PasswordHistoryPanel({ item, onCopyText }: PasswordHistoryPanelProps) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [revealedIndex, setRevealedIndex] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (item.category !== 'login') {
    return null;
  }

  const history = getPasswordHistory(item);

  const handleCopy = async (password: string, index: number) => {
    if (onCopyText) {
      onCopyText(password, `history_password_${index}`);
    } else if (navigator?.clipboard) {
      await navigator.clipboard.writeText(password);
    }
    setCopiedIndex(index);
    setTimeout(() => {
      setCopiedIndex((current) => (current === index ? null : current));
    }, 2000);
  };

  const toggleReveal = (index: number) => {
    setRevealedIndex((current) => (current === index ? null : index));
  };

  return (
    <div
      data-testid="password-history-panel"
      className="glass-panel rounded-xl overflow-hidden border border-outline-variant/15 transition-all text-left"
    >
      <button
        type="button"
        data-testid="password-history-toggle"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between text-left hover:bg-surface-high/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <History className="w-4 h-4 text-brand-primary" />
          <span className="text-xs font-bold uppercase tracking-wider text-on-surface">
            {t('passwordHistory.title')}
          </span>
          <span className="text-[10px] font-mono font-bold bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded-full border border-brand-primary/20">
            {history.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-block text-[10px] text-on-surface-variant font-medium">
            {t('passwordHistory.freeNotice')}
          </span>
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-on-surface-variant" />
          ) : (
            <ChevronRight className="w-4 h-4 text-on-surface-variant" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="px-4 sm:px-5 pb-4 pt-1 space-y-3 border-t border-outline-variant/10 animate-in fade-in-50 duration-200">
          <div className="flex items-center gap-1.5 text-[10px] text-on-surface-variant bg-surface-low/60 p-2 rounded-lg border border-outline-variant/10">
            <Shield className="w-3 h-3 text-brand-primary shrink-0" />
            <span>{t('passwordHistory.freeNotice')}</span>
          </div>

          {history.length === 0 ? (
            <p className="text-xs text-on-surface-variant/50 italic py-2">
              {t('passwordHistory.empty')}
            </p>
          ) : (
            <div className="space-y-2">
              {history.map((entry, index) => {
                const isRevealed = revealedIndex === index;
                const isCopied = copiedIndex === index;
                const formattedDate = entry.changedAt
                  ? (entry.changedAt.split('T')[0] ?? '')
                  : '';

                return (
                  <div
                    key={`${entry.changedAt}-${index}`}
                    data-testid={`password-history-item-${index}`}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-surface-high/60 border border-outline-variant/10 hover:border-outline-variant/20 transition-all text-xs"
                  >
                    <div className="space-y-0.5 min-w-0 pr-2">
                      <span className="block text-[10px] text-on-surface-variant font-mono">
                        {t('passwordHistory.changedAt', { date: formattedDate })}
                      </span>
                      <span className="block font-mono text-xs text-on-surface tracking-wider truncate">
                        {isRevealed ? entry.password : '••••••••••••••••'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        data-testid={`password-history-reveal-${index}`}
                        onClick={() => toggleReveal(index)}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:text-brand-primary hover:bg-[#1a1c1a]/50 transition-colors cursor-pointer"
                        title={isRevealed ? t('loginDetail.hide') : t('loginDetail.show')}
                      >
                        {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        data-testid={`password-history-copy-${index}`}
                        onClick={() => void handleCopy(entry.password, index)}
                        className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                          isCopied
                            ? 'text-brand-tertiary bg-brand-tertiary/15'
                            : 'text-on-surface-variant hover:text-brand-primary hover:bg-[#1a1c1a]/50'
                        }`}
                        title={t('loginDetail.copy')}
                      >
                        {isCopied ? <Check className="w-3.5 h-3.5 text-brand-tertiary" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
