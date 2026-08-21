/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  X, 
  HelpCircle, 
  KeyRound, 
  Lightbulb, 
  Fingerprint, 
  AlertTriangle, 
  Check, 
  RotateCcw, 
  Unlock 
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { isRecoveryKeySetup, recoverWithRecoveryKey } from '../../lib/recoveryKey';
import { getPasswordHint } from '../../lib/passwordHint';
import { authenticateBiometric, isBiometricEnabled } from '../../lib/biometric';
import { validateMasterPassword } from '../../lib/security';
import { changeMasterPassword } from '../../lib/storage';
import { Modal } from '../ui/Modal';

interface LockScreenRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUnlockedAfterRecovery: () => void;
  onClearLockoutState: () => void;
}

export function LockScreenRecoveryModal({
  isOpen,
  onClose,
  onUnlockedAfterRecovery,
  onClearLockoutState,
}: LockScreenRecoveryModalProps) {
  const { t } = useLanguage();
  const isBioEnabled = isBiometricEnabled();

  const [activeRecoveryTab, setActiveRecoveryTab] = useState<'key' | 'hint' | 'biometric'>('key');
  const [recoveryInputWords, setRecoveryInputWords] = useState('');
  const [recoveredMasterPassword, setRecoveredMasterPassword] = useState<string | null>(null);
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const [recoveryModalError, setRecoveryModalError] = useState<string | null>(null);
  const [recoveryModalSuccess, setRecoveryModalSuccess] = useState<string | null>(null);
  const [recoveryModalLoading, setRecoveryModalLoading] = useState(false);

  if (!isOpen) return null;

  const handleRecoverWithKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryModalError(null);
    setRecoveryModalLoading(true);

    const words = recoveryInputWords.trim().split(/\s+/);
    try {
      const decryptedMaster = await recoverWithRecoveryKey(words);
      setRecoveredMasterPassword(decryptedMaster);
      setRecoveryModalError(null);
    } catch (err) {
      setRecoveryModalError(err instanceof Error ? err.message : String(err));
    } finally {
      setRecoveryModalLoading(false);
    }
  };

  const handleRecoverWithBiometric = async () => {
    setRecoveryModalError(null);
    setRecoveryModalLoading(true);
    try {
      const decryptedMaster = await authenticateBiometric();
      setRecoveredMasterPassword(decryptedMaster);
      setRecoveryModalError(null);
    } catch (err: unknown) {
      const errorObj = err && typeof err === 'object' ? (err as { name?: string; code?: string }) : null;
      if (errorObj?.name === "SecurityError" || errorObj?.name === "NotAllowedError") {
        setRecoveryModalError(t('lock.error.biometricPermission'));
      } else {
        switch (errorObj?.code) {
          case 'biometric.unsupported':
            setRecoveryModalError(t('lock.error.biometricUnsupported'));
            break;
          case 'biometric.integrityMismatch':
            setRecoveryModalError(t('lock.error.biometricIntegrity'));
            break;
          case 'biometric.missingBundle':
          case 'biometric.authenticationCancelled':
            setRecoveryModalError(t('lock.error.biometricFailed'));
            break;
          default:
            setRecoveryModalError(t('lock.error.biometricFailed'));
            break;
        }
      }
    } finally {
      setRecoveryModalLoading(false);
    }
  };

  const handleApplyNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveredMasterPassword) return;

    if (!validateMasterPassword(recoveryNewPassword)) {
      setRecoveryModalError(t('lock.error.complexity'));
      return;
    }
    if (recoveryNewPassword !== recoveryConfirmPassword) {
      setRecoveryModalError(t('lock.error.confirmationMismatch'));
      return;
    }

    setRecoveryModalLoading(true);
    setRecoveryModalError(null);

    try {
      await changeMasterPassword(recoveredMasterPassword, recoveryNewPassword);
      setRecoveryModalSuccess(t('lock.recoveryModal.newPasswordSuccess'));
      onClearLockoutState();
      setTimeout(() => {
        onUnlockedAfterRecovery();
      }, 800);
    } catch (err) {
      setRecoveryModalError(err instanceof Error ? err.message : String(err));
    } finally {
      setRecoveryModalLoading(false);
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose} zIndex={200} overlayTestId="lock-recovery-modal">
      <div className="w-full max-w-lg surface-panel rounded-2xl p-6 space-y-5 my-8 relative border border-outline-variant/15">
        <button
          data-testid="lock-recovery-modal-close"
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-on-surface-variant hover:text-on-surface rounded-lg cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-1 pr-8">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-brand-primary" />
            <h2 className="font-display text-lg font-bold text-on-surface">
              {t('lock.recoveryModal.title')}
            </h2>
          </div>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            {t('lock.recoveryModal.subtitle')}
          </p>
        </div>

        {/* Recovery Method Tabs */}
        {!recoveredMasterPassword && (
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-surface-lowest border border-outline-variant/15 text-xs font-bold">
            <button
              data-testid="lock-recovery-tab-key"
              type="button"
              onClick={() => { setActiveRecoveryTab('key'); setRecoveryModalError(null); }}
              className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeRecoveryTab === 'key'
                  ? 'bg-brand-primary/15 text-brand-primary border border-brand-primary/20 shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{t('lock.recoveryModal.tabKey')}</span>
            </button>

            <button
              data-testid="lock-recovery-tab-hint"
              type="button"
              onClick={() => { setActiveRecoveryTab('hint'); setRecoveryModalError(null); }}
              className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeRecoveryTab === 'hint'
                  ? 'bg-brand-primary/15 text-brand-primary border border-brand-primary/20 shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5" />
              <span>{t('lock.recoveryModal.tabHint')}</span>
            </button>

            <button
              data-testid="lock-recovery-tab-biometric"
              type="button"
              onClick={() => { setActiveRecoveryTab('biometric'); setRecoveryModalError(null); }}
              className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeRecoveryTab === 'biometric'
                  ? 'bg-brand-primary/15 text-brand-primary border border-brand-primary/20 shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Fingerprint className="w-3.5 h-3.5" />
              <span>{t('lock.recoveryModal.tabBiometric')}</span>
            </button>
          </div>
        )}

        {/* Error / Success Banners */}
        {recoveryModalError && (
          <div data-testid="lock-recovery-error" className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{recoveryModalError}</span>
          </div>
        )}
        {recoveryModalSuccess && (
          <div data-testid="lock-recovery-success" className="flex items-start gap-2.5 p-3 rounded-xl bg-brand-tertiary/10 border border-brand-tertiary/20 text-xs text-brand-tertiary">
            <Check className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{recoveryModalSuccess}</span>
          </div>
        )}

        {/* Tab 1: Recovery Key */}
        {!recoveredMasterPassword && activeRecoveryTab === 'key' && (
          <div className="space-y-4">
            {!isRecoveryKeySetup() ? (
              <p className="text-xs text-on-surface-variant/60 py-4 text-center">
                {t('lock.recoveryModal.noKey')}
              </p>
            ) : (
              <form onSubmit={handleRecoverWithKey} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface mb-1.5">
                    {t('lock.recoveryModal.enterWords')}
                  </label>
                  <textarea
                    data-testid="lock-recovery-words-input"
                    value={recoveryInputWords}
                    onChange={(e) => setRecoveryInputWords(e.target.value)}
                    placeholder="abandon ability able about above absent absorb abstract absurd abuse access accident..."
                    className="w-full h-28 bg-surface-lowest border border-outline-variant/20 rounded-xl p-3 text-xs font-mono text-on-surface placeholder-on-surface-variant/30 focus:outline-none focus:ring-1 focus:ring-brand-primary"
                    required
                  />
                </div>
                <button
                  data-testid="lock-recovery-submit-button"
                  type="submit"
                  disabled={recoveryModalLoading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-primary text-brand-on-primary text-xs font-bold hover:brightness-110 transition-all cursor-pointer"
                >
                  {recoveryModalLoading ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                  <span>{t('lock.recoveryModal.verifyWords')}</span>
                </button>
              </form>
            )}
          </div>
        )}

        {/* Tab 2: Password Hint */}
        {!recoveredMasterPassword && activeRecoveryTab === 'hint' && (
          <div className="space-y-3 py-2">
            {getPasswordHint() ? (
              <div data-testid="lock-recovery-hint-content" className="p-4 rounded-xl bg-surface-lowest border border-outline-variant/20 space-y-2">
                <p className="text-xs font-bold text-amber-400 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4" />
                  {t('lock.recoveryModal.hintText')}
                </p>
                <p className="text-sm font-medium text-on-surface bg-surface-low p-3 rounded-lg border border-outline-variant/10">
                  "{getPasswordHint()}"
                </p>
              </div>
            ) : (
              <p className="text-xs text-on-surface-variant/60 py-4 text-center">
                {t('lock.recoveryModal.noHint')}
              </p>
            )}
          </div>
        )}

        {/* Tab 3: Biometric Recovery */}
        {!recoveredMasterPassword && activeRecoveryTab === 'biometric' && (
          <div className="space-y-4 py-2">
            {!isBioEnabled ? (
              <p className="text-xs text-on-surface-variant/60 py-4 text-center">
                {t('lock.recoveryModal.noBiometric')}
              </p>
            ) : (
              <div className="space-y-4 text-center">
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  {t('lock.recoveryModal.biometricPrompt')}
                </p>
                <button
                  data-testid="lock-recovery-biometric-button"
                  type="button"
                  onClick={handleRecoverWithBiometric}
                  disabled={recoveryModalLoading}
                  className="w-full flex items-center justify-center gap-2.5 bg-brand-primary/10 border border-brand-primary/30 hover:bg-brand-primary/20 text-brand-primary py-3.5 rounded-xl font-bold transition-all cursor-pointer"
                >
                  <Fingerprint className="w-5 h-5 text-brand-primary" />
                  <span>{t('lock.recoveryModal.biometricButton')}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Set New Password (after key or biometric decryption) */}
        {recoveredMasterPassword && (
          <form onSubmit={handleApplyNewPassword} className="space-y-4 animate-fade-in">
            <div className="p-3 rounded-xl bg-brand-tertiary/10 border border-brand-tertiary/20 text-xs text-brand-tertiary font-bold flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{t('lock.recoveryModal.newPasswordTitle')}</span>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">
                {t('lock.field.newMasterPassword')}
              </label>
              <input
                data-testid="lock-recovery-new-password"
                type="password"
                value={recoveryNewPassword}
                onChange={(e) => setRecoveryNewPassword(e.target.value)}
                className="w-full bg-surface-lowest border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface font-mono"
                placeholder="••••••••"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">
                {t('lock.field.confirmPassword')}
              </label>
              <input
                data-testid="lock-recovery-confirm-password"
                type="password"
                value={recoveryConfirmPassword}
                onChange={(e) => setRecoveryConfirmPassword(e.target.value)}
                className="w-full bg-surface-lowest border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface font-mono"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              data-testid="lock-recovery-apply-button"
              type="submit"
              disabled={recoveryModalLoading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-brand-primary text-brand-on-primary font-bold text-xs hover:brightness-110 transition-all cursor-pointer"
            >
              {recoveryModalLoading ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
              <span>{t('lock.action.unlock')}</span>
            </button>
          </form>
        )}
      </div>
    </Modal>
  );
}
