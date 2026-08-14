import { Check, Copy, Eye, EyeOff } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import { VaultItem } from '../types';

interface CardDetailProps {
  item: VaultItem;
  copiedField: string | null;
  isCardNumberRevealed: boolean;
  isCvvRevealed: boolean;
  isPinRevealed: boolean;
  onToggleReveal: (field: 'cardNumber' | 'cardCvv' | 'cardPin') => void;
  onCopyText: (text: string, field: string) => void;
}

function formatCardNumber(cardNumber?: string): string {
  return (cardNumber || '').replace(/(\d{4})/g, '$1 ').trim();
}

function maskCardNumber(cardNumber?: string): string {
  return '•••• •••• •••• ' + (cardNumber || '').slice(-4);
}

export default function CardDetail({
  item,
  copiedField,
  isCardNumberRevealed,
  isCvvRevealed,
  isPinRevealed,
  onToggleReveal,
  onCopyText,
}: CardDetailProps) {
  const { t } = useLanguage();

  if (item.category !== 'card') return null;

  return (
    <div className="space-y-4">
      <div className="glass-panel p-5 rounded-xl">
        <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
          {t('cardDetail.cardholder')}
        </label>
        <div className="flex items-center justify-between">
          <span data-testid="card-cardholder-value" className="font-bold text-base text-on-surface uppercase">{item.cardholderName || t('cardDetail.unspecified')}</span>
          <button
            onClick={() => onCopyText(item.cardholderName || '', 'cardholderName')}
            className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer ml-2 shrink-0"
            title={t('cardDetail.copy')}
          >
            {copiedField === 'cardholderName' ? (
              <Check className="w-4 h-4 text-brand-tertiary" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      <div className="glass-panel p-5 rounded-xl">
        <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
          {t('cardDetail.cardNumber')}
        </label>
        <div className="flex items-center justify-between">
          <span data-testid="card-number-value" className="font-mono text-base tracking-widest text-on-surface select-all font-semibold">
            {isCardNumberRevealed ? formatCardNumber(item.cardNumber) : maskCardNumber(item.cardNumber)}
          </span>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <button
              data-testid="card-number-reveal-button"
              onClick={() => onToggleReveal('cardNumber')}
              className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer"
              title={isCardNumberRevealed ? t('cardDetail.hide') : t('cardDetail.show')}
            >
              {isCardNumberRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              data-testid="card-number-copy-button"
              onClick={() => onCopyText(item.cardNumber || '', 'cardNumber')}
              className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer"
              title={t('cardDetail.copy')}
            >
              {copiedField === 'cardNumber' ? (
                <Check className="w-4 h-4 text-brand-tertiary" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="glass-panel p-4 rounded-xl">
          <label className="block text-[9px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">
            {t('cardDetail.expiry')}
          </label>
          <div className="flex items-center justify-between">
            <span data-testid="card-expiry-value" className="font-mono font-bold text-sm text-on-surface">{item.cardExpiry || t('cardDetail.expiryFallback')}</span>
            <button onClick={() => onCopyText(item.cardExpiry || '', 'cardExpiry')} className="text-on-surface-variant hover:text-brand-primary transition-colors p-1" title={t('cardDetail.copy')}>
              {copiedField === 'cardExpiry' ? '✓' : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl">
          <label className="block text-[9px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">
            {t('cardDetail.cvv')}
          </label>
          <div className="flex items-center justify-between">
            <span data-testid="card-cvv-value" className="font-mono font-bold text-sm text-on-surface">{isCvvRevealed ? item.cardCvv || '***' : '***'}</span>
            <div className="flex items-center gap-1 shrink-0">
              <button data-testid="card-cvv-reveal-button" onClick={() => onToggleReveal('cardCvv')} className="text-on-surface-variant hover:text-brand-primary p-0.5" title={isCvvRevealed ? t('cardDetail.hide') : t('cardDetail.show')}>
                {isCvvRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button data-testid="card-cvv-copy-button" onClick={() => onCopyText(item.cardCvv || '', 'cardCvv')} className="text-on-surface-variant hover:text-brand-primary p-0.5" title={t('cardDetail.copy')}>
                {copiedField === 'cardCvv' ? '✓' : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl">
          <label className="block text-[9px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">
            {t('cardDetail.pin')}
          </label>
          <div className="flex items-center justify-between">
            <span data-testid="card-pin-value" className="font-mono font-bold text-sm text-on-surface">{isPinRevealed ? item.cardPin || '****' : '****'}</span>
            <div className="flex items-center gap-1 shrink-0">
              <button data-testid="card-pin-reveal-button" onClick={() => onToggleReveal('cardPin')} className="text-on-surface-variant hover:text-brand-primary p-0.5" title={isPinRevealed ? t('cardDetail.hide') : t('cardDetail.show')}>
                {isPinRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button data-testid="card-pin-copy-button" onClick={() => onCopyText(item.cardPin || '', 'cardPin')} className="text-on-surface-variant hover:text-brand-primary p-0.5" title={t('cardDetail.copy')}>
                {copiedField === 'cardPin' ? '✓' : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
