/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Globe, Shield, Sparkle } from 'lucide-react';
import type { TranslationKey } from '../../i18n/translations';

type TFunction = (key: TranslationKey) => string;

interface VaultFormGeneralFieldsProps {
  title: string;
  url: string;
  onTitleChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  t: TFunction;
}

export function VaultFormGeneralFields({
  title,
  url,
  onTitleChange,
  onUrlChange,
  t,
}: VaultFormGeneralFieldsProps) {
  return (
    <div className="bg-surface-low/50 p-3 sm:p-4 rounded-xl border border-outline-variant/10 space-y-4">
      <h4 className="text-[10px] font-bold text-brand-primary tracking-widest uppercase flex items-center gap-1.5">
        <Sparkle className="w-3.5 h-3.5 fill-current" />
        <span>{t('vaultForm.general.title')}</span>
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
            {t('vaultForm.field.title')}
          </label>
          <div className="relative">
            <Shield className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
            <input
              data-testid="vault-item-title-input"
              type="text"
              required
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-semibold"
              placeholder={t('vaultForm.placeholder.title')}
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
            {t('vaultForm.field.url')}
          </label>
          <div className="relative">
            <Globe className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
            <input
              data-testid="vault-item-url-input"
              type="text"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-mono"
              placeholder={t('vaultForm.placeholder.url')}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
