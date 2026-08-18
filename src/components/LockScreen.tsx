/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Unlock, 
  ShieldAlert, 
  Fingerprint, 
  Eye, 
  EyeOff, 
  Trash2,
  KeyRound, 
  Download, 
  RotateCcw, 
  Smartphone, 
  HelpCircle,
  ArrowUpSquare,
  ShieldCheck,
  Cpu,
  GlobeLock
} from 'lucide-react';
import {
  getRememberedAccountSecretKey,
  isAccountSecretKeyRequired,
  isMasterPasswordSet,
  resetSystem,
  setupMasterPasswordWithSecretKey,
  verifyMasterPassword,
} from '../lib/storage';
import {
  authenticateBiometric,
  isBiometricEnabled,
  isBiometricSupported,
  isBiometricV2UpgradeRequired,
  getBiometricType,
} from '../lib/biometric';
import { APP_NAME } from '../lib/branding';
import { useLanguage } from '../i18n/LanguageContext';
import {
  generateAccountSecretKey,
  isAccountSecretKeyFormatValid,
} from '../lib/secretKey';
import aegisLogo from '../../assets/aegis-app-icon.png';
import { saveEmergencyKit } from '../lib/emergencyKit';
import { validateMasterPassword } from '../lib/security';
import { LockScreenHeader } from './lock/LockScreenHeader';
import { LockScreenSecretKeySection } from './lock/LockScreenSecretKeySection';
import { LockScreenBiometricSection } from './lock/LockScreenBiometricSection';
import { LockScreenResetModal } from './lock/LockScreenResetModal';
import { LockScreenRecoveryModal } from './lock/LockScreenRecoveryModal';
import { LegalTermsModal, LegalTermsTab } from './lock/LegalTermsModal';
import { PasswordStrengthMeter } from './common/PasswordStrengthMeter';

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
  onUnlock?: () => void;
  isAutofillPending?: boolean;
  integrityWarning?: boolean;
}

