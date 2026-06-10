import { Clock } from 'lucide-react';
import React from 'react';

import { VaultItem } from '../types';
import RecentVaultItem from './RecentVaultItem';

interface RecentVaultPanelProps {
  items: VaultItem[];
  copiedField: string | null;
  onSelect: (item: VaultItem) => void;
  onCopyText: (text: string, field: string) => void;
}

export default function RecentVaultPanel({ items, copiedField, onSelect, onCopyText }: RecentVaultPanelProps) {
  const recentItems = items.slice(-3).slice().reverse();

  return (
    <div className="bg-[#101210]/60 border border-outline-variant/15 rounded-2xl p-6 flex flex-col justify-between gap-4">
      <div>
        <div className="flex items-center justify-between border-b border-outline-variant/10 pb-3 mb-3">
          <h3 className="font-display text-xs font-bold uppercase tracking-widest text-[#059669] flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-primary" />
            <span>Son Eklenen Parolalar</span>
          </h3>
          <span className="text-[10px] text-on-surface-variant font-mono">Hızlı Erişim</span>
        </div>
        <div className="space-y-2.5">
          {items.length === 0 ? (
            <p className="text-xs text-on-surface-variant/40 italic py-4 text-center">Henüz kayıtlı parola bulunmuyor.</p>
          ) : (
            recentItems.map((item) => (
              <React.Fragment key={item.id}>
                <RecentVaultItem item={item} copiedField={copiedField} onSelect={onSelect} onCopyText={onCopyText} />
              </React.Fragment>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
