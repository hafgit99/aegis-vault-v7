/**
 * @file useSettingsEmergencyKit.ts
 * @description Owns the Emergency Kit download state and flow. Extracted from
 * SettingsPanel.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import { saveEmergencyKit } from '../lib/emergencyKit';
import { getRememberedAccountSecretKey, isAccountSecretKeyRequired } from '../lib/storage';
import { isAccountSecretKeyFormatValid } from '../lib/secretKey';

export function useSettingsEmergencyKit() {
  const { t } = useLanguage();
  const [emergencySecretKey, setEmergencySecretKey] = useState('');
  const [emergencyKitSuccess, setEmergencyKitSuccess] = useState<string | null>(null);
  const [emergencyKitError, setEmergencyKitError] = useState<string | null>(null);

  const handleDownloadEmergencyKit = async () => {
    setEmergencyKitSuccess(null);
    setEmergencyKitError(null);

    if (!isAccountSecretKeyRequired()) {
      setEmergencyKitError(t('settings.emergencyKit.notEnabled'));
      return;
    }

    const secretKey = getRememberedAccountSecretKey() ?? emergencySecretKey;
    if (!isAccountSecretKeyFormatValid(secretKey)) {
      setEmergencyKitError(t('settings.emergencyKit.invalidSecretKey'));
      return;
    }

    try {
      const saved = await saveEmergencyKit(secretKey);
      if (!saved) return;
      setEmergencySecretKey('');
      setEmergencyKitSuccess(t('settings.emergencyKit.success'));
      setTimeout(() => setEmergencyKitSuccess(null), 5000);
    } catch (err: any) {
      setEmergencyKitError(`${t('settings.emergencyKit.errorPrefix')}: ${err?.message || t('settings.export.defaultSaveError')}`);
    }
  };

  return {
    emergencySecretKey,
    onEmergencySecretKeyChange: setEmergencySecretKey,
    emergencyKitSuccess,
    emergencyKitError,
    handleDownloadEmergencyKit,
  };
}