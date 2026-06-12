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
  Trash2,
  KeyRound,
  Download,
  Languages
} from 'lucide-react';
import {
  getRememberedAccountSecretKey,
  isAccountSecretKeyRequired,
  isMasterPasswordSet,
  setupMasterPasswordWithSecretKey,
  verifyMasterPassword,
} from '../lib/storage';
import { authenticateBiometric, isBiometricEnabled, isBiometricSupported } from '../lib/biometric';
import { APP_NAME, APP_SHORT_NAME } from '../lib/branding';
import { useLanguage } from '../i18n/LanguageContext';
import { supportedLanguages, languageLabels, type LanguageCode } from '../i18n/translations';
import {
  generateAccountSecretKey,
  isAccountSecretKeyFormatValid,
  normalizeAccountSecretKey,
} from '../lib/secretKey';

const MIN_MASTER_PASSWORD_LENGTH = 12;
const LOCKOUT_STORAGE_KEY = 'aegis_lockout_state';
const MAX_LOCKOUT_MS = 5 * 60 * 1000;

interface LockoutState {
  failedAttempts: number;
  lockedUntil: number;
}

function readLockoutState(): LockoutState {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCKOUT_STORAGE_KEY) || '{}') as Partial<LockoutState>;
    return {
      failedAttempts: Math.max(0, Number(parsed.failedAttempts) || 0),
      lockedUntil: Math.max(0, Number(parsed.lockedUntil) || 0),
    };
  } catch {
    return { failedAttempts: 0, lockedUntil: 0 };
  }
}

function writeLockoutState(state: LockoutState): void {
  localStorage.setItem(LOCKOUT_STORAGE_KEY, JSON.stringify(state));
}

function clearLockoutState(): void {
  localStorage.removeItem(LOCKOUT_STORAGE_KEY);
}

function recordFailedUnlockAttempt(now = Date.now()): LockoutState {
  const previous = readLockoutState();
  const failedAttempts = previous.failedAttempts + 1;
  const delayMs = Math.min(MAX_LOCKOUT_MS, 1000 * 2 ** Math.min(failedAttempts - 1, 8));
  const state = {
    failedAttempts,
    lockedUntil: now + delayMs,
  };
  writeLockoutState(state);
  return state;
}

