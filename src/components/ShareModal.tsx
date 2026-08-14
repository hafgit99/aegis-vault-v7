/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Clock, QrCode, AlertTriangle } from 'lucide-react';
import QRCode from 'qrcode';
import { useLanguage } from '../i18n/LanguageContext';
import { VaultItem } from '../types';
import { generateShareUrl } from '../lib/share';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: VaultItem | null;
}

export default function ShareModal({ isOpen, onClose, item }: ShareModalProps) {
  const { t } = useLanguage();
  const [duration, setDuration] = useState<number>(1); // default 1 hour
  const [shareUrl, setShareUrl] = useState<string>('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !item) return;

    setLoading(true);
    setCopied(false);
    generateShareUrl(item, duration)
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
      })
      .catch((err) => {
        console.error('Error generating share link:', err);
        setLoading(false);
      });
  }, [isOpen, item, duration]);

  if (!isOpen || !item) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => console.error('Failed to copy share link:', err));
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
              <QrCode className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm text-on-surface">
                {t('share.title') || 'Secure Share / Güvenli Paylaşım'}
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
          {/* Expiration Selection */}
          <div className="space-y-1.5 text-left">
            <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest">
              {t('share.durationLabel') || 'Sharing Duration / Paylaşım Süresi'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDuration(1)}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  duration === 1
                    ? 'border-brand-primary/30 bg-brand-primary/15 text-brand-primary'
                    : 'border-outline-variant/20 bg-surface-low text-on-surface-variant hover:bg-surface-high'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>1 {t('share.hour') || 'Hour / Saat'}</span>
              </button>
              <button
                type="button"
                onClick={() => setDuration(24)}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  duration === 24
                    ? 'border-brand-primary/30 bg-brand-primary/15 text-brand-primary'
                    : 'border-outline-variant/20 bg-surface-low text-on-surface-variant hover:bg-surface-high'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>24 {t('share.hours') || 'Hours / Saat'}</span>
              </button>
            </div>
          </div>

          {/* QR Code Container */}
          <div className="bg-[#101210]/60 p-4 rounded-xl border border-outline-variant/15 flex flex-col items-center justify-center">
            {loading ? (
              <div className="w-48 h-48 flex items-center justify-center">
                <span className="text-xs text-on-surface-variant animate-pulse">
                  {t('share.generating') || 'Generating QR Code...'}
                </span>
              </div>
            ) : (
              qrCodeDataUrl && (
                <div className="p-2 bg-white rounded-lg shadow-inner overflow-hidden animate-scale-in">
                  <img
                    src={qrCodeDataUrl}
                    alt="Share QR Code"
                    className="w-44 h-44 object-contain select-none"
                    draggable={false}
                  />
                </div>
              )
            )}
            <p className="text-[10px] text-on-surface-variant/70 text-center mt-3 leading-relaxed max-w-[280px]">
              {t('share.scanHelp') || 'Scan this QR code with a nearby device to securely import this credential.'}
            </p>
          </div>

          {/* Security Banner */}
          <div className="p-3 bg-brand-primary/5 border border-brand-primary/15 rounded-xl flex items-start gap-2.5 text-left">
            <AlertTriangle className="w-4.5 h-4.5 text-brand-primary shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <h4 className="text-[10px] font-bold text-brand-primary uppercase tracking-wider">
                {t('share.securityTitle') || 'Zero-Knowledge Security'}
              </h4>
              <p className="text-[9px] text-on-surface-variant leading-relaxed">
                {t('share.securityDesc') || 'Encryption keys are embedded in the URL hash and never leave the device. No data is stored on external servers.'}
              </p>
            </div>
          </div>

          {/* Copy URL Input Group */}
          <div className="flex gap-2">
            <input
              data-testid="share-modal-url-input"
              type="text"
              readOnly
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
                  <span>{t('share.copied') || 'Copied!'}</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>{t('share.copy') || 'Copy'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-outline-variant/10 bg-[#0c0d0c]/95 flex justify-end">
          <button
            data-testid="share-modal-close-button"
            onClick={onClose}
            className="px-4 py-2 bg-[#1b1d1b] hover:bg-[#232623] border border-outline-variant/15 rounded-xl font-bold text-xs text-on-surface transition-colors cursor-pointer focus:outline-none"
          >
            {t('share.close') || 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
