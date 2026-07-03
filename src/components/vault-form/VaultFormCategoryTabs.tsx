/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CreditCard, FileText, Fingerprint, KeyRound, User } from 'lucide-react';
import type { TranslationKey } from '../../i18n/translations';

type TFunction = (key: TranslationKey) => string;

export type VaultFormCategory = 'login' | 'card' | 'passkey' | 'identity' | 'secure_note';

interface VaultFormCategoryTabsProps {
  category: VaultFormCategory;
  onCategoryChange: (category: VaultFormCategory) => void;
  t: TFunction;
}

const categoryTabs = [
  { id: 'login', testId: 'vault-item-category-login', labelKey: 'vaultForm.category.login', Icon: KeyRound },
  { id: 'card', testId: 'vault-item-category-card', labelKey: 'vaultForm.category.card', Icon: CreditCard },
  { id: 'passkey', testId: 'vault-item-category-passkey', labelKey: 'vaultForm.category.passkey', Icon: Fingerprint },
  { id: 'identity', testId: 'vault-item-category-identity', labelKey: 'vaultForm.category.identity', Icon: User },
  { id: 'secure_note', testId: 'vault-item-category-secure-note', labelKey: 'vaultForm.category.secureNote', Icon: FileText },
] as const;

export function VaultFormCategoryTabs({ category, onCategoryChange, t }: VaultFormCategoryTabsProps) {
  return (
    <div className="px-3 sm:px-6 py-2 sm:py-3 border-b border-outline-variant/5 bg-[#090a09]/95 shrink-0 overflow-x-auto scrollbar-hide">
      <div data-testid="vault-item-category-tabs" className="grid grid-cols-5 gap-1.5 sm:gap-2 min-w-[430px] sm:min-w-0">
        {categoryTabs.map(({ id, testId, labelKey, Icon }) => (
          <button
            key={id}
            data-testid={testId}
            type="button"
            onClick={() => onCategoryChange(id)}
            className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 border transition-all text-center cursor-pointer ${
              category === id
                ? 'bg-brand-primary/10 border-brand-primary/30 text-brand-primary text-xs font-bold'
                : 'bg-transparent border-transparent text-on-surface-variant/70 hover:text-on-surface hover:bg-[#151715]/40 text-xs'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="text-[9px] sm:text-[10px] font-sans">{t(labelKey)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
