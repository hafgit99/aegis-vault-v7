/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Eye, EyeOff, Copy, Check, Wifi, ShieldCheck } from 'lucide-react';
import { VaultItem } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'troy' | 'generic';

export function detectCardBrand(cardNumber?: string): CardBrand {
  const cleaned = (cardNumber || '').replace(/[\s-]/g, '');
  if (!cleaned) return 'generic';

  if (/^4/.test(cleaned)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(cleaned)) return 'mastercard';
  if (/^3[47]/.test(cleaned)) return 'amex';
  if (/^6(011|5|4[4-9]|22)/.test(cleaned)) return 'discover';
  if (/^9792/.test(cleaned)) return 'troy';

  return 'generic';
}

export function formatCardNumberDisplay(cardNumber?: string): string {
  const cleaned = (cardNumber || '').replace(/[\s-]/g, '');
  if (!cleaned) return '•••• •••• •••• ••••';
  return cleaned.replace(/(\d{4})/g, '$1 ').trim();
}

export function maskCardNumberDisplay(cardNumber?: string): string {
  const cleaned = (cardNumber || '').replace(/[\s-]/g, '');
  if (!cleaned) return '•••• •••• •••• ••••';
  const last4 = cleaned.slice(-4);
  if (cleaned.length <= 4) return cleaned;
  return `•••• •••• •••• ${last4}`;
}

export function formatExpiryDisplay(cardExpiry?: string): string {
  if (!cardExpiry) return '••/••';
  return cardExpiry;
}

interface RealisticCreditCardProps {
  item: VaultItem;
  isRevealed?: boolean;
  isCvvRevealed?: boolean;
  isPinRevealed?: boolean;
  onToggleReveal?: (field: 'cardNumber' | 'cardCvv' | 'cardPin') => void;
  onCopy?: (text: string, field: string) => void;
  compact?: boolean;
}