function getLockoutRemainingMs(now = Date.now()): number {
  return Math.max(0, readLockoutState().lockedUntil - now);
}

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
  const { language, setLanguage, t } = useLanguage();
  const isSetup = isMasterPasswordSet();
  const requiresSecretKey = isAccountSecretKeyRequired();
  const rememberedSecretKey = getRememberedAccountSecretKey();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [secretKey, setSecretKey] = useState(() => rememberedSecretKey || generateAccountSecretKey());
  const [rememberSecretKey, setRememberSecretKey] = useState(Boolean(rememberedSecretKey));
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockoutRemainingMs, setLockoutRemainingMs] = useState(() => getLockoutRemainingMs());

  // Biometric Unlock States
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const isBioEnabled = isBiometricEnabled();
  const lockoutRemainingSeconds = Math.ceil(lockoutRemainingMs / 1000);
  const isLockedOut = lockoutRemainingMs > 0;

  React.useEffect(() => {
    if (!isLockedOut) return;

    const interval = window.setInterval(() => {
      setLockoutRemainingMs(getLockoutRemainingMs());
    }, 250);

    return () => window.clearInterval(interval);
  }, [isLockedOut]);

  const getRateLimitMessage = (remainingSeconds: number) =>
    `${t('lock.error.rateLimitedPrefix')} ${remainingSeconds} ${t('lock.error.rateLimitedSuffix')}`;

  const handleBiometricUnlock = React.useCallback(async () => {
    setBiometricError(null);
    setError(null);
    setBiometricLoading(true);

    try {
      if (!isBiometricSupported()) {
        throw new Error(t('lock.error.biometricUnsupported'));
      }
      const decryptedMaster = await authenticateBiometric();
      if (await verifyMasterPassword(decryptedMaster, rememberedSecretKey)) {
        onUnlock();
      } else {
        throw new Error(t('lock.error.biometricIntegrity'));
      }
    } catch (err: any) {
      setBiometricError(getBiometricUnlockErrorMessage(err, t));
    } finally {
      setBiometricLoading(false);
    }
  }, [onUnlock, rememberedSecretKey, t]);

  // Auto trigger biometric prompt on lock screen if enabled
  React.useEffect(() => {
    if (isSetup && isBioEnabled) {
      const timer = setTimeout(() => {
        handleBiometricUnlock();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [handleBiometricUnlock, isBioEnabled, isSetup]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBiometricError(null);

    if (!isSetup) {
      if (password.length < MIN_MASTER_PASSWORD_LENGTH) {
        setError(t('lock.error.minimumLength'));
        return;
      }
      if (password !== confirmPassword) {
        setError(t('lock.error.confirmationMismatch'));
        return;
      }
      if (!isAccountSecretKeyFormatValid(secretKey)) {
        setError(t('lock.error.secretKeyInvalid'));
        return;
      }
      await setupMasterPasswordWithSecretKey(password, secretKey, rememberSecretKey);
      clearLockoutState();
      onUnlock();
    } else {
      const remainingMs = getLockoutRemainingMs();
      if (remainingMs > 0) {
        setLockoutRemainingMs(remainingMs);
        setError(getRateLimitMessage(Math.ceil(remainingMs / 1000)));
        return;
      }

      const submittedSecretKey = requiresSecretKey ? secretKey : null;
      if (requiresSecretKey && !rememberedSecretKey && !isAccountSecretKeyFormatValid(submittedSecretKey || '')) {
        setError(t('lock.error.secretKeyRequired'));
        return;
      }
      if (await verifyMasterPassword(password, submittedSecretKey)) {
        clearLockoutState();
        setLockoutRemainingMs(0);
        onUnlock();
      } else {
        const lockout = recordFailedUnlockAttempt();
        const remainingSeconds = Math.ceil((lockout.lockedUntil - Date.now()) / 1000);
        setLockoutRemainingMs(Math.max(0, lockout.lockedUntil - Date.now()));
        setError(`${t('lock.error.invalidPassword')} ${getRateLimitMessage(remainingSeconds)}`);
      }
    }
  };

  const handleDownloadEmergencyKit = () => {
    const normalizedSecretKey = normalizeAccountSecretKey(secretKey);
    const kit = [
      `${APP_NAME} Emergency Kit`,
      '',
      `Account Secret Key: ${normalizedSecretKey}`,
      '',
      'Keep this file offline. You need this secret key together with your master password to unlock this vault on a new device.',
      'Aegis Vault cannot recover the secret key or master password for you.',
    ].join('\n');
    const blob = new Blob([kit], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'aegis-vault-emergency-kit.txt';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#070807] flex flex-col justify-between relative overflow-hidden select-none">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(220,225,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(220,225,255,0.025)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-brand-primary/5 blur-[120px] rounded-full pointer-events-none animate-pulse" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-brand-tertiary/5 blur-[120px] rounded-full pointer-events-none" />

      {/* Top Bar with Language Selector */}
      <header className="w-full flex justify-end px-6 py-4 relative z-50 shrink-0">
        <div className="flex items-center gap-2 bg-[#1a1c1a]/60 backdrop-blur-md rounded-lg px-3 py-1.5 border border-outline-variant/10">
          <Languages className="w-4 h-4 text-brand-primary" />
          <select
            data-testid="lock-language-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value as LanguageCode)}
            className="bg-transparent text-xs font-bold text-on-surface focus:outline-none cursor-pointer pr-1"
          >
            {supportedLanguages.map((code) => (
              <option key={code} value={code} className="bg-[#121412] text-on-surface">
                {languageLabels[code]}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-4 lg:py-8 flex items-center justify-center relative z-10">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center">
          
          {/* LEFT COLUMN: Educational & Cyber-Security Features Showcase */}
          <div className="lg:col-span-7 space-y-7 animate-fade-in text-left">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-[10px] font-bold tracking-widest uppercase rounded-full">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                <span>{t('lock.hero.badge')}</span>
              </div>
              <h1 className="font-display text-3xl md:text-5xl font-bold tracking-tight text-on-surface leading-tight">
                {t('lock.hero.titlePrefix')} <br />
                <span className="text-brand-primary">{t('lock.hero.titleHighlight')}</span> {t('lock.hero.titleSuffix')}
              </h1>
              <p className="text-on-surface-variant text-sm md:text-base max-w-xl leading-relaxed">
                {APP_NAME}; {t('lock.hero.descriptionSuffix')}
              </p>
            </div>

            {/* Premium Feature Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              
              <div className="surface-card surface-card-hover rounded-xl p-4 space-y-2 transition-all duration-300 hover:translate-y-[-2px]">
                <div className="icon-tile bg-brand-primary/10 text-brand-primary">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="font-display font-semibold text-sm text-on-surface">{t('lock.feature.zeroKnowledge.title')}</h3>
                <p className="text-on-surface-variant text-[11.5px] leading-relaxed">
                  {t('lock.feature.zeroKnowledge.description')}
                </p>
              </div>

              <div className="surface-card surface-card-hover rounded-xl p-4 space-y-2 transition-all duration-300 hover:translate-y-[-2px]">
                <div className="icon-tile bg-emerald-500/10 text-emerald-400">
                  <Cpu className="w-5 h-5" />
                </div>
                <h3 className="font-display font-semibold text-sm text-on-surface font-display">{t('lock.feature.crypto.title')}</h3>
                <p className="text-on-surface-variant text-[11.5px] leading-relaxed">
                  {t('lock.feature.crypto.description')}
                </p>
              </div>

              <div className="surface-card surface-card-hover rounded-xl p-4 space-y-2 transition-all duration-300 hover:translate-y-[-2px]">
                <div className="icon-tile bg-brand-tertiary/10 text-brand-tertiary">
                  <HardDrive className="w-5 h-5" />
                </div>
                <h3 className="font-display font-semibold text-sm text-on-surface font-display">{t('lock.feature.localControl.title')}</h3>
                <p className="text-on-surface-variant text-[11.5px] leading-relaxed">
                  {t('lock.feature.localControl.description')}
                </p>
              </div>

              <div className="surface-card surface-card-hover rounded-xl p-4 space-y-2 transition-all duration-300 hover:translate-y-[-2px]">
                <div className="icon-tile bg-red-500/10 text-red-400">
                  <Trash2 className="w-5 h-5" />
                </div>
                <h3 className="font-display font-semibold text-sm text-on-surface font-display">{t('lock.feature.trash.title')}</h3>
                <p className="text-on-surface-variant text-[11.5px] leading-relaxed">
                  {t('lock.feature.trash.description')}
                </p>
              </div>

            </div>

            {/* Real-time System Indicators */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-on-surface-variant">
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
            <div className="w-full max-w-md surface-panel rounded-xl p-7 relative z-10 transition-all duration-300 hover:border-brand-primary/15 hover:shadow-brand-primary/5">
              <div className="flex flex-col items-center text-center mb-7">
                <div className="w-14 h-14 rounded-xl bg-brand-primary/10 border border-brand-primary/25 flex items-center justify-center mb-5 shadow-inner group">
                  <Lock className="w-7 h-7 text-brand-primary group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300" />
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
                      className="w-full bg-[#141614] hover:bg-[#181a18] focus:bg-[#1a1c1a] border border-outline-variant/20 focus:border-brand-primary/30 rounded-xl pl-4 pr-11 py-3.5 text-on-surface placeholder-on-surface-variant/20 focus:ring-2 focus:ring-brand-primary/10 focus:shadow-[0_0_15px_rgba(220,225,255,0.06)] focus:outline-none transition-all duration-300 text-center tracking-widest text-lg font-mono"
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
                        className="w-full bg-[#141614] hover:bg-[#181a18] focus:bg-[#1a1c1a] border border-outline-variant/20 focus:border-brand-primary/30 rounded-xl pl-4 pr-11 py-3.5 text-on-surface placeholder-on-surface-variant/20 focus:ring-2 focus:ring-brand-primary/10 focus:shadow-[0_0_15px_rgba(220,225,255,0.06)] focus:outline-none transition-all duration-300 text-center tracking-widest text-lg font-mono"
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

                {(!isSetup || requiresSecretKey) && (
                  <div className="rounded-2xl glass-panel p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
                        <KeyRound className="w-4.5 h-4.5" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold text-on-surface">{t('lock.secret.title')}</p>
                        <p className="text-[11px] leading-relaxed text-on-surface-variant mt-1">
                          {isSetup ? t('lock.secret.unlockDescription') : t('lock.secret.setupDescription')}
                        </p>
                      </div>
                    </div>

                    <label className="block">
                      <span className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
                        {t('lock.secret.label')}
                      </span>
                      <input
                        data-testid="lock-secret-key-input"
                        type="text"
                        value={secretKey}
                        onChange={(e) => setSecretKey(e.target.value)}
                        readOnly={!isSetup}
                        className="w-full bg-[#141614] border border-outline-variant/30 rounded-xl px-3 py-3 text-on-surface focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-all text-center tracking-wider text-xs font-mono"
                        placeholder="A3-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                        required={requiresSecretKey}
                      />
                    </label>

                    <label className="flex items-start gap-2 text-left text-[11px] text-on-surface-variant cursor-pointer">
                      <input
                        data-testid="lock-remember-secret-key-checkbox"
                        type="checkbox"
                        checked={rememberSecretKey}
                        onChange={(e) => setRememberSecretKey(e.target.checked)}
                        className="mt-0.5 accent-brand-primary"
                      />
                      <span>{t('lock.secret.rememberThisDevice')}</span>
                    </label>

                    {!isSetup && (
                      <button
                        data-testid="lock-emergency-kit-button"
                        type="button"
                        onClick={handleDownloadEmergencyKit}
                        className="w-full flex items-center justify-center gap-2 text-xs font-bold border border-brand-primary/25 bg-brand-primary/10 hover:bg-brand-primary/15 text-brand-primary py-3 rounded-xl transition-all cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        <span>{t('lock.secret.downloadEmergencyKit')}</span>
                      </button>
                    )}
                  </div>
                )}

                {/* CTA Action button */}
                <button
                  data-testid="lock-submit-button"
                  type="submit"
                  disabled={isSetup && isLockedOut}
                  className="w-full flex items-center justify-center gap-2.5 bg-brand-primary text-brand-on-primary py-4 rounded-xl font-bold transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-lg shadow-brand-primary/10 hover:brightness-110"
                >
                  {isSetup ? (
                    <>
                      <Unlock className="w-4.5 h-4.5" />
                      <span>{isLockedOut ? `${lockoutRemainingSeconds}s` : t('lock.action.unlock')}</span>
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
