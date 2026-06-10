import { Heart } from 'lucide-react';

import { getLogoForPlatform } from '../lib/display';
import { getStrengthLabel } from '../lib/security';
import { VaultItem } from '../types';

interface VaultListItemProps {
  item: VaultItem;
  isSelected: boolean;
  onSelect: (item: VaultItem) => void;
}

export default function VaultListItem({ item, isSelected, onSelect }: VaultListItemProps) {
  const logoUrl = getLogoForPlatform(item.title, item.url);
  const itemStrength = getStrengthLabel(item.password || '');

  return (
    <div
      onClick={() => onSelect(item)}
      className={`group p-4 rounded-xl flex items-center gap-4 cursor-pointer transition-all ${
        isSelected
          ? 'glass-panel border-brand-primary/20 bg-brand-primary/5 hover:translate-y-[-1px]'
          : 'hover:bg-surface-high hover:translate-y-[-1px]'
      }`}
    >
      <div className="w-12 h-12 rounded-lg bg-[#1a1c1a] flex items-center justify-center border border-outline-variant/20 shrink-0 overflow-hidden">
        {logoUrl ? (
          <img
            alt={`${item.title} logo`}
            className="w-8 h-8 object-contain"
            referrerPolicy="no-referrer"
            src={logoUrl}
          />
        ) : (
          <span className="font-display font-bold text-lg text-brand-primary">
            {item.title.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-sm text-on-surface truncate">{item.title}</h3>
        <p className="text-on-surface-variant text-xs truncate font-mono mt-0.5">{item.username}</p>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1.5">
        {item.favorite && <Heart className="w-3.5 h-3.5 fill-red-500 text-red-500 animate-pulse shrink-0" />}
        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider ${itemStrength.colorClass}`}>
          {itemStrength.label}
        </span>
      </div>
    </div>
  );
}
