/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, Lock, Eye, EyeOff, ShieldCheck, KeyRound } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

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
    <Modal open={isOpen} onClose={onCancel} zIndex={50} closeOnBackdrop={false}>
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
          aria-label={t('confirm.close')}
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
              {title || t('common.confirmPassword')}
            </h3>
            <p className="text-xs text-neutral-400">
              {description || t('common.verifyMasterPasswordHint')}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (localError) setLocalError(null);
            }}
            placeholder="••••••••••••"
            autoFocus
            disabled={isLoading}
            label={t('common.masterPassword')}
            leadingIcon={<Lock className="w-4 h-4 text-neutral-500" />}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                tabIndex={-1}
                className="p-1 text-neutral-400 hover:text-neutral-200 transition-colors focus:outline-none"
                title={showPassword ? t('common.hidePassword') : t('common.showPassword')}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4 text-brand-primary" />
                ) : (
                  <Eye className="w-4 h-4 text-neutral-400" />
                )}
              </button>
            }
          />

          {/* Error Message */}
          {localError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
              <span>{localError}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              variant="secondary"
              size="md"
            >
              {cancelText || t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !password.trim()}
              variant="primary"
              size="md"
              loading={isLoading}
            >
              {isLoading ? (
                <span>{t('common.verifying')}</span>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>{confirmText || t('common.confirm')}</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
