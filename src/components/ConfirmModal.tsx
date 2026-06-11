import React from 'react';
import { X, AlertTriangle, Trash2, HelpCircle, CheckCircle, Info } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  type: 'danger' | 'warning' | 'info' | 'success';
  confirmText?: string;
  cancelText?: string;
  isAlert?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  type,
  confirmText,
  cancelText,
  isAlert = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { t } = useLanguage();

  if (!isOpen) return null;

  // Icon selection
  const Icon = (() => {
    switch (type) {
      case 'danger':
        return Trash2;
      case 'warning':
        return AlertTriangle;
      case 'success':
        return CheckCircle;
      case 'info':
      default:
        return Info;
    }
  })();

  const iconColors = {
    danger: 'text-red-500 bg-red-500/10 border-red-500/20',
    warning: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
    success: 'text-brand-tertiary bg-brand-tertiary/10 border-brand-tertiary/20',
    info: 'text-brand-primary bg-brand-primary/10 border-brand-primary/20',
  };

  const buttonColors = {
    danger: 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/10',
    warning: 'bg-yellow-500 hover:bg-yellow-600 text-neutral-950 shadow-yellow-500/10',
    success: 'bg-brand-primary hover:bg-brand-primary/95 text-brand-on-primary shadow-brand-primary/10',
    info: 'bg-brand-primary hover:bg-brand-primary/95 text-brand-on-primary shadow-brand-primary/10',
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div 
        className="w-full max-w-md bg-surface-lowest border border-outline-variant/15 rounded-2xl shadow-2xl p-6 relative overflow-hidden"
        id="confirm-modal-wrapper"
      >
        {/* Decorative corner glow */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none" />

        <button
          data-testid="confirm-modal-close-button"
          onClick={onCancel}
          className="absolute right-4 top-4 text-on-surface-variant hover:text-on-surface p-1 hover:bg-surface-high rounded-lg transition-all cursor-pointer"
          title={t('confirm.close')}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center mt-2">
          {/* Main Type Icon */}
          <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center mb-4 ${iconColors[type]}`}>
            <Icon className="w-7 h-7" />
          </div>

          <h3 className="font-display text-lg font-bold text-on-surface mb-2">{title}</h3>
          
          <p className="text-on-surface-variant text-xs leading-relaxed max-w-sm mb-6">
            {message}
          </p>

          <div className="flex items-center gap-3 w-full">
            {!isAlert && (
              <button
                data-testid="confirm-modal-cancel-button"
                onClick={onCancel}
                className="flex-1 py-2.5 rounded-xl border border-outline-variant/15 bg-surface-high hover:bg-[#202220] font-bold text-xs text-on-surface hover:text-brand-primary active:scale-95 transition-all cursor-pointer"
              >
                {cancelText ?? t('confirm.defaultCancel')}
              </button>
            )}
            <button
              data-testid="confirm-modal-confirm-button"
              onClick={() => {
                onConfirm();
                onCancel(); // Close current modal automatically after confirming
              }}
              className={`flex-1 py-2.5 rounded-xl font-bold text-xs active:scale-95 transition-all cursor-pointer shadow-md ${buttonColors[type]}`}
            >
              {isAlert ? t('confirm.defaultAlert') : confirmText ?? t('confirm.defaultConfirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
