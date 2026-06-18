import { ArrowLeft, ShieldCheck, Smartphone } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import { androidAutofillTargetLabel, type AndroidAutofillRequest } from '../lib/androidAutofill';
import { isAndroidAutofillTargetMatch } from '../lib/androidAutofillMatching';
import { VaultItem } from '../types';
import CardDetail from './CardDetail';
import IdentityDetail from './IdentityDetail';
import LoginDetail from './LoginDetail';
import PasskeyDetail from './PasskeyDetail';
import SecureNoteDetail from './SecureNoteDetail';
import VaultItemAttachmentCard from './VaultItemAttachmentCard';
import VaultItemDetailHeader from './VaultItemDetailHeader';
import VaultItemSecurityAssessment from './VaultItemSecurityAssessment';
import VaultItemSideInfo from './VaultItemSideInfo';

interface VaultItemDetailPanelProps {
  item: VaultItem;
  copiedField: string | null;
  score: number;
  isPasswordRevealed: boolean;
  isCardNumberRevealed: boolean;
  isCvvRevealed: boolean;
  isPinRevealed: boolean;
  isPasskeyPrivateExponentRevealed: boolean;
  totpCountdown: number;
  onBackToList: () => void;
  onOpenAudit: () => void;
  onToggleFavorite: (item: VaultItem) => void | Promise<void>;
  onEdit: () => void;
  onDelete: (id: string) => void;
  onToggleReveal: (field: 'password' | 'cardNumber' | 'cardCvv' | 'cardPin' | 'passkeyPrivateExponent') => void;
  onCopyText: (text: string, field: string) => void;
  onDownloadAttachment: (id: string, name: string) => void;
  isAutofillMode?: boolean;
  autofillRequest?: AndroidAutofillRequest | null;
  onApproveAutofill?: (item: VaultItem) => void;
}

export default function VaultItemDetailPanel({
  item,
  copiedField,
  score,
  isPasswordRevealed,
  isCardNumberRevealed,
  isCvvRevealed,
  isPinRevealed,
  isPasskeyPrivateExponentRevealed,
  totpCountdown,
  onBackToList,
  onOpenAudit,
  onToggleFavorite,
  onEdit,
  onDelete,
  onToggleReveal,
  onCopyText,
  onDownloadAttachment,
  isAutofillMode = false,
  autofillRequest = null,
  onApproveAutofill,
}: VaultItemDetailPanelProps) {
  const { t } = useLanguage();
  const canApproveAutofill = isAutofillMode && item.category === 'login' && Boolean(item.password) && Boolean(onApproveAutofill);
  const autofillTargetLabel = androidAutofillTargetLabel(autofillRequest);
  const isAutofillMatch = canApproveAutofill && isAndroidAutofillTargetMatch(item, autofillRequest);

  return (
    <div className="max-w-6xl mx-auto space-y-4 lg:space-y-5">
      <div className="lg:hidden sticky top-0 z-20 -mx-3 px-3 py-2 bg-brand-bg/95 backdrop-blur flex items-center justify-between border-b border-outline-variant/10">
        <button
          onClick={onBackToList}
          className="flex items-center gap-2 text-xs font-bold bg-[#1a1c1a] border border-outline-variant/15 px-3 py-2 rounded-lg text-on-surface hover:text-brand-primary active:scale-95 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-brand-primary" strokeWidth={2.5} />
          <span>{t('detail.mobile.back')}</span>
        </button>
        <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">{t('detail.mobile.title')}</span>
      </div>

      <VaultItemDetailHeader
        item={item}
        copiedField={copiedField}
        onToggleFavorite={onToggleFavorite}
        onEdit={onEdit}
        onCopyText={onCopyText}
        onDelete={onDelete}
      />

      {canApproveAutofill && (
        <div
          data-testid="autofill-approval-panel"
          className="rounded-lg border border-brand-primary/20 bg-brand-primary/10 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3"
        >
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-brand-primary/20 bg-brand-primary/10 text-brand-primary">
              <Smartphone className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-brand-primary">
                {t('autofill.detail.title')}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                {t('autofill.detail.description')}
              </p>
              {autofillTargetLabel && (
                <p className="mt-2 inline-flex max-w-full items-center rounded-md border border-brand-primary/15 bg-[#080a09]/35 px-2 py-1 font-mono text-[10px] text-on-surface truncate">
                  {t('autofill.target.label')}: {autofillTargetLabel}
                </p>
              )}
              {autofillTargetLabel && (
                <p
                  data-testid="autofill-match-status"
                  className={`mt-2 text-[10px] font-bold ${isAutofillMatch ? 'text-brand-primary' : 'text-amber-300'}`}
                >
                  {isAutofillMatch ? t('autofill.match.confirmed') : t('autofill.match.warning')}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            data-testid="autofill-approve-button"
            onClick={() => onApproveAutofill?.(item)}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-brand-primary/25 bg-brand-primary px-4 text-xs font-bold text-[#081008] shadow-lg shadow-brand-primary/10 hover:bg-brand-primary/90 focus:outline-none focus:ring-1 focus:ring-brand-primary/50 active:scale-[0.98] transition-all cursor-pointer"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>{t('autofill.detail.approve')}</span>
          </button>
        </div>
      )}

      <VaultItemSecurityAssessment score={score} onOpenAudit={onOpenAudit} />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 lg:gap-5">
        <div className="space-y-3 sm:space-y-4 min-w-0">
          <LoginDetail
            item={item}
            copiedField={copiedField}
            isPasswordRevealed={isPasswordRevealed}
            totpCountdown={totpCountdown}
            onTogglePasswordReveal={() => onToggleReveal('password')}
            onCopyText={onCopyText}
          />

          <CardDetail
            item={item}
            copiedField={copiedField}
            isCardNumberRevealed={isCardNumberRevealed}
            isCvvRevealed={isCvvRevealed}
            isPinRevealed={isPinRevealed}
            onToggleReveal={onToggleReveal}
            onCopyText={onCopyText}
          />

          <PasskeyDetail
            item={item}
            copiedField={copiedField}
            isPrivateExponentRevealed={isPasskeyPrivateExponentRevealed}
            onToggleReveal={() => onToggleReveal('passkeyPrivateExponent')}
            onCopyText={onCopyText}
          />

          <IdentityDetail item={item} copiedField={copiedField} onCopyText={onCopyText} />

          <SecureNoteDetail item={item} copiedField={copiedField} onCopyText={onCopyText} />

          <VaultItemAttachmentCard item={item} onDownload={onDownloadAttachment} />
        </div>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <VaultItemSideInfo item={item} />
        </div>
      </div>
    </div>
  );
}
