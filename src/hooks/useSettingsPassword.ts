/**
 * @file useSettingsPassword.ts
 * @description Owns the master-password rotation form state and validation
 * flow (current password check, complexity, confirmation, re-encryption
 * confirm). Extracted from SettingsPanel to shrink its orchestration body.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import { changeMasterPassword, verifyMasterPassword } from '../lib/storage';
import { validateMasterPassword } from '../lib/security';

interface UseSettingsPasswordOptions {
  onDatabaseChanged: () => void | Promise<void>;
}

export function useSettingsPassword({ onDatabaseChanged }: UseSettingsPasswordOptions) {
  const { t } = useLanguage();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<boolean>(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    const isCorrectOld = await verifyMasterPassword(oldPassword);
    if (!isCorrectOld) {
      setPasswordError(t('settings.password.error.current'));
      return;
    }
    if (!validateMasterPassword(newPassword)) {
      setPasswordError(t('settings.password.error.complexity'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('settings.password.error.mismatch'));
      return;
    }

    const confirmed = window.confirm(t('settings.password.confirmRotation'));
    if (!confirmed) {
      return;
    }

    try {
      await changeMasterPassword(oldPassword, newPassword);
      await onDatabaseChanged();
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : String(err || '');
      setPasswordError(errMessage === 'current-master-password-invalid'
        ? t('settings.password.error.current')
        : errMessage || t('settings.password.error.rotationFailed'));
      return;
    }

    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordSuccess(true);
    setTimeout(() => setPasswordSuccess(false), 4000);
  };

  return {
    oldPassword,
    newPassword,
    confirmPassword,
    passwordError,
    passwordSuccess,
    onOldPasswordChange: setOldPassword,
    onNewPasswordChange: setNewPassword,
    onConfirmPasswordChange: setConfirmPassword,
    handlePasswordChange,
  };
}
