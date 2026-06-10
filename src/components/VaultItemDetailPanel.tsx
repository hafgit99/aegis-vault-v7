import { ArrowLeft } from 'lucide-react';

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
  onToggleFavorite: (item: VaultItem) => void;
  onEdit: () => void;
  onDelete: (id: string) => void;
  onToggleReveal: (field: 'password' | 'cardNumber' | 'cardCvv' | 'cardPin' | 'passkeyPrivateExponent') => void;
  onCopyText: (text: string, field: string) => void;
  onDownloadAttachment: (id: string, name: string) => void;
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
}: VaultItemDetailPanelProps) {
  return (
    <div className="max-w-3xl mx-auto space-y-6 lg:space-y-8">
      <div className="lg:hidden flex items-center justify-between pb-2 border-b border-outline-variant/10 mb-4">
        <button
          onClick={onBackToList}
          className="flex items-center gap-2 text-xs font-bold bg-[#1a1c1a] border border-outline-variant/15 px-3 py-2 rounded-lg text-on-surface hover:text-brand-primary active:scale-95 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-brand-primary" strokeWidth={2.5} />
          <span>Geri Dön</span>
        </button>
        <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">KART DETAYLARI</span>
      </div>

      <VaultItemDetailHeader
        item={item}
        copiedField={copiedField}
        onToggleFavorite={onToggleFavorite}
        onEdit={onEdit}
        onCopyText={onCopyText}
        onDelete={onDelete}
      />

      <VaultItemSecurityAssessment score={score} onOpenAudit={onOpenAudit} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
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

        <VaultItemSideInfo item={item} />
      </div>
    </div>
  );
}
