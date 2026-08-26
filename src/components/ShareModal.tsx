/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Clock, QrCode, AlertTriangle, Lock } from 'lucide-react';
import QRCode from 'qrcode';
import { useLanguage } from '../i18n/LanguageContext';
import type { VaultItem } from '../types';
import { generateShareUrl, MIN_SHARE_PASSWORD_LENGTH } from '../lib/share';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: VaultItem | null;
}

export default function ShareModal({ isOpen, onClose, item }: ShareModalProps) {
  const { t } = useLanguage();
  const [duration, setDuration] = useState<number>(1); // default 1 hour
  const [sharePassword, setSharePassword] = useState<string>('');
  const [shareUrl, setShareUrl] = useState<string>('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [generated, setGenerated] = useState<boolean>(false);
  const [passwordError, setPasswordError] = useState<string>('');

  // Reset state when modal opens/closes or item changes
  useEffect(() => {
    if (!isOpen) {
      setSharePassword('');
      setShareUrl('');
      setQrCodeDataUrl('');
      setCopied(false);
      setGenerated(false);
      setPasswordError('');
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const handleGenerate = () => {
    if (sharePassword.length < MIN_SHARE_PASSWORD_LENGTH) {
      setPasswordError(t('share.passwordTooShort', `Password must be at least ${MIN_SHARE_PASSWORD_LENGTH} characters.`));
      return;
    }
    setPasswordError('');
    setLoading(true);
    setCopied(false);
    generateShareUrl(item, duration, sharePassword)
      .then((url) => {
        setShareUrl(url);
        return QRCode.toDataURL(url, {
          width: 256,
          margin: 2,
          color: {
            dark: '#101210',
            light: '#ffffff',
          },
        });
      })
      .then((qrData) => {
        setQrCodeDataUrl(qrData);
        setLoading(false);
        setGenerated(true);
      })
      .catch((err) => {
        console.error('Error generating share link:', err);
        setLoading(false);
      });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => console.error('Failed to copy share link:', err));
  };

  return (
    <Modal open={isOpen && Boolean(item)} onClose={onClose} zIndex={110}>
      <div className="w-full max-w-md bg-surface-container border border-outline-variant/30 rounded-2xl overflow-hidden custom-shadow relative flex flex-col mx-4">
        
        {/* Header line */}
        <div className="absolute top-0 left-0 w-full h-1 bg-brand-primary" />

        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-outline-variant/10 bg-[#0c0d0c]/95">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary">
              <QrCode className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm text-on-surface">
                {t('share.title')}
              </h3>
              <p className="text-[10px] text-on-surface-variant font-medium">
                {item.title}
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
          {/* Share Password Input */}
          <div className="space-y-1.5 text-left">
            <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest">
              {t('share.passwordLabel', 'Share Password')}
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant/50" />
              <input
                data-testid="share-modal-password-input"
                type="password"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                data-form-type="other"
                value={sharePassword}
                onChange={(e) => {
                  setSharePassword(e.target.value);
                  setPasswordError('');
                  if (generated) {
                    setGenerated(false);
                    setShareUrl('');
                    setQrCodeDataUrl('');
                  }
                }}
                placeholder={t('share.passwordPlaceholder', 'Enter a password for this share link...')}
                className="w-full bg-[#161816] border border-outline-variant/20 rounded-xl pl-9 pr-3 py-2.5 text-xs text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
              />
            </div>
            {passwordError && (
              <p className="text-[10px] text-red-400 font-medium">{passwordError}</p>
            )}
            <p className="text-[9px] text-on-surface-variant/60 leading-relaxed">
              {t('share.passwordHelp', 'The recipient will need this password to decrypt the shared item. Share it through a separate secure channel.')}
            </p>
          </div>

          {/* Expiration Selection */}
          <div className="space-y-1.5 text-left">
            <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest">
              {t('share.durationLabel')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setDuration(1); if (generated) { setGenerated(false); setShareUrl(''); setQrCodeDataUrl(''); } }}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  duration === 1
                    ? 'border-brand-primary/30 bg-brand-primary/15 text-brand-primary'
                    : 'border-outline-variant/20 bg-surface-low text-on-surface-variant hover:bg-surface-high'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>1 {t('share.hour')}</span>
              </button>
              <button
                type="button"
                onClick={() => { setDuration(24); if (generated) { setGenerated(false); setShareUrl(''); setQrCodeDataUrl(''); } }}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  duration === 24
                    ? 'border-brand-primary/30 bg-brand-primary/15 text-brand-primary'
                    : 'border-outline-variant/20 bg-surface-low text-on-surface-variant hover:bg-surface-high'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>24 {t('share.hours')}</span>
              </button>
            </div>
          </div>

          {/* Generate Button */}
          {!generated && (
            <Button
              data-testid="share-modal-generate-button"
              onClick={handleGenerate}
              variant="primary"
              size="md"
              className="w-full"
              disabled={loading || sharePassword.length < MIN_SHARE_PASSWORD_LENGTH}
            >
              {loading ? t('share.generating') : t('share.generateButton', 'Generate Secure Link')}
            </Button>
          )}

          {/* QR Code Container — only shown after generation */}
          {generated && (
            <>
              <div className="bg-[#101210]/60 p-4 rounded-xl border border-outline-variant/15 flex flex-col items-center justify-center">
                {qrCodeDataUrl && (
                  <div className="p-2 bg-white rounded-lg shadow-inner overflow-hidden animate-scale-in">
                    <img
                      src={qrCodeDataUrl}
                      alt={t('share.qrAlt')}
                      className="w-44 h-44 object-contain select-none"
                      draggable={false}
                    />
                  </div>
                )}
                <p className="text-[10px] text-on-surface-variant/70 text-center mt-3 leading-relaxed max-w-[280px]">
                  {t('share.scanHelp')}
                </p>
              </div>

              {/* Security Banner */}
              <div className="p-3 bg-brand-primary/5 border border-brand-primary/15 rounded-xl flex items-start gap-2.5 text-left">
                <AlertTriangle className="w-4.5 h-4.5 text-brand-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold text-brand-primary uppercase tracking-wider">
                    {t('share.securityTitle')}
                  </h4>
                  <p className="text-[9px] text-on-surface-variant leading-relaxed">
                    {t('share.securityDesc')}
                  </p>
                  <p className="text-[9px] text-amber-400/90 font-medium leading-relaxed pt-0.5">
                    {t('share.passwordShareWarning', 'Share the password through a separate secure channel (e.g., in person, phone call, or encrypted message). Never share the password and link together.')}
                  </p>
                </div>
              </div>

              {/* TOTP Warning if present */}
              {item.totpSecret && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5 text-left">
                  <AlertTriangle className="w-4.5 h-4.5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <h4 className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                      {t('share.totpIncludedTitle')}
                    </h4>
                    <p className="text-[9px] text-on-surface-variant leading-relaxed">
                      {t('share.totpIncludedDesc')}
                    </p>
                  </div>
                </div>
              )}

              {/* Copy URL Input Group */}
              <div className="flex gap-2">
                <input
                  data-testid="share-modal-url-input"
                  type="text"
                  readOnly
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  data-form-type="other"
                  value={shareUrl}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="flex-1 bg-[#161816] border border-outline-variant/20 rounded-xl px-3 py-2 text-[10px] text-on-surface-variant font-mono focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
                />
                <button
                  data-testid="share-modal-copy-button"
                  onClick={handleCopy}
                  className={`px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none active:scale-95 ${
                    copied
                      ? 'bg-brand-tertiary text-on-surface'
                      : 'bg-brand-primary text-brand-on-primary hover:brightness-110'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>{t('share.copied')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>{t('share.copy')}</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-outline-variant/10 bg-[#0c0d0c]/95 flex justify-end">
          <Button
            data-testid="share-modal-close-button"
            onClick={onClose}
            variant="secondary"
            size="md"
          >
            {t('share.close')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
