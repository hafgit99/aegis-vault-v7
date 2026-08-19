import { useMemo } from 'react';

import { scoreMultiField, type FuzzyScore } from '../lib/fuzzySearch';
import type { SmartFolder, VaultFolder, VaultItem } from '../types';
import { runVaultAudit } from '../lib/security';
import type { VaultCategoryFilter, VaultDateRange } from './useVaultFilters';
import { buildContext as buildSmartContext, evaluateSmartFolder } from '../lib/smartFolders';
import { ROOT_FOLDER_ID, subtreeOf } from '../lib/folders';

interface UseVaultQueriesOptions {
  items: VaultItem[];
  searchQuery: string;
  favoritesOnly: boolean;
  selectedCategory: VaultCategoryFilter;
  /** Optional: enable fuzzy / typo-tolerant matching (default: true). */
  fuzzyEnabled?: boolean;
  /** Optional: tags an item must include (all-of, case-insensitive). */
  selectedTags?: string[];
  /** Optional: date range to constrain results by `dateField`. */
  dateRange?: VaultDateRange;
  /** Which timestamp to use for `dateRange` filtering. */
  dateField?: 'createdAt' | 'updatedAt';
  // 5.3 Tags & Organisation
  selectedFolderId?: string | null;
  activeSmartFolderId?: string | null;
  folders?: VaultFolder[];
  smartFolders?: SmartFolder[];
}

export interface FilteredVaultItem {
  item: VaultItem;
  /** Fuzzy match metadata for the active query (null when there is no query). */
  match: FuzzyScore | null;
}

/**
 * Returns true if `value` falls inside the inclusive date range.
 * Strings are compared lexicographically, which is correct for the
 * ISO-8601 format produced by `new Date().toISOString()`.
 */
function isWithinDateRange(value: string, range: VaultDateRange): boolean {
  if (!value) return !range.from && !range.to;
  if (range.from && value < range.from) return false;
  if (range.to && value > range.to) return false;
  return true;
}

