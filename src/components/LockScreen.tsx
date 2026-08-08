/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Unlock, 
  ShieldAlert, 
  Fingerprint, 
  Eye, 
  EyeOff, 
  Trash2,
  KeyRound,
  Download,
  Languages,
  AlertTriangle,
  RotateCcw,
  Smartphone,
  Key,
  HelpCircle,
  X,
  Lightbulb,
  Check,
} from 'lucide-react';
import {
  changeMasterPassword,
  getRememberedAccountSecretKey,
  isAccountSecretKeyRequired,
  isMasterPasswordSet,
  resetSystem,
  setupMasterPasswordWithSecretKey,
  verifyMasterPassword,
} from '../lib/storage';
import { authenticateBiometric, isBiometricEnabled, isBiometricSupported, getBiometricType } from '../lib/biometric';
import { APP_NAME } from '../lib/branding';
import { useLanguage } from '../i18n/LanguageContext';
import { supportedLanguages, languageLabels, languageFlags, type LanguageCode } from '../i18n/translations';
import {
  generateAccountSecretKey,
  isAccountSecretKeyFormatValid,
} from '../lib/secretKey';
import aegisLogo from '../../assets/aegis-app-icon.png';
import { saveEmergencyKit } from '../lib/emergencyKit';
import { validateMasterPassword } from '../lib/security';
import { isRecoveryKeySetup, recoverWithRecoveryKey } from '../lib/recoveryKey';
import { getPasswordHint } from '../lib/passwordHint';

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
  isAutofillPending?: boolean;
  integrityWarning?: boolean;
}

