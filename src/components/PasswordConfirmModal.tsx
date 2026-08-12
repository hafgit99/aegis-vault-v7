/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, Lock, Eye, EyeOff, ShieldCheck, KeyRound } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface PasswordConfirmModalProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  errorMessage?: string | null;
  onConfirm: (password: string) => void | Promise<void>;
  onCancel: () => void;
}

export default function PasswordConfirmModal({
  isOpen,
  title,
  description,
  confirmText,
  cancelText,
  isLoading = false,
  errorMessage = null,
  onConfirm,
  onCancel,
}: PasswordConfirmModalProps) {
  const { t } = useLanguage();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setShowPassword(false);
      setLocalError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    setLocalError(errorMessage);
  }, [errorMessage]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setLocalError(t('settings.password.error.current'));
      return;
    }
    setLocalError(null);
    await onConfirm(password);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-md animate-fade-in">
      <div 
        className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden p-6 animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="absolute top-4 right-4 p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60 rounded-lg transition-colors disabled:opacity-50"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon & Title */}
        <div className="flex items-center gap-3.5 mb-4">
          <div className="p-3 bg-brand-primary/10 border border-brand-primary/20 rounded-xl text-brand-primary">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-neutral-100">
              {title || t('settings.biometric.promptMasterPasswordTitle') || t('common.confirmPassword') || 'Ana Parola Doğrulaması'}
            </h3>
            <p className="text-xs text-neutral-400">
              {description || t('settings.biometric.promptMasterPassword') || 'İşlemi tamamlamak için lütfen Ana Parolanızı doğrulayın:'}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              {t('common.masterPassword') || 'Ana Parola'}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (localError) setLocalError(null);
                }}
                placeholder="••••••••••••"
                autoFocus
                disabled={isLoading}
                className="w-full pl-10 pr-11 py-2.5 bg-neutral-950/80 border border-neutral-800 focus:border-brand-primary/60 focus:ring-1 focus:ring-brand-primary/60 rounded-xl text-sm text-neutral-100 placeholder-neutral-600 transition-all outline-none"
              />
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
              
              {/* Eye Toggle Button */}
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-200 transition-colors focus:outline-none"
                title={showPassword ? 'Şifreyi Gizle' : 'Şifreyi Göster'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4 text-brand-primary" />
                ) : (
                  <Eye className="w-4 h-4 text-neutral-400" />
                )}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {localError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
              <span>{localError}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-medium text-neutral-300 hover:text-neutral-100 hover:bg-neutral-800/80 rounded-xl border border-neutral-800 transition-all disabled:opacity-50"
            >
              {cancelText || t('common.cancel') || 'İptal'}
            </button>
            <button
              type="submit"
              disabled={isLoading || !password.trim()}
              className="px-4 py-2 text-xs font-medium text-neutral-950 bg-brand-primary hover:bg-brand-primary/90 rounded-xl font-semibold shadow-lg shadow-brand-primary/10 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-neutral-950/30 border-t-neutral-950 rounded-full animate-spin" />
                  <span>{t('common.verifying') || 'Doğrulanıyor...'}</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>{confirmText || t('common.confirm') || 'Doğrula & Aktifleştir'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
