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

export type ViewDensity = 'comfortable' | 'compact';

interface VaultListItemProps {
  item: VaultItem;
  isSelected: boolean;
  onSelect: (item: VaultItem) => void;
  autofillRecommended?: boolean;
  /** Optional match metadata — when present, matched field text is highlighted. */
  match?: FuzzyScore | null;
  /** View density: 'comfortable' (default) or 'compact' for high-density scanning. */
  density?: ViewDensity;
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
  density = 'comfortable',
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

  const isCompact = density === 'compact';

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
      className={`group rounded-lg border flex items-center cursor-pointer transition-all w-full min-w-0 max-w-full overflow-hidden ${
        isCompact ? 'p-1.5 gap-2 text-xs' : 'p-3 gap-3'
      } ${
        isDragging ? 'opacity-40 scale-[0.98]' : ''
      } ${
        isSelected
          ? 'border-brand-primary/25 bg-brand-primary/10'
          : 'border-transparent hover:border-outline-variant/15 hover:bg-surface-high/80'
      }`}
    >
      {/* Icon / Platform Logo */}
      <div
        className={`rounded-lg bg-surface-low flex items-center justify-center border border-outline-variant/20 shrink-0 overflow-hidden ${
          isCompact ? 'w-7 h-7 rounded-md' : 'w-10 h-10 rounded-lg'
        }`}
      >
        {logoUrl ? (
          <img
            alt={`${item.title} logo`}
            className={`${isCompact ? 'w-5 h-5' : 'w-7 h-7'} object-contain`}
            referrerPolicy="no-referrer"
            src={logoUrl}
          />
        ) : (
          <span
            className={`font-display font-bold text-brand-primary ${
              isCompact ? 'text-xs' : 'text-base'
            }`}
          >
            {item.title.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Main Info */}
      <div className="flex-1 min-w-0">
        {isCompact ? (
          // Compact single-line row: Title + Username together
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-bold text-xs text-on-surface truncate shrink-0 max-w-[140px] sm:max-w-[200px] leading-tight">
              {showTitleHighlight ? (
                <SearchHighlight
                  text={item.title}
                  matchStart={match?.matchStart ?? -1}
                  matchEnd={match?.matchEnd ?? -1}
                  query={highlightQuery}
                />
              ) : (
                item.title
              )}
            </h3>
            {item.username && (
              <span className="text-on-surface-variant/70 text-[11px] truncate font-mono">
                • {showUsernameHighlight ? (
                  <SearchHighlight
                    text={item.username}
                    matchStart={match?.matchStart ?? -1}
                    matchEnd={match?.matchEnd ?? -1}
                    query={highlightQuery}
                  />
                ) : (
                  item.username
                )}
              </span>
            )}
          </div>
        ) : (
          // Comfortable multi-line row
          <>
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
          </>
        )}
      </div>

      {/* Right side Badges & Strength indicator */}
      <div className={`shrink-0 flex items-center ${isCompact ? 'gap-1.5' : 'flex-col items-end gap-1.5'}`}>
        {autofillRecommended && (
          <span
            data-testid="autofill-recommended-badge"
            className="inline-flex items-center gap-1 rounded-md border border-brand-primary/20 bg-brand-primary/10 px-1.5 py-0.5 text-[8px] font-bold text-brand-primary"
            title={t('autofill.recommended')}
          >
            <Sparkles className="h-2.5 w-2.5" />
            {!isCompact && <span>{t('autofill.recommended')}</span>}
          </span>
        )}
        {item.favorite && <Heart className="w-3 h-3 fill-red-500 text-red-500 shrink-0" />}
        <span
          className={`px-1.5 py-0.5 rounded-full text-[8px] sm:text-[9px] font-bold tracking-wider ${itemStrength.colorClass}`}
        >
          {t(strengthLabelKeys[itemStrength.label])}
        </span>
      </div>
    </div>
  );
}

// Memoize VaultListItem to prevent unnecessary re-renders on large list imports (600+ items).
// Only re-renders if item, isSelected, density, or onSelect actually change.
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
    prevProps.density === nextProps.density &&
    prevProps.autofillRecommended === nextProps.autofillRecommended &&
    prevProps.onSelect === nextProps.onSelect &&
    (prevProps.match?.score ?? 0) === (nextProps.match?.score ?? 0) &&
    prevProps.match?.matchedField === nextProps.match?.matchedField &&
    prevProps.match?.matchStart === nextProps.match?.matchStart &&
    prevProps.match?.matchEnd === nextProps.match?.matchEnd
  );
});
