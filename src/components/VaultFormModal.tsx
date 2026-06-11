/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Wand2, 
  Shield, 
  User, 
  Globe, 
  KeyRound, 
  StickyNote, 
  Lock, 
  Eye, 
  EyeOff, 
  CreditCard, 
  Fingerprint, 
  FileText, 
  UploadCloud, 
  File, 
  Trash2, 
  Download, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2, 
  Sparkles,
  Calendar,
  Layers,
  Sparkle
} from 'lucide-react';
import { AppNotification, VaultItem } from '../types';
import { generatePassword } from '../lib/security';
import { saveAttachment, getAttachmentBlob } from '../lib/attachments';
import { secureRandomIndex, secureRandomToken } from '../lib/random';
import { formatFileSize } from '../lib/display';
import { useLanguage } from '../i18n/LanguageContext';

interface VaultFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: VaultItem) => void | Promise<void>;
  editingItem: VaultItem | null;
  onNotify?: (notification: AppNotification) => void;
}

export default function VaultFormModal({ isOpen, onClose, onSave, editingItem, onNotify }: VaultFormModalProps) {
  const { t } = useLanguage();

  // Category Selector Strategy
  const [category, setCategory] = useState<'login' | 'card' | 'passkey' | 'identity' | 'secure_note'>('login');
  
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

  // Synchronize state when edit selection changes
  useEffect(() => {
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
    }
    // Always clear selected temporary files and error messages on reopen
    setSelectedFile(null);
    setIsUploading(false);
    setUploadProgress(0);
    setErrorMessage(null);
  }, [editingItem, isOpen, t]);

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
      handleFileSelected(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelected(files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    setErrorMessage(null);
    // Limit to 250MB
    const limit = 250 * 1024 * 1024;
    if (file.size > limit) {
      setErrorMessage('Hata: Seçtiğiniz dosya boyutu 250MB sınırını aşmaktadır. Lütfen daha küçük bir dosya seçin.');
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
          title: 'Eklenti Bulunamadı',
          message: 'Eklenti bulunamadı veya yerel veritabanında silinmiş.',
          type: 'warning',
        });
      }
    } catch (e) {
      console.error(e);
      onNotify?.({
        title: 'Dosya Açılamadı',
        message: 'Dosya şifresi çözülürken bir hata oluştu.',
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
        setErrorMessage('Dosya askeri düzey kütüphane ile yerel şifrelenirken bir hata oluştu.');
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
      createdAt: editingItem?.createdAt || new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
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
    };

    onSave(itemData);
    setIsUploading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md overflow-y-auto select-none">
      <div className="w-full max-w-2xl bg-surface-container border border-outline-variant/30 rounded-2xl overflow-hidden custom-shadow my-8 relative">
        
        {/* Header styling streak */}
        <div className="absolute top-0 left-0 w-full h-1 bg-brand-primary" />

        {/* Form Modal Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-outline-variant/10 bg-[#0c0d0c]/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary">
              <Layers className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-on-surface">
                {editingItem ? t('vaultForm.title.edit') : t('vaultForm.title.create')}
              </h3>
              <p className="text-[10px] text-on-surface-variant leading-relaxed">{t('vaultForm.subtitle')}</p>
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

        {/* Tab Selection Row for 5 Distinct Categories */}
        <div className="px-6 py-3 border-b border-outline-variant/5 bg-[#090a09]/30 grid grid-cols-5 gap-1.5 sm:gap-2">
          
          <button
            type="button"
            onClick={() => setCategory('login')}
            className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 border transition-all text-center cursor-pointer ${
              category === 'login'
                ? 'bg-brand-primary/10 border-brand-primary/30 text-brand-primary text-xs font-bold'
                : 'bg-transparent border-transparent text-on-surface-variant/70 hover:text-on-surface hover:bg-[#151715]/40 text-xs'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span className="text-[9px] sm:text-[10px] font-sans">{t('vaultForm.category.login')}</span>
          </button>

          <button
            type="button"
            onClick={() => setCategory('card')}
            className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 border transition-all text-center cursor-pointer ${
              category === 'card'
                ? 'bg-brand-primary/10 border-brand-primary/30 text-brand-primary text-xs font-bold'
                : 'bg-transparent border-transparent text-on-surface-variant/70 hover:text-on-surface hover:bg-[#151715]/40 text-xs'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span className="text-[9px] sm:text-[10px] font-sans">{t('vaultForm.category.card')}</span>
          </button>

          <button
            type="button"
            onClick={() => setCategory('passkey')}
            className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 border transition-all text-center cursor-pointer ${
              category === 'passkey'
                ? 'bg-brand-primary/10 border-brand-primary/30 text-brand-primary text-xs font-bold'
                : 'bg-transparent border-transparent text-on-surface-variant/70 hover:text-on-surface hover:bg-[#151715]/40 text-xs'
            }`}
          >
            <Fingerprint className="w-4 h-4" />
            <span className="text-[9px] sm:text-[10px] font-sans">{t('vaultForm.category.passkey')}</span>
          </button>

          <button
            type="button"
            onClick={() => setCategory('identity')}
            className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 border transition-all text-center cursor-pointer ${
              category === 'identity'
                ? 'bg-brand-primary/10 border-brand-primary/30 text-brand-primary text-xs font-bold'
                : 'bg-transparent border-transparent text-on-surface-variant/70 hover:text-on-surface hover:bg-[#151715]/40 text-xs'
            }`}
          >
            <User className="w-4 h-4" />
            <span className="text-[9px] sm:text-[10px] font-sans">{t('vaultForm.category.identity')}</span>
          </button>

          <button
            type="button"
            onClick={() => setCategory('secure_note')}
            className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 border transition-all text-center cursor-pointer ${
              category === 'secure_note'
                ? 'bg-brand-primary/10 border-brand-primary/30 text-brand-primary text-xs font-bold'
                : 'bg-transparent border-transparent text-on-surface-variant/70 hover:text-on-surface hover:bg-[#151715]/40 text-xs'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span className="text-[9px] sm:text-[10px] font-sans">{t('vaultForm.category.secureNote')}</span>
          </button>

        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3.5 bg-brand-error/10 border border-brand-error/20 rounded-xl flex items-start gap-3 text-brand-error text-xs">
            <AlertTriangle className="w-4.5 h-4.5 shrink-0 text-red-400 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-6">

          {/* COMMON GENERAL TITLE (REQUIRED FOR ALL TYPES) */}
          <div className="bg-[#121412]/50 p-4 rounded-xl border border-outline-variant/10 space-y-4">
            <h4 className="text-[10px] font-bold text-brand-primary tracking-widest uppercase flex items-center gap-1.5">
              <Sparkle className="w-3.5 h-3.5 fill-current" />
              <span>{t('vaultForm.general.title')}</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
                  {t('vaultForm.field.title')}
                </label>
                <div className="relative">
                  <Shield className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
                  <input
                    data-testid="vault-item-title-input"
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-[#161816] hover:bg-[#1c1e1c] focus:bg-[#1e201e] border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-semibold"
                    placeholder={t('vaultForm.placeholder.title')}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
                  {t('vaultForm.field.url')}
                </label>
                <div className="relative">
                  <Globe className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
                  <input
                    data-testid="vault-item-url-input"
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full bg-[#161816] hover:bg-[#1c1e1c] focus:bg-[#1e201e] border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-mono"
                    placeholder={t('vaultForm.placeholder.url')}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* DYNAMIC VIEW CATEGORY 1: GİRİŞ BİLGİLERİ (LOGIN) */}
          {category === 'login' && (
            <div className="space-y-4 animate-fade-in text-left">
              <div className="border-l-2 border-brand-primary pl-3.5 py-0.5">
                <h4 className="text-xs font-bold text-on-surface">{t('vaultForm.login.title')}</h4>
                <p className="text-[10px] text-on-surface-variant">{t('vaultForm.login.description')}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
                    {t('vaultForm.login.username')}
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
                    <input
                      data-testid="vault-item-username-input"
                      type="text"
                      required={category === 'login'}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-[#161816] hover:bg-[#1c1e1c] focus:bg-[#1e201e] border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface"
                      placeholder={t('vaultForm.login.usernamePlaceholder')}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5 flex justify-between items-center">
                    <span>{t('vaultForm.login.password')}</span>
                    <button
                      type="button"
                      onClick={handleAutoGenerate}
                      className="text-[9px] text-brand-primary hover:underline flex items-center gap-0.5"
                    >
                      <Wand2 className="w-3 h-3" />
                      <span>{t('vaultForm.login.generateStrong')}</span>
                    </button>
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
                    <input
                      data-testid="vault-item-password-input"
                      type={isPasswordVisible ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-[#161816] hover:bg-[#1c1e1c] focus:bg-[#1e201e] border border-outline-variant/20 rounded-xl pl-9 pr-20 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-mono"
                      placeholder={t('vaultForm.login.passwordPlaceholder')}
                    />
                    <div className="absolute right-3 top-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                        className="text-on-surface-variant hover:text-brand-primary transition-colors p-1.5"
                        title={isPasswordVisible ? t('vaultForm.login.hide') : t('vaultForm.login.show')}
                      >
                        {isPasswordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={handleAutoGenerate}
                        className="text-on-surface-variant hover:text-brand-primary transition-colors p-1.5"
                        title={t('vaultForm.login.generatePasswordTitle')}
                      >
                        <Wand2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
                  {t('vaultForm.login.totp')}
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
                  <input
                    type="text"
                    value={totpSecret}
                    onChange={(e) => setTotpSecret(e.target.value)}
                    className="w-full bg-[#161816] hover:bg-[#1c1e1c] focus:bg-[#1e201e] border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface uppercase font-mono"
                    placeholder={t('vaultForm.login.totpPlaceholder')}
                  />
                </div>
              </div>
            </div>
          )}

          {/* DYNAMIC VIEW CATEGORY 2: KREDİ KARTI (CREDIT CARD) */}
          {category === 'card' && (
            <div className="space-y-4 animate-fade-in text-left">
              <div className="border-l-2 border-brand-primary pl-3.5 py-0.5">
                <h4 className="text-xs font-bold text-on-surface">{t('vaultForm.card.title')}</h4>
                <p className="text-[10px] text-on-surface-variant">{t('vaultForm.card.description')}</p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
                  {t('vaultForm.card.cardholder')}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
                  <input
                    type="text"
                    value={cardholderName}
                    onChange={(e) => setCardholderName(e.target.value)}
                    className="w-full bg-[#161816] hover:bg-[#1c1e1c] focus:bg-[#1e201e] border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface"
                    placeholder={t('vaultForm.card.cardholderPlaceholder')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
                    {t('vaultForm.card.number')}
                  </label>
                  <div className="relative">
                    <CreditCard className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      className="w-full bg-[#161816] hover:bg-[#1c1e1c] focus:bg-[#1e201e] border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-mono"
                      placeholder={t('vaultForm.card.numberPlaceholder')}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
                    {t('vaultForm.card.expiry')}
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
                    <input
                      type="text"
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value)}
                      className="w-full bg-[#161816] hover:bg-[#1c1e1c] focus:bg-[#1e201e] border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-mono"
                      placeholder={t('vaultForm.card.expiryPlaceholder')}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
                    {t('vaultForm.card.cvv')}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
                    <input
                      type="password"
                      maxLength={4}
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value)}
                      className="w-full bg-[#161816] hover:bg-[#1c1e1c] focus:bg-[#1e201e] border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-mono"
                      placeholder={t('vaultForm.card.cvvPlaceholder')}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
                    {t('vaultForm.card.pin')}
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
                    <input
                      type="password"
                      maxLength={6}
                      value={cardPin}
                      onChange={(e) => setCardPin(e.target.value)}
                      className="w-full bg-[#161816] hover:bg-[#1c1e1c] focus:bg-[#1e201e] border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-mono"
                      placeholder={t('vaultForm.card.pinPlaceholder')}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DYNAMIC VIEW CATEGORY 3: PASSKEY & API (PASSKEY) */}
          {category === 'passkey' && (
            <div className="space-y-4 animate-fade-in text-left">
              <div className="border-l-2 border-brand-primary pl-3.5 py-0.5">
                <h4 className="text-xs font-bold text-on-surface">{t('vaultForm.passkey.title')}</h4>
                <p className="text-[10px] text-on-surface-variant">{t('vaultForm.passkey.description')}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
                    {t('vaultForm.passkey.service')}
                  </label>
                  <div className="relative">
                    <Fingerprint className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
                    <input
                      type="text"
                      value={passkeyService}
                      onChange={(e) => setPasskeyService(e.target.value)}
                      className="w-full bg-[#161816] hover:bg-[#1c1e1c] focus:bg-[#1e201e] border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface"
                      placeholder={t('vaultForm.passkey.servicePlaceholder')}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
                    {t('vaultForm.passkey.publicId')}
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
                    <input
                      type="text"
                      value={passkeyPublicId}
                      onChange={(e) => setPasskeyPublicId(e.target.value)}
                      className="w-full bg-[#161816] hover:bg-[#1c1e1c] focus:bg-[#1e201e] border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-mono"
                      placeholder={t('vaultForm.passkey.publicIdPlaceholder')}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5 flex justify-between items-center">
                  <span>{t('vaultForm.passkey.privateExponent')}</span>
                  <button
                    type="button"
                    onClick={handleAutoGeneratePrivateExponent}
                    className="text-[9px] text-brand-primary hover:underline flex items-center gap-0.5"
                    title={t('vaultForm.passkey.generateTitle')}
                  >
                    <Wand2 className="w-3 h-3" />
                    <span>{t('vaultForm.passkey.generate')}</span>
                  </button>
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
                  <textarea
                    rows={2}
                    value={passkeyPrivateExponent}
                    onChange={(e) => setPasskeyPrivateExponent(e.target.value)}
                    className="w-full bg-[#161816] hover:bg-[#1c1e1c] focus:bg-[#1e201e] border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-mono resize-none text-[11px]"
                    placeholder={t('vaultForm.passkey.privateExponentPlaceholder')}
                  />
                </div>
              </div>
            </div>
          )}

          {/* DYNAMIC VIEW CATEGORY 4: KİMLİK (IDENTITY) */}
          {category === 'identity' && (
            <div className="space-y-4 animate-fade-in text-left">
              <div className="border-l-2 border-brand-primary pl-3.5 py-0.5">
                <h4 className="text-xs font-bold text-on-surface">{t('vaultForm.identity.title')}</h4>
                <p className="text-[10px] text-on-surface-variant">{t('vaultForm.identity.description')}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
                    {t('vaultForm.identity.documentNumber')}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
                    <input
                      type="text"
                      value={idNumber}
                      onChange={(e) => setIdNumber(e.target.value)}
                      className="w-full bg-[#161816] hover:bg-[#1c1e1c] focus:bg-[#1e201e] border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-semibold font-mono"
                      placeholder={t('vaultForm.identity.documentNumberPlaceholder')}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
                    {t('vaultForm.identity.fullName')}
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
                    <input
                      type="text"
                      value={idFullName}
                      onChange={(e) => setIdFullName(e.target.value)}
                      className="w-full bg-[#161816] hover:bg-[#1c1e1c] focus:bg-[#1e201e] border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-semibold"
                      placeholder={t('vaultForm.identity.fullNamePlaceholder')}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
                    {t('vaultForm.identity.birthDate')}
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
                    <input
                      type="date"
                      value={idBirthDate}
                      onChange={(e) => setIdBirthDate(e.target.value)}
                      className="w-full bg-[#161816] hover:bg-[#1c1e1c] focus:bg-[#1e201e] border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2 px-2 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
                    {t('vaultForm.identity.expiryDate')}
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
                    <input
                      type="date"
                      value={idExpiryDate}
                      onChange={(e) => setIdExpiryDate(e.target.value)}
                      className="w-full bg-[#161816] hover:bg-[#1c1e1c] focus:bg-[#1e201e] border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2 px-2 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
                    {t('vaultForm.identity.gender')}
                  </label>
                  <select
                    value={idGender}
                    onChange={(e) => setIdGender(e.target.value)}
                    className="w-full bg-[#161816] hover:bg-[#1c1e1c] focus:bg-[#1e201e] border border-outline-variant/20 rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface"
                  >
                    <option value="Male">{t('vaultForm.identity.genderMale')}</option>
                    <option value="Female">{t('vaultForm.identity.genderFemale')}</option>
                    <option value="Other">{t('vaultForm.identity.genderOther')}</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* DYNAMIC VIEW CATEGORY 5: GÜVENLİ NOT (SECURE NOTE) */}
          {category === 'secure_note' && (
            <div className="space-y-4 animate-fade-in text-left">
              <div className="border-l-2 border-brand-primary pl-3.5 py-0.5">
                <h4 className="text-xs font-bold text-on-surface">{t('vaultForm.secureNote.title')}</h4>
                <p className="text-[10px] text-on-surface-variant">{t('vaultForm.secureNote.description')}</p>
              </div>
              <p className="text-[11px] text-amber-400">{t('vaultForm.secureNote.warning')}</p>
            </div>
          )}

          {/* SECURE NOTES FIELD (AVAILABLE FOR ALL, RENDERED LARGER FOR SECURE NOTE CATEGORY) */}
          <div className="text-left">
            <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
              {category === 'secure_note' ? t('vaultForm.notes.secureLabel') : t('vaultForm.notes.extraLabel')}
            </label>
            <div className="relative">
              <StickyNote className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
              <textarea
                data-testid="vault-item-notes-input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={category === 'secure_note' ? 8 : 3}
                className="w-full bg-[#161816] hover:bg-[#1c1e1c] focus:bg-[#1e201e] border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface resize-none font-sans leading-relaxed"
                placeholder={category === 'secure_note' ? t('vaultForm.notes.securePlaceholder') : t('vaultForm.notes.extraPlaceholder')}
              />
            </div>
          </div>

          {/* 250MB EMBEDDED MILITARY-GRADE LOCAL FILE ENCRYPTION CONTAINER */}
          <div className="bg-[#101210]/60 p-5 rounded-2xl border border-outline-variant/15 space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-outline-variant/5 pb-2">
              <h4 className="text-[10px] font-bold text-brand-primary tracking-widest uppercase flex items-center gap-2">
                <UploadCloud className="w-4.5 h-4.5 text-brand-primary" />
                <span>Askeri Düzey Dosya Şifreleme (Maks: 250MB)</span>
              </h4>
              <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-0.5 rounded border border-emerald-500/15 font-mono">HTML5 IndexedDB Korumalı</span>
            </div>

            {/* Display status or progress if uploading */}
            {isUploading ? (
              <div className="flex flex-col items-center justify-center py-6 space-y-3 bg-[#0d0d0d] rounded-xl border border-outline-variant/5">
                <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
                <div className="text-center">
                  <p className="text-xs font-bold text-on-surface">Dosya Şifreleniyor & Kilitleniyor...</p>
                  <p className="text-[10px] text-on-surface-variant mt-1">İstemci tarafında AES entegrasyonu yapılıyor...</p>
                </div>
                <div className="w-48 bg-[#181a18] h-1.5 rounded-full overflow-hidden relative">
                  <div 
                    className="bg-brand-primary h-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-brand-primary">%{uploadProgress}</span>
              </div>
            ) : (
              <div className="space-y-4">
                
                {/* 1. Existing Attachment inside Database */}
                {existingAttachment && (
                  <div className="flex items-center justify-between p-3.5 bg-brand-primary/5 hover:bg-brand-primary/10 border border-brand-primary/20 rounded-xl transition-all">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-brand-primary/10 flex items-center justify-center text-brand-primary shrink-0">
                        <File className="w-5 h-5 animate-pulse" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-xs text-on-surface truncate pr-2">{existingAttachment.name}</p>
                        <p className="text-[9px] text-[#059669] font-bold font-mono uppercase flex items-center gap-1 mt-0.5">
                          <span>{formatFileSize(existingAttachment.size)}</span>
                          <span>•</span>
                          <span>AES-GCM ŞİFRELENMİŞ</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDownloadExistingAttachment}
                        className="p-2 bg-[#121412] hover:bg-[#1c1e1c] border border-outline-variant/15 text-brand-primary rounded-lg transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center"
                        title="İndir ve Şifresini Çöz"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveExistingAttachment}
                        className="p-2 bg-[#121412] hover:bg-red-500/10 border border-outline-variant/15 text-red-400 hover:text-red-300 rounded-lg transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center"
                        title="Eki Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. Newly targeted upload file */}
                {selectedFile ? (
                  <div className="flex items-center justify-between p-3.5 bg-brand-secondary/5 border border-brand-secondary/20 rounded-xl animate-fade-in">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                        <File className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-xs text-on-surface truncate pr-2">{selectedFile.name}</p>
                        <p className="text-[10px] text-on-surface-variant font-mono mt-0.5 font-bold flex items-center gap-1">
                          <span>{formatFileSize(selectedFile.size)}</span>
                          <span className="text-brand-primary bg-brand-primary/10 px-1 py-0.2 rounded text-[9px] uppercase">Giriş Hazır</span>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveSelectedFile}
                      className="p-2 bg-[#121412] hover:bg-red-500/10 border border-outline-variant/15 text-red-400 hover:text-red-300 rounded-lg transition-all hover:scale-105 active:scale-95 cursor-pointer"
                      title="Seçimi İptal Et"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  /* 3. Drop Zone Area */
                  !existingAttachment && (
                    <div 
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-outline-variant/20 hover:border-brand-primary/40 bg-[#0d0e0d] hover:bg-[#121412] rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 group"
                    >
                      <input 
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <div className="w-11 h-11 rounded-xl bg-brand-primary/10 border border-brand-primary/15 flex items-center justify-center text-brand-primary mb-3.5 group-hover:scale-110 transition-transform duration-300">
                        <UploadCloud className="w-5.5 h-5.5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-on-surface">Tıklayın veya Dosyayı Sürükleyin</p>
                        <p className="text-[10px] text-on-surface-variant leading-relaxed max-w-xs">
                          PDF, Görsel, Video, Zip vb. tüm dosyalarınızı 250MB sınırına kadar tamamen lokal olarak şifreleyerek ekleyebilirsiniz.
                        </p>
                      </div>
                    </div>
                  )
                )}

              </div>
            )}
          </div>

          {/* Footer Action buttons row */}
          <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant/10 bg-[#0c0d0c]/30 p-6 -mx-6 -mb-6">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-5 py-2.5 bg-[#1b1d1b] hover:bg-[#232623] border border-outline-variant/15 rounded-xl font-bold text-xs text-on-surface transition-colors cursor-pointer focus:outline-none disabled:opacity-50"
            >
              {t('vaultForm.footer.cancel')}
            </button>
            <button
              data-testid="vault-item-save-button"
              type="submit"
              disabled={isUploading}
              className="px-6 py-2.5 bg-brand-primary text-brand-on-primary rounded-xl font-bold text-xs hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-lg shadow-brand-primary/10 flex items-center gap-1.5 focus:outline-none disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('vaultForm.footer.processing')}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{t('vaultForm.footer.save')}</span>
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