export default function LockScreen({ onUnlock, isAutofillPending = false, integrityWarning = false }: LockScreenProps) {
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
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // Biometric Unlock States
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const isBiometricPendingRef = React.useRef(false);
  const hasAutoTriggeredRef = React.useRef(false);

  // Password Recovery Center States
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [activeRecoveryTab, setActiveRecoveryTab] = useState<'key' | 'hint' | 'biometric'>('key');
  const [recoveryInputWords, setRecoveryInputWords] = useState('');
  const [recoveredMasterPassword, setRecoveredMasterPassword] = useState<string | null>(null);
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const [recoveryModalError, setRecoveryModalError] = useState<string | null>(null);
  const [recoveryModalSuccess, setRecoveryModalSuccess] = useState<string | null>(null);
  const [recoveryModalLoading, setRecoveryModalLoading] = useState(false);

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
    } catch (err: any) {
      setRecoveryModalError(getBiometricUnlockErrorMessage(err, t));
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
      clearLockoutState();
      setTimeout(() => {
        onUnlock();
      }, 800);
    } catch (err) {
      setRecoveryModalError(err instanceof Error ? err.message : String(err));
    } finally {
      setRecoveryModalLoading(false);
    }
  };

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
    if (isBiometricPendingRef.current) return;
    isBiometricPendingRef.current = true;
    
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
      isBiometricPendingRef.current = false;
    }
  }, [onUnlock, rememberedSecretKey, t]);

  // Auto trigger biometric prompt on lock screen if enabled
  React.useEffect(() => {
    if (isSetup && isBioEnabled && !hasAutoTriggeredRef.current) {
      hasAutoTriggeredRef.current = true;
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

    try {
      if (!isSetup) {
        if (!validateMasterPassword(password)) {
          setError(t('lock.error.complexity'));
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
    } catch (err) {
      console.error('[AegisVault] Unlock/setup error:', err);
      const message = err instanceof Error ? err.message : String(err);
      setError(`${t('lock.error.cryptoFailed') || 'Vault initialization failed.'} (${message})`);
    }
  };

  const handleDownloadEmergencyKit = async () => {
    try {
      const saved = await saveEmergencyKit(secretKey);
      if (!saved) {
        setError(t('lock.error.emergencyKitCancelled'));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`${t('lock.error.emergencyKitSaveFailed')} (${message})`);
    }
  };

  return (
    <div className="safe-screen bg-brand-bg text-on-surface flex flex-col justify-between relative overflow-hidden select-none">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(220,225,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(220,225,255,0.025)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-brand-primary/5 blur-[120px] rounded-full pointer-events-none animate-pulse" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-brand-tertiary/5 blur-[120px] rounded-full pointer-events-none" />

      {/* Top Bar with Language Selector */}
      <header className="absolute top-[max(env(safe-area-inset-top),0.5rem)] right-[max(env(safe-area-inset-right),1rem)] sm:right-[max(env(safe-area-inset-right),1.5rem)] z-50">
        <div className="flex items-center gap-2 bg-surface-low/60 backdrop-blur-md rounded-lg px-3 py-1.5 border border-outline-variant/10">
          <Languages className="w-4 h-4 text-brand-primary" />
          <select
            data-testid="lock-language-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value as LanguageCode)}
            className="bg-transparent text-xs font-bold text-on-surface focus:outline-none cursor-pointer pr-1"
          >
            {supportedLanguages.map((code) => (
              <option key={code} value={code} className="bg-surface-lowest text-on-surface">
                {languageFlags[code]}  {languageLabels[code]}
              </option>
            ))}
          </select>
        </div>
      </header>

      {integrityWarning && (
        <div
          data-testid="asset-integrity-warning"
          role="alert"
          className="relative z-40 mx-auto mt-[calc(max(env(safe-area-inset-top),0.5rem)+3.25rem)] w-[calc(100%-2rem)] max-w-3xl border border-red-500/40 bg-red-950/95 px-4 py-3 text-red-50 shadow-2xl"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <div className="min-w-0">
              <p className="text-sm font-bold">{t('security.assetIntegrityTitle')}</p>
              <p className="mt-1 text-xs leading-relaxed text-red-100/85">{t('security.assetIntegrityMessage')}</p>
            </div>
          </div>
        </div>
      )}
      <div className="flex-1 w-full max-w-6xl mx-auto px-4 py-1 sm:py-2 flex items-center justify-center relative z-10">
        <div className="w-full flex items-center justify-center">
          <div className="w-full flex flex-col lg:flex-row items-center lg:items-stretch gap-6 lg:gap-10">

            {/* Left Panel — Branding, Description & Feature Cards (Desktop only) */}
            <div className="hidden lg:flex flex-col justify-center flex-1 max-w-2xl space-y-8 pr-4">
              {/* Title & Description */}
              <div className="space-y-5">
                <div className="flex items-center gap-4 mb-1">
                  <div className="w-16 h-16 rounded-2xl bg-brand-primary/5 border border-brand-primary/20 flex items-center justify-center shadow-[0_0_25px_rgba(220,225,255,0.07)] overflow-hidden">
                    <img src={aegisLogo} alt="Aegis Vault Logo" className="w-14 h-14 object-contain" />
                  </div>
                  <span className="font-display text-2xl font-bold text-on-surface tracking-tight">{APP_NAME}</span>
                </div>
                <h2 className="font-display text-4xl font-bold text-on-surface leading-snug tracking-tight">
                  {isSetup ? t('lock.panel.unlockTitle') : t('lock.panel.setupTitle')}
                </h2>
                <p className="text-lg text-on-surface-variant/70 leading-relaxed">
                  {isSetup
                    ? t('lock.panel.unlockDescription')
                    : `${APP_NAME} ${t('lock.panel.setupDescriptionSuffix')}`}
                </p>
              </div>

              {/* Security Badges */}
              <div className="flex flex-wrap gap-3">
                {[
                  { icon: '🛡️', label: 'AES-256-GCM' },
                  { icon: '🔑', label: 'Argon2id KDF' },
                  { icon: '✈️', label: isSetup ? 'Offline-First' : 'Zero-Knowledge' },
                ].map((badge) => (
                  <span
                    key={badge.label}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-brand-primary/5 border border-brand-primary/10 text-sm font-bold text-brand-primary/80 tracking-wide uppercase"
                  >
                    <span>{badge.icon}</span>
                    {badge.label}
                  </span>
                ))}
              </div>

              {/* Feature Cards */}
              <div className="grid grid-cols-2 gap-5">
                {([
                  {
                    icon: <ShieldAlert className="w-6 h-6 text-brand-primary" />,
                    titleKey: 'lock.feature.zeroKnowledge.title' as const,
                    descKey: 'lock.feature.zeroKnowledge.description' as const,
                  },
                  {
                    icon: <KeyRound className="w-6 h-6 text-brand-primary" />,
                    titleKey: 'lock.feature.crypto.title' as const,
                    descKey: 'lock.feature.crypto.description' as const,
                  },
                  {
                    icon: <Download className="w-6 h-6 text-brand-primary" />,
                    titleKey: 'lock.feature.localControl.title' as const,
                    descKey: 'lock.feature.localControl.description' as const,
                  },
                  {
                    icon: <Trash2 className="w-6 h-6 text-brand-primary" />,
                    titleKey: 'lock.feature.trash.title' as const,
                    descKey: 'lock.feature.trash.description' as const,
                  },
                ] as const).map((feat) => (
                  <div
                    key={feat.titleKey}
                    className="group rounded-2xl glass-panel p-5 space-y-2.5 transition-all duration-300 hover:border-brand-primary/20 hover:shadow-brand-primary/5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-brand-primary/10 border border-brand-primary/15 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-300">
                        {feat.icon}
                      </div>
                      <span className="text-base font-bold text-on-surface leading-tight">{t(feat.titleKey)}</span>
                    </div>
                    <p className="text-sm text-on-surface-variant/60 leading-relaxed line-clamp-3">
                      {t(feat.descKey)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Footer badges */}
              <div className="flex items-center gap-5 pt-1">
                <span className="text-sm text-on-surface-variant/30 font-mono">© 2026 {t('lock.footer.name')}</span>
                <span className="text-sm text-on-surface-variant/30 font-mono">{t('lock.footer.crypto')}</span>
              </div>
            </div>

            {/* Right Panel — Login Form */}
            <div className="w-full max-w-md surface-panel rounded-xl p-5 relative z-10 transition-all duration-300 hover:border-brand-primary/15 hover:shadow-brand-primary/5">
              <div className="flex flex-col items-center text-center mb-4 sm:mb-6">
                <div className="w-12 h-12 rounded-xl bg-brand-primary/5 border border-brand-primary/20 flex items-center justify-center mb-3 sm:mb-4 shadow-[0_0_15px_rgba(220,225,255,0.05)] overflow-hidden group lg:hidden">
                  <img src={aegisLogo} alt="Aegis Vault Logo" className="w-10 h-10 object-contain group-hover:scale-105 transition-transform duration-300" />
                </div>
                <h1 className="font-display text-2xl font-bold text-on-surface leading-tight tracking-tight lg:hidden">
                  {isSetup ? t('lock.panel.unlockTitle') : t('lock.panel.setupTitle')}
                </h1>
                {/* Desktop form header */}
                <h1 className="hidden lg:block font-display text-xl font-bold text-on-surface leading-tight tracking-tight">
                  {isSetup ? t('lock.action.unlock') : t('lock.action.setup')}
                </h1>
                <p className="hidden lg:block text-xs text-on-surface-variant/60 mt-1.5 leading-relaxed max-w-xs">
                  {isSetup
                    ? t('lock.panel.unlockDescription')
                    : `${APP_NAME} ${t('lock.panel.setupDescriptionSuffix')}`}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
                {isAutofillPending && isSetup && (
                  <div
                    data-testid="lock-autofill-pending-banner"
                    className="flex items-start gap-3 p-4 rounded-xl bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-xs leading-relaxed animate-fade-in"
                  >
                    <Smartphone className="w-5 h-5 shrink-0 text-brand-primary mt-0.5" />
                    <div className="text-left">
                      <span className="block font-bold text-on-surface">{t('lock.autofill.title')}</span>
                      <span className="block mt-1 text-on-surface-variant">{t('lock.autofill.description')}</span>
                    </div>
                  </div>
                )}

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
                      className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 focus:border-brand-primary/30 rounded-xl pl-4 pr-11 py-3 sm:py-3.5 text-on-surface placeholder-on-surface-variant/20 focus:ring-2 focus:ring-brand-primary/10 focus:shadow-[0_0_15px_rgba(220,225,255,0.06)] focus:outline-none transition-all duration-300 text-center tracking-widest text-lg font-mono"
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
                        className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 focus:border-brand-primary/30 rounded-xl pl-4 pr-11 py-3 sm:py-3.5 text-on-surface placeholder-on-surface-variant/20 focus:ring-2 focus:ring-brand-primary/10 focus:shadow-[0_0_15px_rgba(220,225,255,0.06)] focus:outline-none transition-all duration-300 text-center tracking-widest text-lg font-mono"
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
                  <div className="rounded-2xl glass-panel p-3 sm:p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
                        <KeyRound className="w-4.5 h-4.5" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold text-on-surface">{t('lock.secret.title')}</p>
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
                        className="w-full bg-surface-lowest border border-outline-variant/30 rounded-xl px-3 py-2.5 sm:py-3 text-on-surface focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-all text-center tracking-wider text-xs font-mono"
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
                        className="w-full flex items-center justify-center gap-2 text-xs font-bold border border-brand-primary/25 bg-brand-primary/10 hover:bg-brand-primary/15 text-brand-primary py-2.5 sm:py-3 rounded-xl transition-all cursor-pointer"
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
                  className="w-full flex items-center justify-center gap-2.5 bg-brand-primary text-brand-on-primary py-3.5 sm:py-4 rounded-xl font-bold transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-lg shadow-brand-primary/10 hover:brightness-110"
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
                    {getBiometricType() === 'cross-platform' ? (
                      <Key className={`w-4.5 h-4.5 text-brand-primary ${biometricLoading ? 'animate-ping' : 'animate-pulse'}`} />
                    ) : (
                      <Fingerprint className={`w-4.5 h-4.5 text-brand-primary ${biometricLoading ? 'animate-ping' : 'animate-pulse'}`} />
                    )}
                    <span>
                      {biometricLoading 
                        ? t('lock.action.biometricLoading') 
                        : getBiometricType() === 'cross-platform'
                          ? t('lock.action.biometricFido2')
                          : t('lock.action.biometricPlatform')}
                    </span>
                  </button>
                )}
              </form>

              {/* Recovery Options & Reset Vault - only shown when vault is already set up */}
              {isSetup && (
                <div className="mt-5 pt-5 border-t border-outline-variant/10 space-y-2">
                  <button
                    data-testid="lock-forgot-password-button"
                    type="button"
                    onClick={() => {
                      setShowRecoveryModal(true);
                      setRecoveredMasterPassword(null);
                      setRecoveryModalError(null);
                      setRecoveryModalSuccess(null);
                    }}
                    className="w-full flex items-center justify-center gap-2 text-xs font-bold text-brand-primary hover:text-brand-primary/80 py-2.5 rounded-xl transition-all cursor-pointer bg-brand-primary/5 border border-brand-primary/10 hover:bg-brand-primary/10"
                  >
                    <HelpCircle className="w-4 h-4" />
                    <span>{t('lock.forgotPassword')}</span>
                  </button>

                  <button
                    data-testid="lock-reset-vault-button"
                    type="button"
                    onClick={() => setShowResetConfirm(true)}
                    className="w-full flex items-center justify-center gap-2 text-[11px] font-medium text-on-surface-variant/50 hover:text-red-400 py-2 rounded-xl transition-all cursor-pointer hover:bg-red-500/5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{t('lock.action.resetVault')}</span>
                  </button>
                </div>
              )}

            </div>
          </div>

        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm mx-4 surface-panel rounded-2xl p-6 space-y-5 animate-fade-in">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <h2 className="font-display text-lg font-bold text-on-surface">{t('lock.reset.title')}</h2>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                {t('lock.reset.description')}
              </p>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/5 border border-red-500/15">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-[11px] text-red-400 font-medium leading-relaxed">
                {t('lock.reset.warning')}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                data-testid="lock-reset-cancel-button"
                type="button"
                onClick={() => setShowResetConfirm(false)}
                disabled={resetLoading}
                className="flex-1 py-3 rounded-xl border border-outline-variant/20 text-on-surface text-xs font-bold hover:bg-surface-low transition-all cursor-pointer"
              >
                {t('lock.reset.cancel')}
              </button>
              <button
                data-testid="lock-reset-confirm-button"
                type="button"
                disabled={resetLoading}
                onClick={async () => {
                  setResetLoading(true);
                  try {
                    await resetSystem();
                    clearLockoutState();
                    setShowResetConfirm(false);
                    setPassword('');
                    setConfirmPassword('');
                    setError(null);
                    // Force full page reload to reset all in-memory state
                    window.location.reload();
                  } catch (err) {
                    console.error('[AegisVault] Reset failed:', err);
                    setError(err instanceof Error ? err.message : String(err));
                    setShowResetConfirm(false);
                  } finally {
                    setResetLoading(false);
                  }
                }}
                className="flex-1 py-3 rounded-xl bg-red-500/90 hover:bg-red-500 text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {resetLoading ? (
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>{resetLoading ? t('lock.reset.resetting') : t('lock.reset.confirm')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Recovery Center Modal */}
      {showRecoveryModal && (
        <div data-testid="lock-recovery-modal" className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-md animate-fade-in p-4 overflow-y-auto">
          <div className="w-full max-w-lg surface-panel rounded-2xl p-6 space-y-5 my-8 relative border border-outline-variant/15">
            <button
              data-testid="lock-recovery-modal-close"
              type="button"
              onClick={() => setShowRecoveryModal(false)}
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
        </div>
      )}

      {/* Futuristic clean footer */}
      <footer className="hidden w-full border-t border-outline-variant/5 py-4 bg-surface-lowest/40 text-center text-[10px] text-on-surface-variant/30 font-mono flex-col sm:flex-row items-center justify-between px-6 gap-2">
        <span>© 2026 {t('lock.footer.name')}</span>
        <span>{t('lock.footer.crypto')}</span>
      </footer>
    </div>
  );
}
