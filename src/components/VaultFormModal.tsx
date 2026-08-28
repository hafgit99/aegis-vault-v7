/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  Layers 
} from 'lucide-react';
import type { AppNotification, TagDefinition, VaultFolder, VaultItem } from '../types';
import { generatePassword } from '../lib/security';
import { saveAttachment, getAttachmentBlob } from '../lib/attachments';
import { secureRandomIndex, secureRandomToken } from '../lib/random';
import { useLanguage } from '../i18n/LanguageContext';
import { VaultFormCategoryTabs, type VaultFormCategory } from './vault-form/VaultFormCategoryTabs';
import { VaultFormGeneralFields } from './vault-form/VaultFormGeneralFields';
import { VaultFormFolderTagsSection } from './vault-form/VaultFormFolderTagsSection';
import { VaultFormLoginFields } from './vault-form/VaultFormLoginFields';
import { VaultFormCardFields } from './vault-form/VaultFormCardFields';
import { VaultFormIdentityFields } from './vault-form/VaultFormIdentityFields';
import { VaultFormPasskeyFields } from './vault-form/VaultFormPasskeyFields';
import { VaultFormNoteFields } from './vault-form/VaultFormNoteFields';
import { VaultFormAttachmentSection } from './vault-form/VaultFormAttachmentSection';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

interface VaultFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: VaultItem) => void | Promise<void>;
  editingItem: VaultItem | null;
  onNotify?: (notification: AppNotification) => void;
  folders?: VaultFolder[];
  tags?: TagDefinition[];
}

