/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Lock, 
  Unlock, 
  ShieldAlert, 
  Fingerprint, 
  ShieldCheck, 
  Cpu, 
  HardDrive, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  Sparkles,
  Trash2
} from 'lucide-react';
import { isMasterPasswordSet, setupMasterPassword, verifyMasterPassword } from '../lib/storage';
import { authenticateBiometric, isBiometricEnabled, isBiometricSupported } from '../lib/biometric';
import { APP_NAME, APP_SHORT_NAME } from '../lib/branding';
import { useLanguage } from '../i18n/LanguageContext';

function getBiometricUnlockErrorMessage(err: any, t: ReturnType<typeof useLanguage>['t']): string {
  if (err?.name === "SecurityError" || err?.name === "NotAllowedError") {
    return t('lock.error.biometricPermission');
  }

  switch (err?.code) {
    case 'biometric.unsupported':
      return t('lock.error.biometricUnsupported');
    case 'biometric.integrityMismatch':
      return t('lock.error.biometricIntegrity');
    case 'biometric.missingBundle':
    case 'biometric.authenticationCancelled':
      return t('lock.error.biometricFailed');
    default:
      return err?.message || t('lock.error.biometricFailed');
  }
}

interface LockScreenProps {
  onUnlock: () => void;
}

export default function LockScreen({ onUnlock }: LockScreenProps) {
  const { t } = useLanguage();
  const isSetup = isMasterPasswordSet();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Biometric Unlock States
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const isBioEnabled = isBiometricEnabled();

  const handleBiometricUnlock = async () => {
    setBiometricError(null);
    setError(null);
    setBiometricLoading(true);

    try {
      if (!isBiometricSupported()) {
        throw new Error(t('lock.error.biometricUnsupported'));
      }
      const decryptedMaster = await authenticateBiometric();
      if (await verifyMasterPassword(decryptedMaster)) {
        onUnlock();
      } else {
        throw new Error(t('lock.error.biometricIntegrity'));
      }
    } catch (err: any) {
      setBiometricError(getBiometricUnlockErrorMessage(err, t));
    } finally {
      setBiometricLoading(false);
    }
  };

  // Auto trigger biometric prompt on lock screen if enabled
  React.useEffect(() => {
    if (isSetup && isBioEnabled) {
      const timer = setTimeout(() => {
        handleBiometricUnlock();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isSetup]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBiometricError(null);

    if (!isSetup) {
      if (password.length < 6) {
        setError(t('lock.error.minimumLength'));
        return;
      }
      if (password !== confirmPassword) {
        setError(t('lock.error.confirmationMismatch'));
        return;
      }
      await setupMasterPassword(password);
      onUnlock();
    } else {
      if (await verifyMasterPassword(password)) {
        onUnlock();
      } else {
        setError(t('lock.error.invalidPassword'));
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#070807] flex flex-col justify-between relative overflow-hidden select-none">
      {/* Absolute futuristic ambient glows */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-brand-primary/10 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none" />
      
      {/* Grid Pattern Background */}
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.02] pointer-events-none" />

      {/* Main Grid Panel */}
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-8 lg:py-16 flex items-center justify-center relative z-10">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 items-center">
          
          {/* LEFT COLUMN: Educational & Cyber-Security Features Showcase */}
          <div className="lg:col-span-7 space-y-8 animate-fade-in text-left">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-[10px] font-bold tracking-widest uppercase rounded-full">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                <span>{t('lock.hero.badge')}</span>
              </div>
              <h1 className="font-display text-3xl md:text-5xl font-bold tracking-tight text-on-surface leading-tight">
                {t('lock.hero.titlePrefix')} <br />
                <span className="text-brand-primary bg-gradient-to-r from-brand-primary to-emerald-400 bg-clip-text text-transparent">{t('lock.hero.titleHighlight')}</span> {t('lock.hero.titleSuffix')}
              </h1>
              <p className="text-on-surface-variant text-sm md:text-base max-w-xl leading-relaxed">
                {APP_NAME}; {t('lock.hero.descriptionSuffix')}
              </p>
            </div>

            {/* Premium Feature Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <div className="bg-[#101210]/50 border border-outline-variant/10 rounded-2xl p-4 space-y-2 hover:border-brand-primary/20 transition-all duration-300">
                <div className="w-9 h-9 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="font-display font-semibold text-sm text-on-surface">{t('lock.feature.zeroKnowledge.title')}</h3>
                <p className="text-on-surface-variant text-[11.5px] leading-relaxed">
                  {t('lock.feature.zeroKnowledge.description')}
                </p>
              </div>

              <div className="bg-[#101210]/50 border border-outline-variant/10 rounded-2xl p-4 space-y-2 hover:border-brand-primary/20 transition-all duration-300">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Cpu className="w-5 h-5" />
                </div>
                <h3 className="font-display font-semibold text-sm text-on-surface font-display">{t('lock.feature.crypto.title')}</h3>
                <p className="text-on-surface-variant text-[11.5px] leading-relaxed">
                  {t('lock.feature.crypto.description')}
                </p>
              </div>

              <div className="bg-[#101210]/50 border border-outline-variant/10 rounded-2xl p-4 space-y-2 hover:border-brand-primary/20 transition-all duration-300">
                <div className="w-9 h-9 rounded-xl bg-brand-tertiary/10 border border-brand-tertiary/20 flex items-center justify-center text-brand-tertiary">
                  <HardDrive className="w-5 h-5" />
                </div>
                <h3 className="font-display font-semibold text-sm text-on-surface font-display">{t('lock.feature.localControl.title')}</h3>
                <p className="text-on-surface-variant text-[11.5px] leading-relaxed">
                  {t('lock.feature.localControl.description')}
                </p>
              </div>

              <div className="bg-[#101210]/50 border border-outline-variant/10 rounded-2xl p-4 space-y-2 hover:border-brand-primary/20 transition-all duration-300">
                <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                  <Trash2 className="w-5 h-5" />
                </div>
                <h3 className="font-display font-semibold text-sm text-on-surface font-display">{t('lock.feature.trash.title')}</h3>
                <p className="text-on-surface-variant text-[11.5px] leading-relaxed">
                  {t('lock.feature.trash.description')}
                </p>
              </div>

            </div>

            {/* Real-time System Indicators */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-on-surface-variant">
              <div className="flex items-center gap-1.5 bg-[#121412] px-3 py-1.5 rounded-full border border-outline-variant/5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
                <span>{t('lock.indicator.localStorage')}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-[#121412] px-3 py-1.5 rounded-full border border-outline-variant/5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-tertiary" />
                <span>{t('lock.indicator.encryption')}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-[#121412] px-3 py-1.5 rounded-full border border-outline-variant/5">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                <span>{t('lock.indicator.trash')}</span>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Interactive High-Precision Password Box */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <div className="w-full max-w-md bg-surface-container/60 border border-outline-variant/20 rounded-2xl p-8 backdrop-blur-xl custom-shadow relative z-10 transition-all duration-300 hover:border-brand-primary/15">
              
              <div className="absolute top-0 left-0 w-32 h-32 bg-brand-primary/5 rounded-full blur-[50px] pointer-events-none" />

              <div className="flex flex-col items-center text-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-brand-primary/10 border border-brand-primary/25 flex items-center justify-center mb-5 shadow-inner group">
                  <Lock className="w-7 h-7 text-brand-primary group-hover:scale-110 transition-transform duration-300" />
                </div>
                <h1 className="font-display text-2xl font-bold text-on-surface leading-tight tracking-tight">
                  {isSetup ? t('lock.panel.unlockTitle') : t('lock.panel.setupTitle')}
                </h1>
                <p className="text-on-surface-variant text-xs mt-2.5 max-w-xs leading-relaxed">
                  {isSetup
                    ? t('lock.panel.unlockDescription')
                    : `${APP_SHORT_NAME} ${t('lock.panel.setupDescriptionSuffix')}`}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-brand-error/10 border border-brand-error/20 text-brand-error text-xs leading-relaxed animate-fade-in">
                    <ShieldAlert className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {biometricError && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-brand-error/10 border border-brand-error/20 text-red-400 text-xs leading-relaxed animate-fade-in">
                    <Fingerprint className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
                    <span>{biometricError}</span>
                  </div>
                )}

                {/* Primary Password Input Container */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase">
                      {isSetup ? t('lock.field.masterPassword') : t('lock.field.newMasterPassword')}
                    </label>
                    <span className="text-[10px] text-zinc-500 font-medium">{t('lock.field.minimumLength')}</span>
                  </div>
                  <div className="relative">
                    <input
                      data-testid="lock-password-input"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-[#141614] hover:bg-[#191b19] focus:bg-[#1b1d1b] border border-outline-variant/30 rounded-xl pl-4 pr-11 py-3.5 text-on-surface placeholder-on-surface-variant/20 focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-all text-center tracking-widest text-lg font-mono"
                      placeholder="••••••••"
                      required
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-on-surface-variant/60 hover:text-on-surface rounded-md focus:outline-none cursor-pointer"
                      title={showPassword ? t('lock.action.hide') : t('lock.action.show')}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Setup Mode: Password Confirmation */}
                {!isSetup && (
                  <div>
                    <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
                      {t('lock.field.confirmPassword')}
                    </label>
                    <div className="relative">
                      <input
                        data-testid="lock-confirm-password-input"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full bg-[#141614] hover:bg-[#191b19] focus:bg-[#1b1d1b] border border-outline-variant/30 rounded-xl pl-4 pr-11 py-3.5 text-on-surface placeholder-on-surface-variant/20 focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-all text-center tracking-widest text-lg font-mono"
                        placeholder="••••••••"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-on-surface-variant/60 hover:text-on-surface rounded-md focus:outline-none cursor-pointer"
                        title={showConfirmPassword ? t('lock.action.hide') : t('lock.action.show')}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* CTA Action button */}
                <button
                  data-testid="lock-submit-button"
                  type="submit"
                  className="w-full flex items-center justify-center gap-2.5 bg-brand-primary text-brand-on-primary py-4 rounded-xl font-bold transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-lg shadow-brand-primary/10 hover:brightness-110"
                >
                  {isSetup ? (
                    <>
                      <Unlock className="w-4.5 h-4.5" />
                      <span>{t('lock.action.unlock')}</span>
                    </>
                  ) : (
                    <>
                      <Fingerprint className="w-4.5 h-4.5" />
                      <span>{t('lock.action.setup')}</span>
                    </>
                  )}
                </button>

                {/* Biometric Trigger Button */}
                {isSetup && isBioEnabled && (
                  <button
                    type="button"
                    disabled={biometricLoading}
                    onClick={handleBiometricUnlock}
                    className="w-full flex items-center justify-center gap-2.5 bg-brand-primary/10 border border-brand-primary/30 hover:bg-brand-primary/20 text-brand-primary py-3.5 rounded-xl font-bold transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer animate-fade-in"
                  >
                    <Fingerprint className={`w-4.5 h-4.5 text-brand-primary ${biometricLoading ? 'animate-ping' : 'animate-pulse'}`} />
                    <span>{biometricLoading ? t('lock.action.biometricLoading') : t('lock.action.biometric')}</span>
                  </button>
                )}
              </form>

              {/* Zero-Server trust notice banner */}
              <div className="mt-8 pt-6 border-t border-outline-variant/10 flex flex-col items-center gap-1.5 text-xs text-on-surface-variant/40 text-center">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-brand-tertiary" />
                  <span className="font-bold text-on-surface">{t('lock.privacy.title')}</span>
                </div>
                <p className="leading-relaxed text-[11px] px-2">
                  {t('lock.privacy.description')}
                </p>
              </div>

            </div>
          </div>

        </div>
      </div>

      {/* Futuristic clean footer */}
      <footer className="w-full border-t border-outline-variant/5 py-4 bg-[#0a0b0a]/40 text-center text-[10px] text-on-surface-variant/30 font-mono flex flex-col sm:flex-row items-center justify-between px-6 gap-2">
        <span>© 2026 {t('lock.footer.name')}</span>
        <span>{t('lock.footer.crypto')}</span>
      </footer>
    </div>
  );
}