export function RealisticCreditCard({
  item,
  isRevealed = false,
  isCvvRevealed = false,
  isPinRevealed = false,
  onToggleReveal,
  onCopy,
  compact = false,
}: RealisticCreditCardProps) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState<string | null>(null);

  const brand = useMemo(() => detectCardBrand(item.cardNumber), [item.cardNumber]);

  // Color scheme and gradient theme determined by card brand
  const theme = useMemo(() => {
    switch (brand) {
      case 'visa':
        return {
          bg: 'from-[#0b1b3d] via-[#102a6b] to-[#1e3a8a]',
          border: 'border-blue-500/30',
          accent: 'text-blue-400',
          glow: 'rgba(59, 130, 246, 0.25)',
          brandName: 'VISA',
          chip: 'from-amber-200 via-amber-400 to-amber-600',
        };
      case 'mastercard':
        return {
          bg: 'from-[#2a0e0e] via-[#451a03] to-[#1c1917]',
          border: 'border-orange-500/30',
          accent: 'text-orange-400',
          glow: 'rgba(249, 115, 22, 0.25)',
          brandName: 'Mastercard',
          chip: 'from-amber-100 via-amber-300 to-yellow-600',
        };
      case 'amex':
        return {
          bg: 'from-[#064e3b] via-[#047857] to-[#022c22]',
          border: 'border-emerald-500/30',
          accent: 'text-emerald-300',
          glow: 'rgba(16, 185, 129, 0.25)',
          brandName: 'AMEX',
          chip: 'from-slate-200 via-emerald-200 to-emerald-500',
        };
      case 'troy':
        return {
          bg: 'from-[#450a0a] via-[#7f1d1d] to-[#1c1917]',
          border: 'border-red-500/30',
          accent: 'text-red-400',
          glow: 'rgba(239, 68, 68, 0.25)',
          brandName: 'TROY',
          chip: 'from-amber-200 via-amber-400 to-amber-600',
        };
      case 'discover':
        return {
          bg: 'from-[#3b1500] via-[#7c2d12] to-[#18181b]',
          border: 'border-amber-500/30',
          accent: 'text-amber-400',
          glow: 'rgba(245, 158, 11, 0.25)',
          brandName: 'DISCOVER',
          chip: 'from-amber-200 via-amber-400 to-yellow-500',
        };
      default:
        return {
          bg: 'from-[#121417] via-[#1a202c] to-[#0d1117]',
          border: 'border-brand-primary/30',
          accent: 'text-brand-primary',
          glow: 'rgba(0, 255, 178, 0.2)',
          brandName: 'AEGIS SECURE',
          chip: 'from-amber-200 via-amber-400 to-amber-600',
        };
    }
  }, [brand]);

  const handleCopyField = (text: string, field: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onCopy) {
      onCopy(text, field);
    } else {
      navigator.clipboard.writeText(text);
    }
    setCopied(field);
    setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div
      data-testid="realistic-credit-card"
      className={`relative w-full rounded-2xl p-5 sm:p-6 bg-gradient-to-br ${theme.bg} ${theme.border} border shadow-2xl overflow-hidden select-none cursor-default group hover:scale-[1.01] hover:shadow-cyan-500/10 transition-all duration-300 ${
        compact ? 'max-w-sm aspect-[1.7/1]' : 'max-w-md aspect-[1.586/1]'
      }`}
    >
      {/* Holographic Glare Overlay using pure CSS classes */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-50 group-hover:opacity-80 transition-opacity duration-300" />

      {/* Cyber Grid Substrate Texture */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:16px_16px] opacity-40" />

      {/* Card Header: Chip, NFC & Brand Logo */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Metallic EMV Chip */}
          <div
            data-testid="card-emv-chip"
            className={`w-11 h-8 rounded-md bg-gradient-to-tr ${theme.chip} p-1 shadow-md border border-amber-300/40 relative overflow-hidden flex flex-col justify-between`}
          >
            <div className="w-full h-px bg-amber-900/30" />
            <div className="flex justify-between w-full h-full my-0.5">
              <div className="w-px h-full bg-amber-900/30" />
              <div className="w-2.5 h-2.5 rounded-full border border-amber-900/30 m-auto" />
              <div className="w-px h-full bg-amber-900/30" />
            </div>
            <div className="w-full h-px bg-amber-900/30" />
          </div>

          {/* Contactless / NFC Wave */}
          <Wifi className="w-5 h-5 text-white/60 rotate-90" />
        </div>

        {/* Brand Badge */}
        <div className="flex items-center gap-2">
          {brand === 'mastercard' ? (
            <div className="flex -space-x-2.5">
              <div className="w-6 h-6 rounded-full bg-red-500 opacity-90" />
              <div className="w-6 h-6 rounded-full bg-amber-400 opacity-90" />
            </div>
          ) : brand === 'visa' ? (
            <span className="font-display font-black text-xl italic tracking-wider text-white drop-shadow">
              VISA
            </span>
          ) : brand === 'amex' ? (
            <span className="font-display font-black text-sm bg-blue-600/90 text-white px-2 py-0.5 rounded border border-white/40 tracking-wider">
              AMEX
            </span>
          ) : brand === 'troy' ? (
            <span className="font-display font-black text-base text-red-400 tracking-wider">
              troy
            </span>
          ) : (
            <div className="flex items-center gap-1 text-xs font-bold font-mono text-brand-primary/90 bg-brand-primary/10 px-2 py-0.5 rounded-full border border-brand-primary/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{theme.brandName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Card Body: Embossed Card Number */}
      <div className="relative z-10 mt-6 sm:mt-8">
        <div className="flex items-center justify-between">
          <span
            data-testid="realistic-card-number"
            className="font-mono text-base sm:text-xl font-bold tracking-[0.2em] text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] select-all"
          >
            {isRevealed
              ? formatCardNumberDisplay(item.cardNumber)
              : maskCardNumberDisplay(item.cardNumber)}
          </span>

          <div className="flex items-center gap-1">
            {onToggleReveal && (
              <button
                type="button"
                data-testid="card-reveal-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleReveal('cardNumber');
                }}
                className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title={isRevealed ? t('cardDetail.hide') : t('cardDetail.show')}
              >
                {isRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            )}
            <button
              type="button"
              data-testid="card-copy-number-btn"
              onClick={(e) => handleCopyField(item.cardNumber || '', 'cardNumber', e)}
              className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title={t('cardDetail.copy')}
            >
              {copied === 'cardNumber' ? (
                <Check className="w-4 h-4 text-brand-primary" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Card Footer: Cardholder Name, Expiry Date & CVV */}
      <div className="relative z-10 mt-5 sm:mt-6 flex items-end justify-between text-xs text-white/80">
        {/* Cardholder */}
        <div className="min-w-0 flex-1 pr-4">
          <span className="block text-[9px] uppercase tracking-wider text-white/50 font-medium">
            {t('cardDetail.holder', 'KART SAHİBİ')}
          </span>
          <span
            data-testid="realistic-card-holder"
            className="block font-display font-bold text-xs sm:text-sm text-white uppercase tracking-wider truncate drop-shadow"
          >
            {item.cardholderName || item.title || t('cardDetail.unspecified')}
          </span>
        </div>

        {/* Expiry Date */}
        <div className="shrink-0 text-center px-3">
          <span className="block text-[8px] uppercase tracking-wider text-white/50 font-medium">
            {t('cardDetail.expires', 'SKT')}
          </span>
          <span
            data-testid="realistic-card-expiry"
            className="block font-mono font-bold text-xs sm:text-sm text-white drop-shadow"
          >
            {formatExpiryDisplay(item.cardExpiry)}
          </span>
        </div>

        {/* CVV / Security Code */}
        <div className="shrink-0 text-right pl-2">
          <span className="block text-[8px] uppercase tracking-wider text-white/50 font-medium">
            CVV
          </span>
          <div className="flex items-center gap-1 justify-end">
            <span
              data-testid="realistic-card-cvv"
              className="font-mono font-bold text-xs sm:text-sm text-white drop-shadow"
            >
              {isCvvRevealed ? (item.cardCvv || '•••') : '•••'}
            </span>
            {onToggleReveal && (
              <button
                type="button"
                data-testid="card-toggle-cvv-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleReveal('cardCvv');
                }}
                className="p-0.5 text-white/50 hover:text-white cursor-pointer"
                title={isCvvRevealed ? t('cardDetail.hide') : t('cardDetail.show')}
              >
                {isCvvRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
