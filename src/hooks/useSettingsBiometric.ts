/**
 * @file useSettingsBiometric.ts
 * @description Owns the device-lock (biometric / FIDO2) and Android Autofill
 * settings state plus their activation flows, including the master-password
 * confirmation modal for unsupported fallback registration. Extracted from
 * SettingsPanel.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import { disableBiometric, isBiometricEnabled, isBiometricSupported, registerBiometric } from '../lib/biometric';
import { getRememberedAccountSecretKey, verifyMasterPassword } from '../lib/storage';
import { withActiveAccountSecretKey, withActiveBackupPassword } from '../lib/vaultSession';
import { isAndroidAutofillEnabled, isAndroidAutofillSupported, openAndroidAutofillSettings } from '../lib/androidAutofill';
import type { TFunction } from '../i18n/LanguageContext';

function getBiometricSettingsErrorMessage(err: unknown, t: TFunction): string {
  const errorObj = err && typeof err === 'object' ? (err as { name?: string; code?: string; message?: string }) : null;
  if (errorObj?.name === "SecurityError" || errorObj?.name === "NotAllowedError") {
    return t('settings.biometric.permissionError');
  }

  switch (errorObj?.code) {
    case 'biometric.unsupported':
      return t('settings.biometric.unsupportedError');
    case 'biometric.registrationCancelled':
      return t('settings.biometric.registerFailed');
    case 'biometric.missingBundle':
    case 'biometric.authenticationCancelled':
    case 'biometric.integrityMismatch':
      return t('settings.biometric.genericError');
    default:
      return (errorObj?.message && errorObj.message.trim()) || (err instanceof Error && err.message.trim()) || t('settings.biometric.registerFailed');
  }
}

export function useSettingsBiometric() {
  const { t } = useLanguage();
  const [biometricEnabled, setBiometricEnabled] = useState(isBiometricEnabled());
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [biometricSuccess, setBiometricSuccess] = useState<string | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [isPasswordPromptOpen, setIsPasswordPromptOpen] = useState(false);
  const [pendingBiometricType, setPendingBiometricType] = useState<'platform' | 'cross-platform'>('platform');
  const [passwordPromptError, setPasswordPromptError] = useState<string | null>(null);
  const [isConfirmingBiometricPassword, setIsConfirmingBiometricPassword] = useState(false);
  const [autofillEnabled, setAutofillEnabled] = useState(isAndroidAutofillEnabled());
  const [autofillMessage, setAutofillMessage] = useState<string | null>(null);
  const [autofillError, setAutofillError] = useState<string | null>(null);

  const handleConfirmBiometricPassword = async (password: string) => {
    setIsConfirmingBiometricPassword(true);
    setPasswordPromptError(null);
    try {
      const activeSecretKey = await withActiveAccountSecretKey((sk) => sk);
      const rememberedSk = getRememberedAccountSecretKey();
      const effectiveSk = activeSecretKey || rememberedSk;

      const isValid = await verifyMasterPassword(password, effectiveSk);
      if (!isValid) {
        setPasswordPromptError(t('settings.password.error.current'));
        setIsConfirmingBiometricPassword(false);
        return;
      }

      await registerBiometric({
        masterPassword: password,
        secretKey: effectiveSk,
      }, pendingBiometricType);
      setIsPasswordPromptOpen(false);
      setBiometricEnabled(true);
      setBiometricSuccess(t('settings.biometric.enabledSuccess'));
    } catch (err: unknown) {
      setPasswordPromptError(getBiometricSettingsErrorMessage(err, t));
    } finally {
      setIsConfirmingBiometricPassword(false);
    }
  };

  const handleToggleBiometric = async (type: 'platform' | 'cross-platform' = 'platform') => {
    setBiometricError(null);
    setBiometricSuccess(null);

    if (biometricEnabled) {
      setBiometricLoading(true);
      try {
        disableBiometric();
        setBiometricEnabled(false);
        setBiometricSuccess(t('settings.biometric.disabledSuccess'));
      } catch (err: unknown) {
        const message = (err instanceof Error && err.message.trim()) ? err.message : t('settings.biometric.genericError');
        setBiometricError(message);
      } finally {
        setBiometricLoading(false);
      }
    } else {
      try {
        if (!isBiometricSupported()) {
          throw new Error(t('settings.biometric.unsupportedError'));
        }

        const autoPassword = await withActiveBackupPassword((backupPassword) => backupPassword);
        const activeSecretKey = await withActiveAccountSecretKey((secretKey) => secretKey);
        const rememberedSk = getRememberedAccountSecretKey();
        const effectiveSk = activeSecretKey || rememberedSk;

        if (autoPassword) {
          setBiometricLoading(true);
          try {
            await registerBiometric({
              masterPassword: autoPassword,
              secretKey: effectiveSk,
            }, type);
            setBiometricEnabled(true);
            setBiometricSuccess(t('settings.biometric.enabledSuccess'));
          } finally {
            setBiometricLoading(false);
          }
        } else {
          setPendingBiometricType(type);
          setPasswordPromptError(null);
          setIsPasswordPromptOpen(true);
        }
      } catch (err: unknown) {
        setBiometricError(getBiometricSettingsErrorMessage(err, t));
      }
    }
  };

  const handleOpenAndroidAutofillSettings = () => {
    setAutofillMessage(null);
    setAutofillError(null);

    if (!isAndroidAutofillSupported()) {
      setAutofillError(t('settings.autofill.unsupported'));
      return;
    }

    const opened = openAndroidAutofillSettings();
    if (!opened) {
      setAutofillError(t('settings.autofill.openFailed'));
      return;
    }

    setAutofillEnabled(isAndroidAutofillEnabled());
    setAutofillMessage(t('settings.autofill.opened'));
  };

  return {
    biometricEnabled,
    biometricError,
    biometricSuccess,
    biometricLoading,
    isPasswordPromptOpen,
    passwordPromptError,
    isConfirmingBiometricPassword,
    autofillEnabled,
    autofillMessage,
    autofillError,
    handleToggleBiometric,
    handleConfirmBiometricPassword,
    handleOpenAndroidAutofillSettings,
    closePasswordPrompt: () => {
      setIsPasswordPromptOpen(false);
      setPasswordPromptError(null);
    },
  };
}