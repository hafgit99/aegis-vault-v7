import { Heart, Sparkles } from 'lucide-react';
import { memo, useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import { TranslationKey } from '../i18n/translations';
import { getLogoForPlatform } from '../lib/display';
import { getStrengthLabel } from '../lib/security';
import type { FuzzyScore } from '../lib/fuzzySearch';
import { VaultItem } from '../types';
import { resolveTagColor, TAG_PALETTE } from '../lib/tags';
import SearchHighlight from './SearchHighlight';

interface VaultListItemProps {
  item: VaultItem;
  isSelected: boolean;
  onSelect: (item: VaultItem) => void;
  autofillRecommended?: boolean;
  /** Optional match metadata — when present, matched field text is highlighted. */
  match?: FuzzyScore | null;
}

const strengthLabelKeys: Record<ReturnType<typeof getStrengthLabel>['label'], TranslationKey> = {
  WEAK: 'vaultItem.strength.weak',
  MEDIUM: 'vaultItem.strength.medium',
  STRONG: 'vaultItem.strength.strong',
  SECURE: 'vaultItem.strength.secure',
};

function VaultListItemContent({
  item,
  isSelected,
  onSelect,
  autofillRecommended = false,
  match = null,
}: VaultListItemProps) {
  const { t } = useLanguage();
  const [isDragging, setIsDragging] = useState(false);
  const logoUrl = getLogoForPlatform(item.title, item.url);
  const itemStrength = getStrengthLabel(item.password || '');

  // When the user is searching and the match points to title or
  // username, render those fields with a highlight. Other matched
  // fields (url / notes) are still shown but without highlight, to
  // keep the list scannable.
  const showTitleHighlight = Boolean(match && match.matchedField === 'title' && match.score > 0);
  const showUsernameHighlight = Boolean(
    match && match.matchedField === 'username' && match.score > 0,
  );
  const highlightQuery = match && match.score > 0 ? t('top.search.placeholderActive') : undefined;

  return (
    <div
      data-testid="vault-list-item"
      onClick={() => onSelect(item)}
      draggable={true}
      onDragStart={(e) => {
        setIsDragging(true);
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => {
        setIsDragging(false);
      }}
      className={`group p-3 rounded-lg border flex items-center gap-3 cursor-pointer transition-all w-full min-w-0 max-w-full overflow-hidden ${
        isDragging ? 'opacity-40 scale-[0.98]' : ''
      } ${
        isSelected
          ? 'border-brand-primary/25 bg-brand-primary/10'
          : 'border-transparent hover:border-outline-variant/15 hover:bg-surface-high/80'
      }`}
    >
      <div className="w-10 h-10 rounded-lg bg-surface-low flex items-center justify-center border border-outline-variant/20 shrink-0 overflow-hidden">
        {logoUrl ? (
          <img
            alt={`${item.title} logo`}
            className="w-7 h-7 object-contain"
            referrerPolicy="no-referrer"
            src={logoUrl}
          />
        ) : (
          <span className="font-display font-bold text-base text-brand-primary">
            {item.title.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {showTitleHighlight ? (
          <h3 className="font-bold text-sm text-on-surface truncate leading-tight">
            <SearchHighlight
              text={item.title}
              matchStart={match?.matchStart ?? -1}
              matchEnd={match?.matchEnd ?? -1}
              query={highlightQuery}
            />
          </h3>
        ) : (
          <h3 className="font-bold text-sm text-on-surface truncate leading-tight">{item.title}</h3>
        )}
        {showUsernameHighlight ? (
          <p className="text-on-surface-variant text-xs truncate font-mono mt-0.5">
            <SearchHighlight
              text={item.username}
              matchStart={match?.matchStart ?? -1}
              matchEnd={match?.matchEnd ?? -1}
              query={highlightQuery}
            />
          </p>
        ) : (
          <p className="text-on-surface-variant text-xs truncate font-mono mt-0.5">{item.username}</p>
        )}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5" data-testid="item-tag-list">
            {item.tags.map((tag) => {
              const colorKey = resolveTagColor(tag);
              const palette = TAG_PALETTE[colorKey] || TAG_PALETTE.slate;
              return (
                <span
                  key={tag}
                  className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${palette.pill}`}
                >
                  {tag}
                </span>
              );
            })}
          </div>
        )}
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1.5">
        {autofillRecommended && (
          <span
            data-testid="autofill-recommended-badge"
            className="inline-flex items-center gap-1 rounded-md border border-brand-primary/20 bg-brand-primary/10 px-2 py-0.5 text-[9px] font-bold text-brand-primary"
            title={t('autofill.recommended')}
          >
            <Sparkles className="h-3 w-3" />
            <span>{t('autofill.recommended')}</span>
          </span>
        )}
        {item.favorite && <Heart className="w-3.5 h-3.5 fill-red-500 text-red-500 animate-pulse shrink-0" />}
        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider ${itemStrength.colorClass}`}>
          {t(strengthLabelKeys[itemStrength.label])}
        </span>
      </div>
    </div>
  );
}

// Memoize VaultListItem to prevent unnecessary re-renders on large list imports (600+ items).
// Only re-renders if item, isSelected, or onSelect actually change.
export default memo(VaultListItemContent, (prevProps, nextProps) => {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.title === nextProps.item.title &&
    prevProps.item.username === nextProps.item.username &&
    prevProps.item.favorite === nextProps.item.favorite &&
    prevProps.item.password === nextProps.item.password &&
    prevProps.item.folderId === nextProps.item.folderId &&
    JSON.stringify(prevProps.item.tags) === JSON.stringify(nextProps.item.tags) &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.autofillRecommended === nextProps.autofillRecommended &&
    prevProps.onSelect === nextProps.onSelect &&
    (prevProps.match?.score ?? 0) === (nextProps.match?.score ?? 0) &&
    prevProps.match?.matchedField === nextProps.match?.matchedField &&
    prevProps.match?.matchStart === nextProps.match?.matchStart &&
    prevProps.match?.matchEnd === nextProps.match?.matchEnd
  );
});

