/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Copy, Check, Pin } from 'lucide-react';
import type { VaultItem } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';
import { resolveTagColor } from '../../lib/tags';

export type NoteColor = 'amber' | 'emerald' | 'blue' | 'purple' | 'rose' | 'slate';

export function getNoteColor(item: VaultItem): NoteColor {
  // If item has tags, match tag color or deterministic hash from item ID
  if (item.tags && item.tags.length > 0) {
    const tag = item.tags[0]!;
    const resolved = resolveTagColor(tag);
    if (resolved.includes('amber') || resolved.includes('yellow')) return 'amber';
    if (resolved.includes('emerald') || resolved.includes('green')) return 'emerald';
    if (resolved.includes('blue') || resolved.includes('cyan')) return 'blue';
    if (resolved.includes('purple') || resolved.includes('indigo')) return 'purple';
    if (resolved.includes('rose') || resolved.includes('red')) return 'rose';
  }

  // Hash ID to pick one of the 6 colors
  const charSum = item.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const colors: NoteColor[] = ['amber', 'emerald', 'blue', 'purple', 'rose', 'slate'];
  return colors[charSum % colors.length]!;
}

interface StickyNoteCardProps {
  item: VaultItem;
  isSelected?: boolean;
  onSelect: (item: VaultItem) => void;
  onCopyNote?: (text: string) => void;
}

export function StickyNoteCard({
  item,
  isSelected = false,
  onSelect,
  onCopyNote,
}: StickyNoteCardProps) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const color = useMemo(() => getNoteColor(item), [item]);

  const styleTheme = useMemo(() => {
    switch (color) {
      case 'amber':
        return {
          strip: 'bg-amber-500/80',
          border: 'border-amber-500/30',
          bg: 'bg-gradient-to-b from-[#241a0e] to-[#171107]',
          accent: 'text-amber-400',
          glow: 'group-hover:border-amber-500/50',
          badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        };
      case 'emerald':
        return {
          strip: 'bg-emerald-500/80',
          border: 'border-emerald-500/30',
          bg: 'bg-gradient-to-b from-[#0a2318] to-[#04120b]',
          accent: 'text-emerald-400',
          glow: 'group-hover:border-emerald-500/50',
          badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        };
      case 'blue':
        return {
          strip: 'bg-blue-500/80',
          border: 'border-blue-500/30',
          bg: 'bg-gradient-to-b from-[#0e1e38] to-[#060e1c]',
          accent: 'text-blue-400',
          glow: 'group-hover:border-blue-500/50',
          badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
        };
      case 'purple':
        return {
          strip: 'bg-purple-500/80',
          border: 'border-purple-500/30',
          bg: 'bg-gradient-to-b from-[#240e38] to-[#12051c]',
          accent: 'text-purple-400',
          glow: 'group-hover:border-purple-500/50',
          badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
        };
      case 'rose':
        return {
          strip: 'bg-rose-500/80',
          border: 'border-rose-500/30',
          bg: 'bg-gradient-to-b from-[#330f1a] to-[#1a050c]',
          accent: 'text-rose-400',
          glow: 'group-hover:border-rose-500/50',
          badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
        };
      default:
        return {
          strip: 'bg-slate-500/80',
          border: 'border-slate-500/30',
          bg: 'bg-gradient-to-b from-[#1e232d] to-[#0f1117]',
          accent: 'text-slate-300',
          glow: 'group-hover:border-slate-500/50',
          badge: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
        };
    }
  }, [color]);

  const wordCount = useMemo(() => {
    if (!item.notes) return 0;
    return item.notes.trim().split(/\s+/).filter(Boolean).length;
  }, [item.notes]);

  const charCount = useMemo(() => item.notes?.length || 0, [item.notes]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy = item.notes || '';
    if (onCopyNote) {
      onCopyNote(textToCopy);
    } else {
      navigator.clipboard.writeText(textToCopy);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      data-testid="sticky-note-card"
      onClick={() => onSelect(item)}
      className={`group relative rounded-xl border ${styleTheme.border} ${styleTheme.bg} ${
        styleTheme.glow
      } p-4 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex flex-col justify-between overflow-hidden select-none min-h-[160px] ${
        isSelected ? 'ring-2 ring-brand-primary shadow-brand-primary/20' : ''
      }`}
    >
      {/* Top Tape / Post-it Header Strip */}
      <div
        className={`absolute top-0 left-0 right-0 h-1.5 ${styleTheme.strip} opacity-90 shadow-sm`}
      />

      <div>
        {/* Header: Title & Pin/Copy Buttons */}
        <div className="flex items-start justify-between gap-2 pt-1">
          <div className="flex items-center gap-2 min-w-0">
            <Pin className={`w-3.5 h-3.5 ${styleTheme.accent} shrink-0 rotate-45 opacity-80`} />
            <h4
              data-testid="sticky-note-title"
              className="font-display font-bold text-sm text-on-surface truncate leading-tight"
            >
              {item.title || t('secureNoteDetail.title')}
            </h4>
          </div>

          <button
            type="button"
            data-testid="sticky-note-copy-btn"
            onClick={handleCopy}
            className="p-1 rounded-md text-on-surface-variant/60 hover:text-on-surface hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
            title={t('secureNoteDetail.copy', 'Notu Kopyala')}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-brand-primary" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Note Excerpt Preview */}
        <p
          data-testid="sticky-note-preview"
          className="mt-2.5 text-xs text-on-surface-variant/90 font-mono leading-relaxed line-clamp-4 whitespace-pre-wrap select-none opacity-90"
        >
          {item.notes || t('secureNoteDetail.empty', '(Boş Not)')}
        </p>
      </div>

      {/* Footer: Word count, Char count & Tags */}
      <div className="mt-4 pt-2.5 border-t border-white/5 flex items-center justify-between text-[10px] text-on-surface-variant/60 font-mono">
        <div className="flex items-center gap-2">
          <span>{wordCount} {t('secureNoteDetail.words', 'kelime')}</span>
          <span>•</span>
          <span>{charCount} {t('secureNoteDetail.chars', 'kr')}</span>
        </div>

        {item.tags && item.tags.length > 0 && (
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${styleTheme.badge} truncate max-w-[100px]`}
          >
            #{item.tags[0]}
          </span>
        )}
      </div>
    </div>
  );
}