export function useVaultQueries({
  items,
  searchQuery,
  favoritesOnly,
  selectedCategory,
  fuzzyEnabled = true,
  selectedTags = [],
  dateRange,
  dateField = 'updatedAt',
  selectedFolderId = null,
  activeSmartFolderId = null,
  folders = [],
  smartFolders = [],
}: UseVaultQueriesOptions) {
  // 1. Memoize item classifications and security audit.
  // This ONLY recalculates when the vault item collection itself changes.
  const auditState = useMemo(() => {
    const activeItems = items.filter((item) => !item.deleted);
    const trashItems = items.filter((item) => item.deleted);
    const favoriteCount = activeItems.filter((item) => item.favorite).length;
    const loginCount = activeItems.filter((item) => item.category === 'login').length;
    const cardCount = activeItems.filter((item) => item.category === 'card').length;
    const secureNoteCount = activeItems.filter((item) => item.category === 'secure_note').length;
    const passkeyCount = activeItems.filter((item) => item.category === 'passkey').length;
    const identityCount = activeItems.filter((item) => item.category === 'identity').length;
    const auditReport = runVaultAudit(activeItems);

    return {
      activeItems,
      trashItems,
      favoriteCount,
      loginCount,
      cardCount,
      secureNoteCount,
      passkeyCount,
      identityCount,
      auditReport,
    };
  }, [items]);

  // 2. Memoize list filtering.
  // This runs on search query inputs, but doesn't waste CPU recalculating the audit report.
  const filteredItems = useMemo<FilteredVaultItem[]>(() => {
    const trimmedQuery = searchQuery.trim();
    const normalisedQuery = trimmedQuery.toLowerCase();
    const hasQuery = trimmedQuery.length > 0;
    const hasTags = selectedTags.length > 0;
    const hasDateRange = !!(dateRange && (dateRange.from || dateRange.to));

    // Resolve folder subtree if we have a folder filter selected.
    let folderIds: Set<string> | null = null;
    if (selectedFolderId && selectedFolderId !== ROOT_FOLDER_ID) {
      folderIds = new Set(subtreeOf(folders, selectedFolderId).map((f) => f.id));
    }

    // Resolve smart folder if one is selected.
    const activeSmartFolder = activeSmartFolderId
      ? smartFolders.find((f) => f.id === activeSmartFolderId)
      : null;
    const smartCtx = activeSmartFolder ? buildSmartContext(auditState.activeItems) : null;

    return auditState.activeItems
      .map<FilteredVaultItem | null>((item) => {
        // 1) Search scoring (exact OR fuzzy).
        let match: FuzzyScore | null = null;
        if (hasQuery) {
          if (fuzzyEnabled) {
            const fuzzy = scoreMultiField(
              [
                { field: 'title', value: item.title },
                { field: 'username', value: item.username },
                { field: 'url', value: item.url },
                { field: 'notes', value: item.notes ?? '' },
              ],
              trimmedQuery,
            );
            if (fuzzy.score > 0) match = fuzzy;
          } else {
            // Strict mode — only exact (case-insensitive) substring hits.
            const inTitle = item.title.toLowerCase().includes(normalisedQuery);
            const inUsername = item.username.toLowerCase().includes(normalisedQuery);
            const inUrl = !!(item.url && item.url.toLowerCase().includes(normalisedQuery));
            const inNotes = !!(item.notes && item.notes.toLowerCase().includes(normalisedQuery));
            if (inTitle || inUsername || inUrl || inNotes) {
              const field: FuzzyScore['matchedField'] = inTitle
                ? 'title'
                : inUsername
                ? 'username'
                : inUrl
                ? 'url'
                : 'notes';
              match = { score: 100, matchStart: -1, matchEnd: -1, matchedField: field };
            }
          }
        }

        // 2) Category filter.
        const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;

        // 3) Tag filter (all-of). The legacy VaultItem has no `tags`
        //    field, so we treat items that don't have tags as failing
        //    the filter when one or more tags are required.
        let matchesTags = true;
        if (hasTags) {
          const itemTags: string[] = Array.isArray((item as VaultItem & { tags?: string[] }).tags)
            ? ((item as VaultItem & { tags?: string[] }).tags as string[]).map((t) =>
                t.toLowerCase(),
              )
            : [];
          matchesTags = selectedTags.every((t) => itemTags.includes(t));
        }

        // 4) Date range filter.
        let matchesDate = true;
        if (hasDateRange) {
          const raw = dateField === 'createdAt' ? item.createdAt : item.updatedAt;
          matchesDate = isWithinDateRange(raw, dateRange!);
        }

        // 5) Folder filter.
        let matchesFolder = true;
        if (selectedFolderId === ROOT_FOLDER_ID) {
          matchesFolder = !item.folderId;
        } else if (selectedFolderId && folderIds) {
          matchesFolder = !!item.folderId && folderIds.has(item.folderId);
        }

        // 6) Smart folder filter.
        let matchesSmartFolder = true;
        if (activeSmartFolder && smartCtx) {
          matchesSmartFolder = evaluateSmartFolder(activeSmartFolder, item, smartCtx);
        }

        const matchesSearch = !hasQuery || match !== null;
        const passesFavorites = !favoritesOnly || item.favorite;

        const accepted =
          matchesSearch &&
          matchesCategory &&
          matchesTags &&
          matchesDate &&
          matchesFolder &&
          matchesSmartFolder &&
          passesFavorites;

        return accepted ? { item, match } : null;
      })
      .filter((value): value is FilteredVaultItem => value !== null)
      // When a query is active, sort by fuzzy score (highest first).
      .sort((a, b) => {
        if (a.match && b.match) return b.match.score - a.match.score;
        if (a.match) return -1;
        if (b.match) return 1;
        return 0;
      });
  }, [
    auditState.activeItems,
    favoritesOnly,
    searchQuery,
    selectedCategory,
    fuzzyEnabled,
    selectedTags,
    dateRange,
    dateField,
    selectedFolderId,
    activeSmartFolderId,
    folders,
    smartFolders,
  ]);

  return {
    activeItems: auditState.activeItems,
    trashItems: auditState.trashItems,
    /** Backwards-compatible list of vault items only (no match info). */
    filteredItems: filteredItems.map((entry) => entry.item),
    /** Item entries enriched with fuzzy match metadata, used for highlighting. */
    filteredItemResults: filteredItems,
    favoriteCount: auditState.favoriteCount,
    loginCount: auditState.loginCount,
    cardCount: auditState.cardCount,
    secureNoteCount: auditState.secureNoteCount,
    passkeyCount: auditState.passkeyCount,
    identityCount: auditState.identityCount,
    auditReport: auditState.auditReport,
  };
}

