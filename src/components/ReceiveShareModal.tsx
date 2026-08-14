/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertTriangle, Eye, EyeOff, KeyRound, User, Globe, StickyNote, Download } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { DecryptedSharePayload } from '../lib/share';
import { VaultItem } from '../types';

interface ReceiveShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  payload: DecryptedSharePayload | null;
  onImport: (item: Partial<VaultItem>) => void | Promise<void>;
}

export default function ReceiveShareModal({ isOpen, onClose, payload, onImport }: ReceiveShareModalProps) {
  const { t } = useLanguage();
  const [isPasswordVisible, setIsPasswordVisible] = useState<boolean>(false);
  const [timeLeftStr, setTimeLeftStr] = useState<string>('');
  const [isExpired, setIsExpired] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !payload) return;

    const updateTimer = () => {
      const remaining = payload.expiresAt - Date.now();
      if (remaining <= 0) {
        setIsExpired(true);
        setTimeLeftStr(t('share.expired') || 'Expired / Süresi Doldu');
      } else {
        setIsExpired(false);
        const mins = Math.ceil(remaining / 60000);
        if (mins > 60) {
          const hrs = Math.floor(mins / 60);
          const remainingMins = mins % 60;
          setTimeLeftStr(`${hrs}s ${remainingMins}d`);
        } else {
          setTimeLeftStr(`${mins}d`);
        }
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 30000); // update every 30s
    return () => clearInterval(interval);
  }, [isOpen, payload, t]);

  if (!isOpen || !payload) return null;

  const handleImport = async () => {
    if (isExpired) return;

    const itemData: Partial<VaultItem> = {
      title: payload.title,
      username: payload.username || '',
      password: payload.password || '',
      url: payload.url || '',
      notes: payload.notes || '',
      category: payload.category || 'login',
      totpSecret: payload.totpSecret || '',
    };

    await onImport(itemData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 backdrop-blur-md overflow-hidden select-none animate-fade-in">
      <div className="w-full max-w-md bg-surface-container border border-outline-variant/30 rounded-2xl overflow-hidden custom-shadow relative flex flex-col mx-4">
        
        {/* Header line */}
        <div className="absolute top-0 left-0 w-full h-1 bg-brand-primary" />

        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-outline-variant/10 bg-[#0c0d0c]/95">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary">
              <Download className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm text-on-surface">
                {t('share.importTitle') || 'Import Shared Item / Paylaşılan Kaydı İçe Aktar'}
              </h3>
              <p className="text-[10px] text-on-surface-variant font-medium">
                {t('share.importSubtitle') || 'A credential has been shared securely.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-surface-high text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer focus:outline-none"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          
          {/* Expiration Banner */}
          {isExpired ? (
            <div className="p-3.5 bg-brand-error/10 border border-brand-error/20 rounded-xl flex items-start gap-3 text-brand-error text-xs text-left animate-fade-in">
              <AlertTriangle className="w-4.5 h-4.5 shrink-0 text-red-400 mt-0.5" />
              <div>
                <p className="font-bold">{t('share.expiredTitle') || 'Share Expired / Paylaşım Süresi Doldu'}</p>
                <p className="text-[10px] opacity-80 mt-0.5">
                  {t('share.expiredDesc') || 'This one-time sharing link has expired and can no longer be decrypted.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-brand-primary/5 border border-brand-primary/15 rounded-xl flex items-center justify-between text-left">
              <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">
                {t('share.timeRemaining') || 'Time Remaining / Kalan Süre'}
              </span>
              <span className="text-xs font-bold text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded border border-brand-primary/20">
                {timeLeftStr}
              </span>
            </div>
          )}

          {/* Credentials Info Panel */}
          <div className="space-y-3 bg-[#101210]/60 p-4 rounded-xl border border-outline-variant/15 text-left">
            
            {/* Title / Category */}
            <div>
              <label className="block text-[9px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-0.5">
                {t('share.fieldTitle') || 'Title / Başlık'}
              </label>
              <div className="text-sm font-bold text-on-surface flex items-center gap-2">
                <span data-testid="receive-share-title-value">{payload.title}</span>
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full border border-brand-primary/20 bg-brand-primary/10 text-brand-primary uppercase">
                  {payload.category}
                </span>
              </div>
            </div>

            {/* Username */}
            {payload.username && (
              <div>
                <label className="block text-[9px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-0.5">
                  {t('share.fieldUsername') || 'Username / Kullanıcı Adı'}
                </label>
                <div className="text-xs text-on-surface flex items-center gap-1.5 font-mono">
                  <User className="w-3.5 h-3.5 text-on-surface-variant/40" />
                  <span data-testid="receive-share-username-value">{payload.username}</span>
                </div>
              </div>
            )}

            {/* Password */}
            {payload.password && (
              <div>
                <label className="block text-[9px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-0.5">
                  {t('share.fieldPassword') || 'Password / Şifre'}
                </label>
                <div className="relative">
                  <KeyRound className="w-3.5 h-3.5 absolute left-0 top-1 text-on-surface-variant/40" />
                  <input
                    type={isPasswordVisible ? 'text' : 'password'}
                    readOnly
                    value={payload.password}
                    className="w-full bg-transparent border-none p-0 pl-5 text-xs text-on-surface font-mono focus:outline-none select-all"
                  />
                  <button
                    type="button"
                    onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                    className="absolute right-0 top-0.5 text-on-surface-variant hover:text-brand-primary p-0.5 focus:outline-none"
                  >
                    {isPasswordVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}

            {/* URL */}
            {payload.url && (
              <div>
                <label className="block text-[9px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-0.5">
                  {t('share.fieldUrl') || 'URL / Web Adresi'}
                </label>
                <div className="text-xs text-on-surface flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-on-surface-variant/40" />
                  <span className="truncate">{payload.url}</span>
                </div>
              </div>
            )}

            {/* Notes */}
            {payload.notes && (
              <div>
                <label className="block text-[9px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-0.5">
                  {t('share.fieldNotes') || 'Notes / Açıklama'}
                </label>
                <div className="text-xs text-on-surface flex items-start gap-1.5 bg-[#000]/10 p-2 rounded border border-outline-variant/5 max-h-24 overflow-y-auto font-sans leading-relaxed">
                  <StickyNote className="w-3.5 h-3.5 text-on-surface-variant/40 mt-0.5 shrink-0" />
                  <span className="whitespace-pre-wrap">{payload.notes}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-outline-variant/10 bg-[#0c0d0c]/95 flex justify-end gap-2.5">
          <button
            data-testid="receive-share-cancel-button"
            onClick={onClose}
            className="px-4 py-2 bg-[#1b1d1b] hover:bg-[#232623] border border-outline-variant/15 rounded-xl font-bold text-xs text-on-surface transition-colors cursor-pointer focus:outline-none"
          >
            {t('share.cancel') || 'Cancel / İptal'}
          </button>
          <button
            data-testid="receive-share-save-button"
            onClick={handleImport}
            disabled={isExpired}
            className="px-5 py-2 bg-brand-primary text-brand-on-primary rounded-xl font-bold text-xs hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-lg shadow-brand-primary/10 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{t('share.importSave') || 'Save to Vault / Kasaya Ekle'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