export default function LockScreen({ onUnlock = () => {}, isAutofillPending = false, integrityWarning = false }: LockScreenProps) {
  const { t } = useLanguage();
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

  // Micro-interaction UI states
  const [isShaking, setIsShaking] = useState(false);
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);

  // Biometric Unlock States
  const [biometricError, setBiometricError] = useState<string | null>(() => {
    if (isBiometricV2UpgradeRequired()) {
      return t('lock.error.biometricV2Upgrade');
    }
    return null;
  });
  const [biometricLoading, setBiometricLoading] = useState(false);
  const isBiometricPendingRef = useRef(false);
  const hasAutoTriggeredRef = useRef(false);

  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<LegalTermsTab>('terms');

  const isBioEnabled = isBiometricEnabled();
  const lockoutRemainingSeconds = Math.ceil(lockoutRemainingMs / 1000);
  const isLockedOut = lockoutRemainingMs > 0;

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  useEffect(() => {
    if (!isLockedOut) return;

    const interval = window.setInterval(() => {
      setLockoutRemainingMs(getLockoutRemainingMs());
    }, 250);

    return () => window.clearInterval(interval);
  }, [isLockedOut]);

  const getRateLimitMessage = (remainingSeconds: number) =>
    `${t('lock.error.rateLimitedPrefix')} ${remainingSeconds} ${t('lock.error.rateLimitedSuffix')}`;

  const handleBiometricUnlock = useCallback(async () => {
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
      const currentRemembered = getRememberedAccountSecretKey();
      if (await verifyMasterPassword(decryptedMaster, currentRemembered)) {
        onUnlock();
      } else {
        triggerShake();
        throw new Error(t('lock.error.biometricIntegrity'));
      }
    } catch (err: any) {
      setBiometricError(getBiometricUnlockErrorMessage(err, t));
    } finally {
      setBiometricLoading(false);
      isBiometricPendingRef.current = false;
    }
  }, [onUnlock, t]);

  // Auto trigger biometric prompt on lock screen if enabled
  useEffect(() => {
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
          triggerShake();
          setError(t('lock.error.complexity'));
          return;
        }
        if (password !== confirmPassword) {
          triggerShake();
          setError(t('lock.error.confirmationMismatch'));
          return;
        }
        if (!isAccountSecretKeyFormatValid(secretKey)) {
          triggerShake();
          setError(t('lock.error.secretKeyInvalid'));
          return;
        }
        if (!termsAccepted) {
          triggerShake();
          setError(t('lock.terms.errorRequired'));
          return;
        }
        await setupMasterPasswordWithSecretKey(password, secretKey, rememberSecretKey);
        clearLockoutState();
        onUnlock();
      } else {
        const remainingMs = getLockoutRemainingMs();
        if (remainingMs > 0) {
          triggerShake();
          setLockoutRemainingMs(remainingMs);
          setError(getRateLimitMessage(Math.ceil(remainingMs / 1000)));
          return;
        }

        const currentRemembered = getRememberedAccountSecretKey();
        const currentRequires = isAccountSecretKeyRequired();
        const submittedSecretKey = currentRequires ? (currentRemembered || secretKey) : null;
        if (currentRequires && !currentRemembered && !isAccountSecretKeyFormatValid(submittedSecretKey || '')) {
          triggerShake();
          setError(t('lock.error.secretKeyRequired'));
          return;
        }
        if (await verifyMasterPassword(password, submittedSecretKey)) {
          clearLockoutState();
          setLockoutRemainingMs(0);
          onUnlock();
        } else {
          triggerShake();
          const lockout = recordFailedUnlockAttempt();
          const remainingSeconds = Math.ceil((lockout.lockedUntil - Date.now()) / 1000);
          setLockoutRemainingMs(Math.max(0, lockout.lockedUntil - Date.now()));
          setError(`${t('lock.error.invalidPassword')} ${getRateLimitMessage(remainingSeconds)}`);
        }
      }
    } catch (err) {
      triggerShake();
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

  const handleConfirmReset = async () => {
    setResetLoading(true);
    try {
      await resetSystem();
      clearLockoutState();
      window.location.reload();
    } catch (err) {
      console.error('[AegisVault] Reset error:', err);
      const message = err instanceof Error ? err.message : String(err);
      setError(`${t('lock.error.resetFailed')} (${message})`);
      setShowResetConfirm(false);
    } finally {
      setResetLoading(false);
    }
  };

  const features = [
    {
      icon: <ShieldAlert className="w-6 h-6 text-brand-primary" />,
      titleKey: 'lock.feature.zeroKnowledge.title',
      descKey: 'lock.feature.zeroKnowledge.description',
    },
    {
      icon: <KeyRound className="w-6 h-6 text-brand-secondary" />,
      titleKey: 'lock.feature.crypto.title',
      descKey: 'lock.feature.crypto.description',
    },
    {
      icon: <Download className="w-6 h-6 text-brand-tertiary" />,
      titleKey: 'lock.feature.localControl.title',
      descKey: 'lock.feature.localControl.description',
    },
    {
      icon: <Trash2 className="w-6 h-6 text-brand-primary" />,
      titleKey: 'lock.feature.trash.title',
      descKey: 'lock.feature.trash.description',
    },
  ];

  return (
    <div className="safe-screen bg-brand-bg text-on-surface flex flex-col justify-between selection:bg-brand-primary/30 selection:text-white relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 -left-48 w-96 h-96 bg-brand-primary/10 rounded-full blur-[128px] pointer-events-none -z-10" />
      <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-brand-secondary/10 rounded-full blur-[128px] pointer-events-none -z-10" />

      {/* Cyber ambient grid lines */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:48px_48px] opacity-40 -z-10" />

      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 flex-1 flex flex-col">
        {/* Top bar with Language Switcher */}
        <LockScreenHeader />

        {/* Main Content: Split Grid on Desktop */}
        <div className="flex-1 flex items-center justify-center py-4 lg:py-0">
          <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            
            {/* Left Panel — Brand Showcase (Desktop only: 7 columns on desktop) */}
            <div className="hidden lg:flex lg:col-span-7 flex-col justify-center h-full py-4 space-y-7 animate-fade-in text-left pr-4">
              <div className="space-y-4">
                {/* Brand Logo and Title */}
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-16 h-16 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center shadow-[0_0_30px_rgba(220,225,255,0.1)] overflow-hidden group">
                    <img src={aegisLogo} alt="Aegis Vault Logo" className="w-14 h-14 object-contain group-hover:scale-105 transition-transform duration-300" />
                  </div>
                  <div>
                    <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
                      {APP_NAME}
                    </h2>
                    <span className="text-xs sm:text-sm font-mono font-bold text-brand-primary/90 tracking-widest uppercase">
                      {isSetup ? t('lock.panel.unlockTitle') : t('lock.panel.setupTitle')}
                    </span>
                  </div>
                </div>

                {/* Hero Title & Description */}
                <h3 className="font-display text-2xl xl:text-3xl font-extrabold text-on-surface leading-tight tracking-tight">
                  {isSetup ? t('lock.panel.unlockTitle') : t('lock.panel.setupTitle')}
                </h3>
                <p className="text-base sm:text-lg text-on-surface-variant/80 leading-relaxed max-w-xl">
                  {isSetup
                    ? t('lock.panel.unlockDescription')
                    : `${APP_NAME} ${t('lock.panel.setupDescriptionSuffix')}`}
                </p>

                {/* Security Badges */}
                <div className="flex flex-wrap gap-3 pt-1">
                  {[
                    { icon: '🛡️', label: 'AES-256-GCM' },
                    { icon: '🧠', label: 'Argon2id KDF' },
                    { icon: '🔒', label: isSetup ? 'Offline-First' : 'Zero-Knowledge' },
                  ].map((badge) => (
                    <span
                      key={badge.label}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-primary/10 border border-brand-primary/20 text-xs sm:text-sm font-bold text-brand-primary font-mono tracking-wider uppercase shadow-sm"
                    >
                      <span>{badge.icon}</span>
                      {badge.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Feature Cards Grid - Large, spacious, and readable */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 max-w-2xl pt-2">
                {features.map((feat) => (
                  <div
                    key={feat.titleKey}
                    className="p-5 sm:p-6 rounded-2xl glass-panel space-y-3 transition-all duration-300 hover:border-brand-primary/40 hover:scale-[1.03] hover:shadow-xl hover:shadow-brand-primary/5 group"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
                        {feat.icon}
                      </div>
                      <span className="text-base font-bold text-on-surface leading-snug tracking-tight">{t(feat.titleKey as any)}</span>
                    </div>
                    <p className="text-xs sm:text-sm text-on-surface-variant/80 leading-relaxed line-clamp-3">
                      {t(feat.descKey as any)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Footer copyright */}
              <div className="flex items-center gap-5 pt-2">
                <span className="text-xs sm:text-sm text-on-surface-variant/40 font-mono">© 2026 {t('lock.footer.name')}</span>
              </div>
            </div>

            {/* Right Panel — Login Form Container (5 columns on desktop) */}
            <div className="relative w-full max-w-md mx-auto lg:col-span-5">
              {/* Ambient Glow Aura */}
              <div className="absolute -inset-1.5 bg-gradient-to-r from-brand-primary/25 via-emerald-500/15 to-brand-secondary/25 rounded-2xl blur-xl opacity-60 animate-ambient-glow -z-10 pointer-events-none" />

              <div className={`w-full surface-panel rounded-2xl p-5 sm:p-6 relative z-10 transition-all duration-300 hover:border-brand-primary/30 hover:shadow-brand-primary/5 ${isShaking ? 'animate-shake border-red-500/50 ring-2 ring-red-500/20' : ''}`}>
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
                  {integrityWarning && (
                  <div
                    data-testid="asset-integrity-warning"
                    className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs leading-relaxed animate-fade-in text-left"
                  >
                    <ShieldAlert className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                    <div>
                      <span className="block font-bold text-on-surface">
                        {t('security.assetIntegrityTitle')}
                      </span>
                      <span className="block mt-1 text-on-surface-variant/80">
                        {t('security.assetIntegrityMessage')}
                      </span>
                    </div>
                  </div>
                )}

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
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-brand-error/10 border border-brand-error/20 text-brand-error text-xs leading-relaxed animate-fade-in text-left">
                      <ShieldAlert className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  {biometricError && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-brand-error/10 border border-brand-error/20 text-red-400 text-xs leading-relaxed animate-fade-in text-left">
                      <Fingerprint className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
                      <span>{biometricError}</span>
                    </div>
                  )}

                  {/* Primary Password Input Container */}
                  <div className="text-left">
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
                        onKeyDown={(e) => {
                          if (typeof e.getModifierState === 'function') {
                            setIsCapsLockOn(Boolean(e.getModifierState('CapsLock')));
                          }
                        }}
                        onKeyUp={(e) => {
                          if (typeof e.getModifierState === 'function') {
                            setIsCapsLockOn(Boolean(e.getModifierState('CapsLock')));
                          }
                        }}
                        onBlur={() => setIsCapsLockOn(false)}
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

                    {/* Caps Lock Detector Warning */}
                    {isCapsLockOn && (
                      <div
                        data-testid="caps-lock-warning"
                        className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 rounded-lg mt-2 animate-fade-in"
                      >
                        <ArrowUpSquare className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('lock.capsLockOn', 'BÜYÜK HARF AÇIK (Caps Lock)')}</span>
                      </div>
                    )}

                    {/* Setup Mode: Real-time Password Strength Meter */}
                    {!isSetup && password && (
                      <PasswordStrengthMeter password={password} />
                    )}
                  </div>

                  {/* Setup Mode: Password Confirmation */}
                  {!isSetup && (
                    <div className="text-left">
                      <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
                        {t('lock.field.confirmPassword')}
                      </label>
                      <div className="relative">
                        <input
                          data-testid="lock-confirm-password-input"
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          onKeyDown={(e) => setIsCapsLockOn(e.getModifierState('CapsLock'))}
                          onKeyUp={(e) => setIsCapsLockOn(e.getModifierState('CapsLock'))}
                          onBlur={() => setIsCapsLockOn(false)}
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

                  {/* Secret Key Section */}
                  <LockScreenSecretKeySection
                    secretKey={secretKey}
                    setSecretKey={setSecretKey}
                    isSetup={isSetup}
                    requiresSecretKey={requiresSecretKey}
                    rememberSecretKey={rememberSecretKey}
                    setRememberSecretKey={setRememberSecretKey}
                    onDownloadEmergencyKit={handleDownloadEmergencyKit}
                  />

                  {/* Terms of Service & Privacy Policy Consent for First-Time Setup */}
                  {!isSetup && (
                    <div className="pt-1 pb-0.5 text-left">
                      <label className="flex items-start gap-2.5 cursor-pointer text-xs text-on-surface-variant/90 select-none group">
                        <input
                          data-testid="lock-terms-checkbox"
                          type="checkbox"
                          checked={termsAccepted}
                          onChange={(e) => setTermsAccepted(e.target.checked)}
                          className="mt-0.5 w-4 h-4 rounded border-outline-variant/30 text-brand-primary focus:ring-brand-primary/20 accent-brand-primary cursor-pointer shrink-0"
                        />
                        <span className="leading-relaxed text-[11px] sm:text-xs">
                          {t('lock.terms.agreePrefix') ? `${t('lock.terms.agreePrefix')} ` : ''}
                          <button
                            data-testid="lock-terms-link"
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setLegalModalTab('terms');
                              setShowLegalModal(true);
                            }}
                            className="text-brand-primary underline hover:text-brand-primary/80 font-bold cursor-pointer inline p-0 bg-transparent border-none"
                          >
                            {t('lock.terms.termsLink')}
                          </button>
                          {` ${t('lock.terms.and')} `}
                          <button
                            data-testid="lock-privacy-link"
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setLegalModalTab('privacy');
                              setShowLegalModal(true);
                            }}
                            className="text-brand-primary underline hover:text-brand-primary/80 font-bold cursor-pointer inline p-0 bg-transparent border-none"
                          >
                            {t('lock.terms.privacyLink')}
                          </button>
                          {t('lock.terms.agreeSuffix') ? `${t('lock.terms.agreeSuffix')}` : ''}
                        </span>
                      </label>
                    </div>
                  )}

                  {/* CTA Action button */}
                  <button
                    data-testid="lock-submit-button"
                    type="submit"
                    disabled={isSetup && isLockedOut}
                    className="w-full flex items-center justify-center gap-2.5 bg-brand-primary text-brand-on-primary py-3.5 sm:py-4 rounded-xl font-bold transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer shadow-lg shadow-brand-primary/10 hover:brightness-110"
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
                  <LockScreenBiometricSection
                    isSetup={isSetup}
                    isBioEnabled={isBioEnabled}
                    biometricLoading={biometricLoading}
                    biometricType={getBiometricType()}
                    onBiometricUnlock={handleBiometricUnlock}
                  />
                </form>

                {/* Recovery Options & Reset Vault - only shown when vault is already set up */}
                {isSetup && (
                  <div className="mt-5 pt-5 border-t border-outline-variant/10 space-y-2">
                    <button
                      data-testid="lock-forgot-password-button"
                      type="button"
                      onClick={() => setShowRecoveryModal(true)}
                      className="w-full flex items-center justify-center gap-2 text-xs font-bold text-brand-primary hover:text-brand-primary/80 py-2.5 rounded-xl transition-all cursor-pointer bg-brand-primary/5 border border-brand-primary/10 hover:bg-brand-primary/10"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
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

                {/* Zero-Knowledge Security Trust Badges */}
                <div className="mt-4 pt-4 border-t border-outline-variant/10 flex items-center justify-between text-[9px] sm:text-[10px] font-mono text-on-surface-variant/60 select-none">
                  <div className="flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-brand-primary" />
                    <span>{t('lock.badge.aes', 'AES-256-GCM')}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-brand-secondary" />
                    <span>{t('lock.badge.argon2', 'Argon2id KDF')}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <GlobeLock className="w-3 h-3 text-brand-tertiary" />
                    <span>{t('lock.badge.offline', '%100 Çevrimdışı')}</span>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>

        {/* Reset Confirmation Modal */}
        <LockScreenResetModal
          isOpen={showResetConfirm}
          onClose={() => setShowResetConfirm(false)}
          onConfirmReset={handleConfirmReset}
          resetLoading={resetLoading}
        />

        {/* Password Recovery Center Modal */}
        <LockScreenRecoveryModal
          isOpen={showRecoveryModal}
          onClose={() => setShowRecoveryModal(false)}
          onUnlockedAfterRecovery={onUnlock}
          onClearLockoutState={clearLockoutState}
        />

        {/* Legal Terms & Privacy Policy Modal */}
        <LegalTermsModal
          isOpen={showLegalModal}
          onClose={() => setShowLegalModal(false)}
          initialTab={legalModalTab}
        />
      </div>

      {/* Futuristic clean footer */}
      <footer className="hidden w-full border-t border-outline-variant/5 py-4 bg-surface-lowest/40 text-center text-[10px] text-on-surface-variant/30 font-mono flex-col sm:flex-row items-center justify-between px-6 gap-2">
        <span>© 2026 {t('lock.footer.name')}</span>
        <span>{t('lock.footer.crypto')}</span>
      </footer>
    </div>
  );
}