export default function VaultFormModal({
  isOpen,
  onClose,
  onSave,
  editingItem,
  onNotify,
  folders = [],
  tags = [],
}: VaultFormModalProps) {
  const { t } = useLanguage();

  // Category Selector Strategy
  const [category, setCategory] = useState<VaultFormCategory>('login');
  
  // Basic & Login States
  const [title, setTitle] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [notes, setNotes] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  // Credit Card States
  const [cardholderName, setCardholderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardPin, setCardPin] = useState('');

  // Identity States
  const [idNumber, setIdNumber] = useState('');
  const [idFullName, setIdFullName] = useState('');
  const [idBirthDate, setIdBirthDate] = useState('');
  const [idExpiryDate, setIdExpiryDate] = useState('');
  const [idGender, setIdGender] = useState('Male');

  // Passkey States
  const [passkeyService, setPasskeyService] = useState('');
  const [passkeyPrivateExponent, setPasskeyPrivateExponent] = useState('');
  const [passkeyPublicId, setPasskeyPublicId] = useState('');

  // 5.3 Tags & Organisation States
  const [folderId, setFolderId] = useState('');
  const [itemTags, setItemTags] = useState<string[]>([]);

  // File Attachment States
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Existing attachment tracking
  const [existingAttachment, setExistingAttachment] = useState<{
    id: string;
    name: string;
    size: number;
    type: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevOpenRef = useRef(false);
  const prevEditingItemRef = useRef<VaultItem | null>(null);

  // Synchronize state only when modal opens or editingItem changes
  useEffect(() => {
    if (!isOpen) {
      prevOpenRef.current = false;
      return;
    }

    const isJustOpening = !prevOpenRef.current && isOpen;
    const isItemChanged = prevEditingItemRef.current !== editingItem;

    if (isJustOpening || isItemChanged) {
      prevOpenRef.current = true;
      prevEditingItemRef.current = editingItem;

      if (editingItem) {
        setCategory(editingItem.category || 'login');
        setTitle(editingItem.title || '');
        setUsername(editingItem.username || '');
        setPassword(editingItem.password || '');
        setUrl(editingItem.url || '');
        setTotpSecret(editingItem.totpSecret || '');
        setNotes(editingItem.notes || '');

        // Cards
        setCardholderName(editingItem.cardholderName || '');
        setCardNumber(editingItem.cardNumber || '');
        setCardExpiry(editingItem.cardExpiry || '');
        setCardCvv(editingItem.cardCvv || '');
        setCardPin(editingItem.cardPin || '');

        // Identity
        setIdNumber(editingItem.idNumber || '');
        setIdFullName(editingItem.idFullName || '');
        setIdBirthDate(editingItem.idBirthDate || '');
        setIdExpiryDate(editingItem.idExpiryDate || '');
        setIdGender(editingItem.idGender || 'Male');

        // Passkey
        setPasskeyService(editingItem.passkeyService || '');
        setPasskeyPrivateExponent(editingItem.passkeyPrivateExponent || '');
        setPasskeyPublicId(editingItem.passkeyPublicId || '');

        // Attachment
        if (editingItem.attachmentId) {
          setExistingAttachment({
            id: editingItem.attachmentId,
            name: editingItem.attachmentName || t('vaultForm.attachment.fallbackName'),
            size: editingItem.attachmentSize || 0,
            type: editingItem.attachmentType || 'application/octet-stream'
          });
        } else {
          setExistingAttachment(null);
        }

        setFolderId(editingItem.folderId || '');
        setItemTags(editingItem.tags || []);
      } else {
        // Clean start for new items
        setCategory('login');
        setTitle('');
        setUsername('');
        setPassword('');
        setUrl('');
        setTotpSecret('');
        setNotes('');

        setCardholderName('');
        setCardNumber('');
        setCardExpiry('');
        setCardCvv('');
        setCardPin('');

        setIdNumber('');
        setIdFullName('');
        setIdBirthDate('');
        setIdExpiryDate('');
        setIdGender('Male');

        setPasskeyService('');
        setPasskeyPrivateExponent('');
        setPasskeyPublicId('');

        setExistingAttachment(null);
        setFolderId('');
        setItemTags([]);
      }

      // Clear selected temporary files and error messages on reopen
      setSelectedFile(null);
      setIsUploading(false);
      setUploadProgress(0);
      setErrorMessage(null);
    }
  }, [editingItem, isOpen]);

  if (!isOpen) return null;

  const handleAutoGenerate = () => {
    const strongPw = generatePassword({
      length: 18,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: true,
    });
    setPassword(strongPw);
  };

  const handleAutoGeneratePrivateExponent = () => {
    const chars = '0123456789ABCDEFabcdef';
    let hex = '';
    for (let i = 0; i < 64; i++) {
      hex += chars[secureRandomIndex(chars.length)];
    }
    setPasskeyPrivateExponent(hex);
  };

  // Handle Drag & Drop behavior
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelected(files[0]!);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelected(files[0]!);
    }
  };

  const handleFileSelected = (file: File) => {
    setErrorMessage(null);
    // Limit to 250MB
    const limit = 250 * 1024 * 1024;
    if (file.size > limit) {
      setErrorMessage(t('vaultForm.attachment.fileTooLarge'));
      return;
    }
    setSelectedFile(file);
  };

  const handleRemoveSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveExistingAttachment = () => {
    setExistingAttachment(null);
  };

  const handleDownloadExistingAttachment = async () => {
    if (!existingAttachment) return;
    try {
      const result = await getAttachmentBlob(existingAttachment.id);
      if (result) {
        const url_dl = URL.createObjectURL(result.blob);
        const link = document.createElement('a');
        link.href = url_dl;
        link.download = result.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url_dl);
      } else {
        onNotify?.({
          title: t('vaultForm.attachment.notFoundTitle'),
          message: t('vaultForm.attachment.notFoundMessage'),
          type: 'warning',
        });
      }
    } catch (e) {
      console.error(e);
      onNotify?.({
        title: t('vaultForm.attachment.openFailedTitle'),
        message: t('vaultForm.attachment.openFailedMessage'),
        type: 'danger',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Dynamic field validation per category
    if (!title.trim()) {
      setErrorMessage(t('vaultForm.validation.titleRequired'));
      return;
    }

    setIsUploading(true);
    let attachmentIdToSave = existingAttachment?.id || undefined;
    let attachmentNameToSave = existingAttachment?.name || undefined;
    let attachmentSizeToSave = existingAttachment?.size || undefined;
    let attachmentTypeToSave = existingAttachment?.type || undefined;

    // Save attachment in IndexedDB if selected
    if (selectedFile) {
      try {
        const newAttachmentId = secureRandomToken(9);
        await saveAttachment(newAttachmentId, selectedFile, (percent) => {
          setUploadProgress(percent);
        });
        attachmentIdToSave = newAttachmentId;
        attachmentNameToSave = selectedFile.name;
        attachmentSizeToSave = selectedFile.size;
        attachmentTypeToSave = selectedFile.type || 'application/octet-stream';
      } catch (err) {
        console.error(err);
        setErrorMessage(t('vaultForm.attachment.encryptFailed'));
        setIsUploading(false);
        return;
      }
    } else if (!existingAttachment) {
      // If user deleted the existing attachment
      attachmentIdToSave = undefined;
      attachmentNameToSave = undefined;
      attachmentSizeToSave = undefined;
      attachmentTypeToSave = undefined;
    }

    const normalizedCardNumber = cardNumber.replace(/\s+/g, '');
    const normalizedPasskeyPublicId = passkeyPublicId.trim();
    const normalizedIdNumber = idNumber.trim();

    // Prepare unified safe schema payload
    const itemData: VaultItem = {
      id: editingItem?.id || '',
      title: title.trim(),
      username: category === 'login'
        ? username.trim()
        : category === 'card'
          ? normalizedCardNumber
          : category === 'passkey'
            ? normalizedPasskeyPublicId
            : normalizedIdNumber,
      password,
      url: url.trim(),
      totpSecret: totpSecret.trim(),
      notes: notes.trim(),
      createdAt: editingItem?.createdAt || (new Date().toISOString().split('T')[0] ?? ''),
      updatedAt: new Date().toISOString().split('T')[0] ?? '',
      category,
      favorite: editingItem?.favorite || false,

      // Card Fields
      cardholderName: cardholderName.trim(),
      cardNumber: normalizedCardNumber,
      cardExpiry: cardExpiry.trim(),
      cardCvv: cardCvv.trim(),
      cardPin: cardPin.trim(),

      // Identity Fields
      idNumber: normalizedIdNumber,
      idFullName: idFullName.trim(),
      idBirthDate: idBirthDate.trim(),
      idExpiryDate: idExpiryDate.trim(),
      idGender,

      // Passkey Fields
      passkeyService: passkeyService.trim(),
      passkeyPrivateExponent: passkeyPrivateExponent.trim(),
      passkeyPublicId: normalizedPasskeyPublicId,

      // Attachments linking
      attachmentId: attachmentIdToSave,
      attachmentName: attachmentNameToSave,
      attachmentSize: attachmentSizeToSave,
      attachmentType: attachmentTypeToSave,

      // 5.3 Tags & Organisation
      folderId: folderId || undefined,
      tags: itemTags.length > 0 ? itemTags : undefined,
    };

    onSave(itemData);
    setIsUploading(false);
    onClose();
  };

  return (
    <Modal open={isOpen} onClose={onClose} zIndex={100} className="safe-modal">
      <div className="w-full max-w-2xl max-h-[calc(100dvh-56px)] sm:max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-24px)] bg-surface-container border border-outline-variant/30 rounded-2xl overflow-hidden custom-shadow relative flex flex-col">
        
        {/* Header styling streak */}
        <div className="absolute top-0 left-0 w-full h-1 bg-brand-primary" />

        {/* Form Modal Header */}
        <div className="flex justify-between items-center px-4 sm:px-6 py-3 sm:py-5 border-b border-outline-variant/10 bg-surface-container/95 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary">
              <Layers className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-on-surface">
                {editingItem ? t('vaultForm.title.edit') : t('vaultForm.title.create')}
              </h3>
              <p className="hidden sm:block text-[10px] text-on-surface-variant leading-relaxed">{t('vaultForm.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            title={t('vaultForm.close')}
            className="p-2 rounded-lg hover:bg-surface-high text-on-surface-variant hover:text-on-surface transition-all cursor-pointer border border-transparent hover:border-outline-variant/20 focus:outline-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <VaultFormCategoryTabs
          category={category}
          onCategoryChange={setCategory}
        />

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="mx-4 sm:mx-6 mt-3 sm:mt-4 p-3.5 bg-brand-error/10 border border-brand-error/20 rounded-xl flex items-start gap-3 text-brand-error text-xs shrink-0">
            <AlertTriangle className="w-4.5 h-4.5 shrink-0 text-red-400 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-4 sm:p-6 space-y-4 sm:space-y-6">

          <VaultFormGeneralFields
            title={title}
            url={url}
            onTitleChange={setTitle}
            onUrlChange={setUrl}
          />

          {/* Folder & Tags Section */}
          <VaultFormFolderTagsSection
            folderId={folderId}
            onFolderIdChange={setFolderId}
            folders={folders}
            itemTags={itemTags}
            onItemTagsChange={setItemTags}
            tags={tags}
          />

          {/* Category-Specific Form Fields */}
          {category === 'login' && (
            <VaultFormLoginFields
              username={username}
              onUsernameChange={setUsername}
              password={password}
              onPasswordChange={setPassword}
              isPasswordVisible={isPasswordVisible}
              onTogglePasswordVisibility={() => setIsPasswordVisible(!isPasswordVisible)}
              onAutoGeneratePassword={handleAutoGenerate}
              totpSecret={totpSecret}
              onTotpSecretChange={setTotpSecret}
            />
          )}

          {category === 'card' && (
            <VaultFormCardFields
              cardholderName={cardholderName}
              onCardholderNameChange={setCardholderName}
              cardNumber={cardNumber}
              onCardNumberChange={setCardNumber}
              cardExpiry={cardExpiry}
              onCardExpiryChange={setCardExpiry}
              cardCvv={cardCvv}
              onCardCvvChange={setCardCvv}
              cardPin={cardPin}
              onCardPinChange={setCardPin}
            />
          )}

          {category === 'passkey' && (
            <VaultFormPasskeyFields
              passkeyService={passkeyService}
              onPasskeyServiceChange={setPasskeyService}
              passkeyPublicId={passkeyPublicId}
              onPasskeyPublicIdChange={setPasskeyPublicId}
              passkeyPrivateExponent={passkeyPrivateExponent}
              onPasskeyPrivateExponentChange={setPasskeyPrivateExponent}
              onAutoGeneratePrivateExponent={handleAutoGeneratePrivateExponent}
            />
          )}

          {category === 'identity' && (
            <VaultFormIdentityFields
              idNumber={idNumber}
              onIdNumberChange={setIdNumber}
              idFullName={idFullName}
              onIdFullNameChange={setIdFullName}
              idBirthDate={idBirthDate}
              onIdBirthDateChange={setIdBirthDate}
              idExpiryDate={idExpiryDate}
              onIdExpiryDateChange={setIdExpiryDate}
              idGender={idGender}
              onIdGenderChange={setIdGender}
            />
          )}

          {/* Secure Notes Section */}
          <VaultFormNoteFields
            category={category}
            notes={notes}
            onNotesChange={setNotes}
          />

          {/* 250MB Embedded File Encryption Section */}
          <VaultFormAttachmentSection
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            existingAttachment={existingAttachment}
            selectedFile={selectedFile}
            fileInputRef={fileInputRef}
            onFileChange={handleFileChange}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onRemoveSelectedFile={handleRemoveSelectedFile}
            onRemoveExistingAttachment={handleRemoveExistingAttachment}
            onDownloadExistingAttachment={handleDownloadExistingAttachment}
          />

          {/* Footer Action buttons row */}
          <div className="sticky bottom-0 z-10 flex justify-end gap-3 pt-3 sm:pt-4 border-t border-outline-variant/10 bg-surface-container/95 p-4 sm:p-6 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 safe-bottom">
            <Button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              variant="secondary"
              size="md"
            >
              {t('vaultForm.footer.cancel')}
            </Button>
            <Button
              data-testid="vault-item-save-button"
              type="submit"
              disabled={isUploading}
              variant="primary"
              size="md"
              loading={isUploading}
            >
              {isUploading ? (
                <span>{t('vaultForm.footer.processing')}</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{t('vaultForm.footer.save')}</span>
                </>
              )}
            </Button>
          </div>

        </form>
      </div>
    </Modal>
  );
}
