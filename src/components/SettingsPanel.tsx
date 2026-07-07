/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import { 
  Settings, 
  ShieldAlert, 
  Download, 
  Upload, 
  Trash2, 
  Key, 
  Database, 
  RefreshCw, 
  Check, 
  CheckCircle, 
  Lock, 
  Clock, 
  ShieldCheck, 
  FileJson, 
  Unlock, 
  AlertCircle,
  Fingerprint,
  Smartphone,
  Cloud,
  CloudOff,
  Wifi,
  WifiOff,
  RotateCcw,
  Link
} from 'lucide-react';
import { changeMasterPassword, deleteVaultItem, getRememberedAccountSecretKey, getVaultItems, isAccountSecretKeyRequired, migrateActiveVaultStorageToWaSqlite, resetSystem, reseedDemoData, saveVaultItem, saveVaultItems, verifyMasterPassword } from '../lib/storage';
import { AppNotification, VaultItem } from '../types';
import { decryptDataWithPasswordSecure, encryptDataWithPasswordSecure } from '../lib/encryption';
import { parseUniversalImport, decodeFileBuffer } from '../lib/importer';
import { exportAllAttachments, importAttachments, deleteAttachments } from '../lib/attachments';
import { validateBackupPayload } from '../lib/backupValidation';
import { secureRandomToken } from '../lib/random';
import { registerBiometric, isBiometricEnabled, disableBiometric, isBiometricSupported, getBiometricType } from '../lib/biometric';
import { withActiveBackupPassword } from '../lib/vaultSession';
import { isNativeFileDialogSupported, openDesktopImportFile, saveDesktopExportFile } from '../lib/desktopFiles';
import { isAndroidRuntime } from '../lib/desktopStorage';
import { isAndroidAutofillEnabled, isAndroidAutofillSupported, openAndroidAutofillSettings } from '../lib/androidAutofill';
import { saveEmergencyKit, saveEmergencyKitPdf } from '../lib/emergencyKit';
import { invoke } from '@tauri-apps/api/core';
import { isAccountSecretKeyFormatValid } from '../lib/secretKey';
import { useLanguage } from '../i18n/LanguageContext';
import { progressWidthClass } from '../lib/progressWidth';
import { validateMasterPassword } from '../lib/security';
import type { LanguageCode } from '../i18n/translations';
import { SettingsLanguageCard } from './settings/SettingsLanguageCard';
import { SettingsThemeCard } from './settings/SettingsThemeCard';
import { SettingsPasswordCard } from './settings/SettingsPasswordCard';
import { SettingsStatsCard } from './settings/SettingsStatsCard';
import { BlockedRequestsPanel } from './settings/BlockedRequestsPanel';
import { SettingsBiometricCard } from './settings/SettingsBiometricCard';
import { SettingsAutofillCard } from './settings/SettingsAutofillCard';
import { SettingsSyncSection } from './settings/SettingsSyncSection';
import { SettingsBackupSection } from './settings/SettingsBackupSection';
import { SettingsDangerZone } from './settings/SettingsDangerZone';
import { PasskeyManager } from './PasskeyManager';
import {
  authenticatePasskey,
  passkeyErrorCodes,
  PasskeyError,
  recordToVaultFields,
  registerPasskey,
  vaultFieldsToRecord,
  type PasskeyRecord,
  type RegisterPasskeyInput,
} from '../lib/passkey';
import {
  getLastSyncTime,
  hasSyncConfig,
  validateWebDavConfig,
  WebDavSyncProvider,
  saveSyncConfig,
  clearSyncConfig,
  loadSyncConfig,
  createSyncProvider,
  performSync,
  saveLastSyncTime,
} from '../lib/sync';

interface SettingsPanelProps {
  onDatabaseChanged: () => void | Promise<void>;
  autoLockDuration: number;
  onAutoLockDurationChange: (duration: number) => void;
  onNotify?: (notification: AppNotification) => void;
}

function getBiometricSettingsErrorMessage(err: any, t: ReturnType<typeof useLanguage>['t']): string {
  if (err?.name === "SecurityError" || err?.name === "NotAllowedError") {
    return t('settings.biometric.permissionError');
  }

  switch (err?.code) {
    case 'biometric.unsupported':
      return t('settings.biometric.unsupportedError');
    case 'biometric.registrationCancelled':
      return t('settings.biometric.registerFailed');
    case 'biometric.missingBundle':
    case 'biometric.authenticationCancelled':
    case 'biometric.integrityMismatch':
      return t('settings.biometric.genericError');
    default:
      return err?.message || t('settings.biometric.registerFailed');
  }
}

function getBackupDecryptErrorMessage(err: any, t: ReturnType<typeof useLanguage>['t']): string {
  switch (err?.code) {
    case 'secureBackup.invalidJson':
    case 'legacyCrypto.invalidJson':
      return t('settings.import.decryptErrorInvalidJson');
    case 'secureBackup.missingFields':
    case 'legacyCrypto.missingFields':
      return t('settings.import.decryptErrorMissingFields');
    case 'secureBackup.checksumMismatch':
    case 'legacyCrypto.checksumMismatch':
    case 'legacyCrypto.integrityMismatch':
      return t('settings.import.decryptErrorIntegrity');
    case 'legacyCrypto.unsupportedEnvelope':
    case 'secureBackup.unsupportedLegacyEnvelope':
      return t('settings.import.decryptErrorUnsupported');
    case 'secureBackup.weakKdfParams':
      return t('settings.import.decryptErrorWeakParams');
    case 'secureBackup.kdfRuntimeFailure':
      return t('settings.import.decryptErrorKdfRuntime');
    case 'validation.invalidBackupFormat':
    case 'validation.missingItems':
    case 'validation.itemMissingRequiredFields':
      return t('settings.import.invalidList');
    case 'validation.attachmentTooLarge':
      return t('settings.import.errorAttachmentTooLarge') || 'Attachment size exceeds 250MB limit.';
    case 'validation.backupTooLarge':
      return t('settings.import.errorBackupTooLarge') || 'Backup file size exceeds 100MB limit.';
    case 'validation.attachmentCorruptData':
      return t('settings.import.errorAttachmentCorrupt') || 'Attachment data is corrupt.';
    default:
      return err?.message || t('settings.import.decryptErrorFallback');
  }
}

const isTestEnv = typeof window === 'undefined' || 
  (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('jsdom')) || 
  (typeof window !== 'undefined' && (window as any).__happyDOM__);

const maybeDelay = async (ms: number): Promise<void> => {
  if (isTestEnv) return;
  await new Promise(resolve => setTimeout(resolve, ms));
};

export default function SettingsPanel({ 
  onDatabaseChanged, 
  autoLockDuration, 
  onAutoLockDurationChange,
  onNotify,
}: SettingsPanelProps) {
  const { language, setLanguage, t } = useLanguage();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<boolean>(false);

  // Biometric Lock States
  const [biometricEnabled, setBiometricEnabled] = useState(isBiometricEnabled());
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [biometricSuccess, setBiometricSuccess] = useState<string | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [autofillEnabled, setAutofillEnabled] = useState(isAndroidAutofillEnabled());
  const [autofillMessage, setAutofillMessage] = useState<string | null>(null);
  const [autofillError, setAutofillError] = useState<string | null>(null);
  const [emergencySecretKey, setEmergencySecretKey] = useState('');
  const [emergencyKitSuccess, setEmergencyKitSuccess] = useState<string | null>(null);
  const [emergencyKitError, setEmergencyKitError] = useState<string | null>(null);
  const [storageMigrationStatus, setStorageMigrationStatus] = useState<'idle' | 'running' | 'promoted' | 'blocked' | 'error'>('idle');
  const [storageMigrationMessage, setStorageMigrationMessage] = useState<string | null>(null);
  const [passkeyStatusKey, setPasskeyStatusKey] = useState<Parameters<typeof t>[0] | null>(null);
  const [passkeyStatusKind, setPasskeyStatusKind] = useState<'success' | 'error' | 'info' | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  // â”€â”€ Extension Token Rotation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [tokenRotateStatus, setTokenRotateStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [tokenRotateMessage, setTokenRotateMessage] = useState<string | null>(null);

  // â”€â”€ Cloud Sync (WebDAV E2EE) States â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [syncProvider, setSyncProvider] = useState<'disabled' | 'webdav'>('disabled');
  const [syncUrl, setSyncUrl] = useState('');
  const [syncUsername, setSyncUsername] = useState('');
  const [syncPassword, setSyncPassword] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error' | 'conflict'>('idle');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncLastAt, setSyncLastAt] = useState<string | null>(null);
  const [syncTestResult, setSyncTestResult] = useState<string | null>(null);
  const [syncTestLoading, setSyncTestLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const syncTestSucceeded = syncTestResult === t('settings.sync.test.success');

  // Load last sync time and detect saved config on mount
  useEffect(() => {
    setSyncLastAt(getLastSyncTime());
    if (hasSyncConfig()) {
      setSyncProvider('webdav');
    }
  }, []);

  const handleSyncTest = async () => {
    const err = validateWebDavConfig({ url: syncUrl, username: syncUsername, password: syncPassword });
    if (err) { setSyncTestResult(`âŒ ${err}`); return; }
    setSyncTestLoading(true);
    setSyncTestResult(null);
    try {
      const provider = new WebDavSyncProvider(syncUrl, syncUsername, syncPassword);
      await provider.testConnection();
      setSyncTestResult(t('settings.sync.test.success'));
    } catch (e: any) {
      setSyncTestResult(t('settings.sync.test.failed') + (e?.message ? ` (${e.message})` : ''));
    } finally {
      setSyncTestLoading(false);
    }
  };

  const handleSyncSave = async () => {
    const err = validateWebDavConfig({ url: syncUrl, username: syncUsername, password: syncPassword });
    if (err) { setSyncMessage(`Error: ${err}`); return; }
    const saved = await withActiveBackupPassword(async (backupPassword) => {
      await saveSyncConfig({ type: 'webdav', url: syncUrl, username: syncUsername, password: syncPassword }, backupPassword);
      return true;
    });
    if (!saved) return;
    setSyncMessage(t('settings.sync.configure.save'));
  };
  const handleSyncDisable = async () => {
    clearSyncConfig();
    setSyncProvider('disabled');
    setSyncUrl(''); setSyncUsername(''); setSyncPassword('');
    setSyncMessage(null); setSyncStatus('idle');
  };


  const passkeyErrorToStatusKey = (error: unknown): Parameters<typeof t>[0] => {
    if (error instanceof PasskeyError) {
      if (error.code === passkeyErrorCodes.createCancelled) return 'passkey.create.cancelled';
      if (error.code === passkeyErrorCodes.rpIdOriginMismatch) return 'passkey.create.rpIdOriginMismatch';
      if (error.code === passkeyErrorCodes.missingRpId) return 'passkey.create.missingRpId';
      if (error.code === passkeyErrorCodes.missingUserName) return 'passkey.create.missingUserName';
      if (error.code === passkeyErrorCodes.unsupportedAlgorithm) return 'passkey.create.unsupportedAlgorithm';
      if (error.code === passkeyErrorCodes.sessionMissing) return 'passkey.create.sessionMissing';
      if (error.code === passkeyErrorCodes.unsupported) return 'passkey.create.failed';
    }
    return 'passkey.create.failed';
  };

  const reloadPasskeyItems = async () => {
    const latestItems = await getVaultItems();
    setItems(latestItems);
    return latestItems;
  };

  const handleCreatePasskey = async (input: RegisterPasskeyInput) => {
    setPasskeyBusy(true);
    setPasskeyStatusKey(null);
    try {
      const result = await registerPasskey(input);
      const now = new Date().toISOString();
      const item: VaultItem = {
        id: result.record.itemId,
        title: result.record.rpName || result.record.rpId,
        username: result.record.userName,
        password: '',
        url: result.record.rpId ? `https://${result.record.rpId}` : '',
        notes: '',
        createdAt: now,
        updatedAt: now,
        category: 'passkey',
        ...recordToVaultFields(result.record),
      };
      const saved = await saveVaultItem(item);
      setItems(saved);
      await onDatabaseChanged();
      setPasskeyStatusKey('passkey.create.success');
      setPasskeyStatusKind('success');
    } catch (error) {
      setPasskeyStatusKey(passkeyErrorToStatusKey(error));
      setPasskeyStatusKind('error');
    } finally {
      setPasskeyBusy(false);
    }
  };

  const handleAuthenticatePasskey = async (record: PasskeyRecord) => {
    setPasskeyBusy(true);
    setPasskeyStatusKey(null);
    try {
      const assertion = await authenticatePasskey({ rpId: record.rpId, credentialIds: [record.credentialId] });
      if (assertion.credentialId !== record.credentialId) throw new PasskeyError(passkeyErrorCodes.invalidCredentialId);
      const latestItems = await getVaultItems();
      const now = new Date().toISOString();
      const updatedItems = latestItems.map((item) => {
        if (item.id !== record.itemId) return item;
        return {
          ...item,
          passkeySignCount: (item.passkeySignCount ?? record.signCount ?? 0) + 1,
          passkeyLastUsedAt: now,
          updatedAt: now,
        };
      });
      const saved = await saveVaultItems(updatedItems);
      setItems(saved);
      await onDatabaseChanged();
      setPasskeyStatusKey('passkey.authenticate.success');
      setPasskeyStatusKind('success');
    } catch (error) {
      setPasskeyStatusKey(error instanceof PasskeyError && error.code === passkeyErrorCodes.createCancelled
        ? 'passkey.authenticate.cancelled'
        : 'passkey.authenticate.failed');
      setPasskeyStatusKind('error');
    } finally {
      setPasskeyBusy(false);
    }
  };

  const handleDeletePasskey = async (record: PasskeyRecord) => {
    const confirmed = window.confirm(`${t('passkey.list.deleteConfirmTitle')}\n\n${t('passkey.list.deleteConfirmMessage')}`);
    if (!confirmed) return;
    setPasskeyBusy(true);
    setPasskeyStatusKey(null);
    try {
      const saved = await deleteVaultItem(record.itemId);
      setItems(saved);
      await onDatabaseChanged();
      setPasskeyStatusKey('passkey.delete.success');
      setPasskeyStatusKind('success');
    } catch {
      await reloadPasskeyItems();
      setPasskeyStatusKey('passkey.delete.failed');
      setPasskeyStatusKind('error');
    } finally {
      setPasskeyBusy(false);
    }
  };

  const handleWaSqliteMigration = async () => {
    setStorageMigrationMessage(null);
    if (isAndroidRuntime()) {
      setStorageMigrationStatus('error');
      setStorageMigrationMessage(t('settings.storageMigration.androidUnsupported'));
      return;
    }

    const confirmed = window.confirm(t('settings.storageMigration.confirm'));
    if (!confirmed) return;

    setStorageMigrationStatus('running');
    try {
      const result = await migrateActiveVaultStorageToWaSqlite();
      if (result.status === 'promoted') {
        setStorageMigrationStatus('promoted');
        setStorageMigrationMessage(t('settings.storageMigration.promoted'));
        await onDatabaseChanged();
        onNotify?.({ title: t('settings.storageMigration.title'), message: t('settings.storageMigration.promoted'), type: 'success' });
        return;
      }

      setStorageMigrationStatus('blocked');
      const issuePreview = result.issues.slice(0, 3).join(', ');
      setStorageMigrationMessage(
        issuePreview
          ? `${t('settings.storageMigration.blocked')} (${issuePreview})`
          : t('settings.storageMigration.blocked'),
      );
    } catch (err: any) {
      setStorageMigrationStatus('error');
      const message = err?.message === 'vault-storage-active-migration-session-required'
        ? t('settings.storageMigration.missingSession')
        : err?.message === 'wa-sqlite-android-webview-wasm-memory-unsupported' || err?.message === 'wa-sqlite-webview-wasm-memory-unsupported'
          ? t('settings.storageMigration.androidUnsupported')
          : `${t('settings.storageMigration.error')}: ${err?.message || t('settings.biometric.genericError')}`;
      setStorageMigrationMessage(message);
    }
  };

  const handleRotatePairingToken = async () => {
    if (!window.__TAURI_INTERNALS__) return;
    setTokenRotateStatus('loading');
    setTokenRotateMessage(null);
    try {
      await invoke('rotate_pairing_token');
      setTokenRotateStatus('success');
      setTokenRotateMessage('Extension token rotated successfully. Reconnect the browser extension.');
      setTimeout(() => { setTokenRotateStatus('idle'); setTokenRotateMessage(null); }, 6000);
    } catch (err: any) {
      setTokenRotateStatus('error');
      setTokenRotateMessage(`Failed to rotate token: ${err?.message ?? String(err)}`);
    }
  };

  const handleSyncNow = async () => {
    const syncRun = await withActiveBackupPassword(async (backupPassword) => {
      setSyncLoading(true);
      setSyncStatus('syncing');
      setSyncMessage(null);
      try {
        const config = await loadSyncConfig(backupPassword);
        const provider = createSyncProvider(config);
        if (!provider) { setSyncStatus('error'); setSyncMessage(t('settings.sync.error.connection')); return; }
        const localItems = await getVaultItems();
        const result = await performSync(provider, localItems, backupPassword);
        if (result.status === 'error') {
          setSyncStatus('error');
          const code = result.error?.code ?? '';
          if (code.includes('auth')) setSyncMessage(t('settings.sync.error.auth'));
          else if (code.includes('upload')) setSyncMessage(t('settings.sync.error.upload'));
          else if (code.includes('download')) setSyncMessage(t('settings.sync.error.download'));
          else if (code.includes('checksum')) setSyncMessage(t('settings.sync.error.checksum'));
          else setSyncMessage(result.error?.message ?? t('settings.sync.error.connection'));
        } else {
          if (result.mergedItems && result.mergedItems.length > 0) {
            await saveVaultItems(result.mergedItems);
            await onDatabaseChanged();
          }
          const now = new Date().toISOString();
          saveLastSyncTime(now);
          setSyncLastAt(now);
          setSyncStatus(result.conflicts && result.conflicts.length > 0 ? 'conflict' : 'success');
          if (result.mergedCount && result.mergedCount > 0) {
            setSyncMessage(`${result.mergedCount} ${t('settings.sync.mergedItems')}`);
          }
        }
      } catch (e: any) {
        setSyncStatus('error');
        setSyncMessage(e?.message ?? t('settings.sync.error.connection'));
      } finally {
        setSyncLoading(false);
      }
    });
  };

  // Auto-Lock Option Selectors
  const lockOptions = [
    { value: 15, label: t('settings.autoLock.15s') },
    { value: 30, label: t('settings.autoLock.30s') },
    { value: 60, label: t('settings.autoLock.1m') },
    { value: 300, label: t('settings.autoLock.5m') },
    { value: 900, label: t('settings.autoLock.15m') },
    { value: 1800, label: t('settings.autoLock.30m') },
    { value: 3600, label: t('settings.autoLock.1h') },
    { value: 0, label: t('settings.autoLock.never') }
  ];

  // Encrypted Export States
  const [useMasterForBackup, setUseMasterForBackup] = useState(true);
  const [customBackupPassword, setCustomBackupPassword] = useState('');
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [plainExportArmed, setPlainExportArmed] = useState(false);
  const [plainExportConfirmation, setPlainExportConfirmation] = useState('');
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimerRef = useRef<any>(null);
  const holdIntervalRef = useRef<any>(null);

  // Universal Import unified state
  interface ImportState {
    status: 'idle' | 'reading' | 'detecting' | 'decrypting_pending' | 'decrypting' | 'mapping' | 'saving' | 'syncing' | 'finalizing' | 'success' | 'error';
    percent: number;
    message: string;
    errorMsg: string | null;
    successMsg: string | null;
    pendingEnvelope: any | null;
  }

  const [importState, setImportState] = useState<ImportState>({
    status: 'idle',
    percent: 0,
    message: '',
    errorMsg: null,
    successMsg: null,
    pendingEnvelope: null,
  });

  const [isDragOver, setIsDragOver] = useState(false);
  const [decryptPasswordInput, setDecryptPasswordInput] = useState('');
  const [items, setItems] = useState<VaultItem[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isMounted = true;
    getVaultItems().then((loaded) => {
      if (isMounted) {
        setItems(loaded);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const currentDateSlug = () => new Date().toISOString().split('T')[0];

  const downloadTextFile = (filename: string, contents: string) => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(contents);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', filename);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Helper clear-out
  const resetImportFlowState = () => {
    setImportState({
      status: 'idle',
      percent: 0,
      message: '',
      errorMsg: null,
      successMsg: null,
      pendingEnvelope: null,
    });
    setDecryptPasswordInput('');
  };

  // Handle Toggle Biometric Lock status
  const handleToggleBiometric = async (type: 'platform' | 'cross-platform' = 'platform') => {
    setBiometricError(null);
    setBiometricSuccess(null);
    setBiometricLoading(true);

    if (biometricEnabled) {
      try {
        disableBiometric();
        setBiometricEnabled(false);
        setBiometricSuccess(t('settings.biometric.disabledSuccess'));
      } catch (err: any) {
        setBiometricError(err?.message || t('settings.biometric.genericError'));
      } finally {
        setBiometricLoading(false);
      }
    } else {
      try {
        if (!isBiometricSupported()) {
          throw new Error(t('settings.biometric.unsupportedError'));
        }
        
        const registered = await withActiveBackupPassword(async (backupPassword) => {
          await registerBiometric(backupPassword, type);
          return true;
        });
        if (!registered) {
          throw new Error(t('settings.biometric.missingSessionError'));
        }
        setBiometricEnabled(true);
        setBiometricSuccess(t('settings.biometric.enabledSuccess'));
      } catch (err: any) {
        setBiometricError(getBiometricSettingsErrorMessage(err, t));
      } finally {
        setBiometricLoading(false);
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

  const handleDownloadEmergencyKitFromSettings = async () => {
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

  // Handle Master Password updating
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
    } catch (err: any) {
      setPasswordError(err?.message === 'current-master-password-invalid'
        ? t('settings.password.error.current')
        : err?.message || t('settings.password.error.rotationFailed'));
      return;
    }

    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordSuccess(true);
    setTimeout(() => setPasswordSuccess(false), 4000);
  };

  const startHoldExport = () => {
    if (plainExportConfirmation.trim().toUpperCase() !== 'EXPORT') {
      setBackupError(t('settings.export.plainConfirmMismatch'));
      return;
    }
    setBackupError(null);
    setHoldProgress(0);

    const duration = 3000;
    const intervalTime = 30;
    const step = 100 / (duration / intervalTime);

    let currentProgress = 0;

    holdIntervalRef.current = setInterval(() => {
      currentProgress += step;
      if (currentProgress >= 100) {
        setHoldProgress(100);
        clearInterval(holdIntervalRef.current!);
      } else {
        setHoldProgress(Math.floor(currentProgress));
      }
    }, intervalTime);

    holdTimerRef.current = setTimeout(async () => {
      clearInterval(holdIntervalRef.current!);
      setHoldProgress(0);
      await executePlainExport();
    }, duration);
  };

  const cancelHoldExport = () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    setHoldProgress(0);
  };

  // Generate a plain (unencrypted) json export download
  const handleExportPlain = () => {
    setBackupSuccess(null);
    setBackupError(null);
    if (!plainExportArmed) {
      setPlainExportArmed(true);
      setPlainExportConfirmation('');
    }
  };

  const executePlainExport = async () => {
    try {
      const latestItems = await getVaultItems();
      setItems(latestItems);
      const attachments = await exportAllAttachments();
      const envelope = {
        version: 7,
        items: latestItems,
        attachments,
      };
      const filename = `aegis_acik_yedek_${currentDateSlug()}.json`;
      const contents = JSON.stringify(envelope, null, 2);

      const savedWithDialog = await saveDesktopExportFile(filename, contents);
      if (!savedWithDialog) {
        if (isNativeFileDialogSupported()) {
          setBackupError(`${t('settings.export.plainErrorPrefix')}: ${t('settings.export.defaultSaveError')}`);
          return;
        }
        downloadTextFile(filename, contents);
      }
    } catch (err: any) {
      setBackupError(`${t('settings.export.plainErrorPrefix')}: ${err?.message || t('settings.export.defaultSaveError')}`);
      return;
    }
    setPlainExportArmed(false);
    setPlainExportConfirmation('');
    setBackupSuccess(t('settings.export.plainSuccess'));
    setTimeout(() => setBackupSuccess(null), 4000);
  };

  // Generate an ENCRYPTED secure export download
  const handleExportEncrypted = async (e: React.FormEvent) => {
    e.preventDefault();
    setBackupSuccess(null);
    setBackupError(null);

    const exportWithPassword = async (passwordToUse: string) => {
      try {
        const latestItems = await getVaultItems();
        setItems(latestItems);
        const attachments = await exportAllAttachments();
        const envelope = {
          version: 7,
          items: latestItems,
          attachments,
        };
        const encryptedJsonString = await encryptDataWithPasswordSecure(JSON.stringify(envelope), passwordToUse);
        const filename = `aegis_guvenli_yedek_${currentDateSlug()}.aegis`;
        const savedWithDialog = await saveDesktopExportFile(filename, encryptedJsonString);
        if (!savedWithDialog) {
          if (isNativeFileDialogSupported()) {
            setBackupError(`${t('settings.export.encryptErrorPrefix')}: ${t('settings.export.defaultSaveError')}`);
            return;
          }
          downloadTextFile(filename, encryptedJsonString);
        }

        setBackupSuccess(t('settings.export.encryptedSuccess'));
        setCustomBackupPassword('');
        setTimeout(() => setBackupSuccess(null), 5000);
      } catch (err: any) {
        setBackupError(`${t('settings.export.encryptErrorPrefix')}: ${err?.message || t('settings.export.defaultSaveError')}`);
      }
    };

    try {
      if (useMasterForBackup) {
        const exported = await withActiveBackupPassword(async (masterPassword) => {
          await exportWithPassword(masterPassword);
          return true;
        });
        if (!exported) {
          setBackupError(t('settings.export.missingMaster'));
          return;
        }
      } else {
        if (!customBackupPassword) {
          setBackupError(t('settings.export.missingPassword'));
          return;
        }
        if (customBackupPassword.length < 12) {
          setBackupError(t('settings.export.passwordTooShort'));
          return;
        }
        await exportWithPassword(customBackupPassword);
      }
    } catch (err: any) {
      setBackupError(`${t('settings.export.encryptErrorPrefix')}: ${err?.message || t('settings.export.defaultSaveError')}`);
    }
  };

  const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error || new Error('Dosya okunamadÄ±.'));
      reader.readAsArrayBuffer(file);
    });
  };

  const handleImportedItems = async (itemsList: any[], attachmentsList: any[] = []) => {
    const mappedItems: VaultItem[] = [];
    const nowStr = new Date().toISOString().split('T')[0];

    // Snapshot of current SQLite items state to support transactional rollback
    const originalItems = await getVaultItems();
    const originalItemIds = new Set(originalItems.map(item => item.id));
    const importedItemIds = itemsList.map(x => x.id).filter(Boolean) as string[];
    const newlyInsertedIds = importedItemIds.filter(id => !originalItemIds.has(id));
    const updatedOriginalItems = originalItems.filter(item => importedItemIds.includes(item.id));

    setImportState(prev => ({
      ...prev,
      status: 'mapping',
      percent: 20,
      message: t('settings.import.stage.mapping'),
    }));
    await maybeDelay(50);

    // Mapping runs synchronously in memory (<1ms)
    for (const x of itemsList) {
      if (x.title || x.username) {
        mappedItems.push({
          id: x.id || secureRandomToken(9),
          title: x.title || t('settings.import.defaultTitle'),
          username: x.username || '',
          password: x.password || '',
          url: x.url || '',
          notes: x.notes || '',
          totpSecret: x.totpSecret || '',
          createdAt: x.createdAt || nowStr,
          updatedAt: nowStr,
          category: x.category || 'login',
          favorite: !!x.favorite,
          
          // credit card fields
          cardholderName: x.cardholderName || '',
          cardNumber: x.cardNumber || '',
          cardExpiry: x.cardExpiry || '',
          cardCvv: x.cardCvv || '',
          cardPin: x.cardPin || '',

          // identity fields
          idFullName: x.idFullName || '',
          idNumber: x.idNumber || '',
          idBirthDate: x.idBirthDate || '',
          idExpiryDate: x.idExpiryDate || '',
          idGender: x.idGender || '',

          // passkey fields
          passkeyService: x.passkeyService || '',
          passkeyPublicId: x.passkeyPublicId || '',
          passkeyPrivateExponent: x.passkeyPrivateExponent || '',
        });
      }
    }

    let sqliteSuccess = false;
    let importedAttachmentIds: string[] = [];

    try {
      if (mappedItems.length > 0) {
        setImportState(prev => ({
          ...prev,
          status: 'saving',
          percent: 60,
          message: t('settings.import.stage.encrypting'),
        }));
        await maybeDelay(50);

        if (isTestEnv) {
          await saveVaultItems(mappedItems);
        } else {
          await saveVaultItems(mappedItems, (savedCount) => {
            const percent = 60 + Math.round((savedCount / mappedItems.length) * 20);
            setImportState(prev => ({
              ...prev,
              percent,
            }));
          });
        }
        sqliteSuccess = true;
      }

      // Import attachments to IndexedDB
      if (attachmentsList.length > 0) {
        setImportState(prev => ({
          ...prev,
          status: 'attachments_saving',
          percent: 85,
          message: 'Saving attachments...',
        }));
        await maybeDelay(50);
        importedAttachmentIds = await importAttachments(attachmentsList);
      }

    } catch (err: any) {
      // Automatic Rollback to prevent partial write state
      console.error('Import failed, initiating rollback...', err);
      
      if (sqliteSuccess) {
        try {
          // Delete newly inserted items
          for (const id of newlyInsertedIds) {
            await deleteVaultItem(id);
          }
          // Restore original items that were updated
          if (updatedOriginalItems.length > 0) {
            await saveVaultItems(updatedOriginalItems);
          }
        } catch (sqliteRollbackErr) {
          console.error('Failed to rollback SQLite items:', sqliteRollbackErr);
        }
      }

      if (importedAttachmentIds.length > 0) {
        try {
          await deleteAttachments(importedAttachmentIds);
        } catch (idbRollbackErr) {
          console.error('Failed to rollback IndexedDB attachments:', idbRollbackErr);
        }
      }

      throw err;
    }

    setImportState(prev => ({
      ...prev,
      status: 'finalizing',
      percent: 96,
      message: t('settings.import.stage.finalizing'),
    }));
    await maybeDelay(100);

    return mappedItems.length;
  };

  // Decrypts and unpacks encrypted .aegis uploads
  const handleDecryptAndImport = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!decryptPasswordInput) {
      setImportState(prev => ({
        ...prev,
        errorMsg: t('settings.import.emptyPassword'),
      }));
      return;
    }

    const envelope = importState.pendingEnvelope;

    setImportState({
      status: 'decrypting',
      percent: 5,
      message: t('settings.import.stage.decrypting'),
      errorMsg: null,
      successMsg: null,
      pendingEnvelope: envelope,
    });
    await maybeDelay(200);

    try {
      const decryptedDataStr = await decryptDataWithPasswordSecure(JSON.stringify(envelope), decryptPasswordInput);
      const parsedEnvelope = JSON.parse(decryptedDataStr);

      // Validate the backup schema (items and attachments)
      const { items, attachments } = validateBackupPayload(parsedEnvelope);

      const importedNum = await handleImportedItems(items, attachments);

      setImportState(prev => ({
        ...prev,
        status: 'syncing',
        percent: 98,
        message: t('settings.import.stage.syncing'),
      }));
      await maybeDelay(300);

      await onDatabaseChanged();

      setImportState({
        status: 'success',
        percent: 100,
        message: '',
        errorMsg: null,
        successMsg: `${t('settings.import.decryptSuccessPrefix')} ${importedNum} ${t('settings.import.importedPasswordSuffix')}`,
        pendingEnvelope: null,
      });
      setDecryptPasswordInput('');

      setTimeout(() => {
        setImportState(prev => prev.status === 'success' ? { ...prev, status: 'idle', successMsg: null } : prev);
      }, 4000);
    } catch (err: any) {
      setImportState({
        status: 'decrypting_pending',
        percent: 0,
        message: '',
        errorMsg: getBackupDecryptErrorMessage(err, t),
        successMsg: null,
        pendingEnvelope: envelope,
      });
    }
  };

  const importLabels = {
    errorEmpty: t('settings.import.parser.errorEmpty'),
    formatAegisJson: t('settings.import.parser.formatAegisJson'),
    formatBitwardenJson: t('settings.import.parser.formatBitwardenJson'),
    errorUnsupportedJson: t('settings.import.parser.errorUnsupportedJson'),
    errorJsonPrefix: t('settings.import.parser.errorJsonPrefix'),
    errorCsvHeader: t('settings.import.parser.errorCsvHeader'),
    formatBitwardenCsv: t('settings.import.parser.formatBitwardenCsv'),
    formatLastPassCsv: t('settings.import.parser.formatLastPassCsv'),
    formatChromeCsv: t('settings.import.parser.formatChromeCsv'),
    formatOnePasswordCsv: t('settings.import.parser.formatOnePasswordCsv'),
    untitledUniversal: t('settings.import.parser.untitledUniversal'),
    formatUniversalCsv: t('settings.import.parser.formatUniversalCsv'),
    errorCsvColumns: t('settings.import.parser.errorCsvColumns'),
  };

  const executeImportPipeline = async (file: File) => {
    setImportState({
      status: 'reading',
      percent: 5,
      message: t('settings.import.stage.reading'),
      errorMsg: null,
      successMsg: null,
      pendingEnvelope: null,
    });

    try {
      // 1. Hardened safety check for total backup size
      if (file.size > 100 * 1024 * 1024) {
        throw new Error(t('settings.import.errorBackupTooLarge') || 'Backup file size exceeds 100MB limit.');
      }

      const buffer = await readFileAsArrayBuffer(file);
      
      setImportState(prev => ({
        ...prev,
        status: 'detecting',
        percent: 15,
        message: t('settings.import.stage.detecting'),
      }));
      await maybeDelay(200);

      const decodedResult = decodeFileBuffer(buffer);

      // Check if it parses as our version 7 unencrypted envelope structure
      let parsedJson: any = null;
      try {
        parsedJson = JSON.parse(decodedResult.trim());
      } catch {}

      if (parsedJson && parsedJson.version === 7 && parsedJson.items) {
        // Strict Validation
        const { items, attachments } = validateBackupPayload(parsedJson, file.size);
        const count = await handleImportedItems(items, attachments);

        setImportState(prev => ({
          ...prev,
          status: 'syncing',
          percent: 98,
          message: t('settings.import.stage.syncing'),
        }));
        await maybeDelay(300);

        await onDatabaseChanged();

        setImportState({
          status: 'success',
          percent: 100,
          message: '',
          errorMsg: null,
          successMsg: `âœ“ Aegis JSON Backup ${t('settings.import.detectedSuccessMiddle')} ${count} ${t('settings.import.recordsLoadedSuffix')}`,
          pendingEnvelope: null,
        });

        setTimeout(() => {
          setImportState(prev => prev.status === 'success' ? { ...prev, status: 'idle', successMsg: null } : prev);
        }, 4000);
      } else {
        const scanResult = parseUniversalImport(decodedResult, importLabels);
        await maybeDelay(300);

        if (scanResult.type === 'error') {
          throw new Error(scanResult.message);
        }

        if (scanResult.type === 'encrypted_aegis') {
          setImportState({
            status: 'decrypting_pending',
            percent: 0,
            message: '',
            errorMsg: null,
            successMsg: null,
            pendingEnvelope: scanResult.envelope,
          });
        } else {
          // Validate the scanResult items list before saving to prevent corrupt metadata imports.
          // Pass fromUniversalImport: true so the validator tolerates CSV rows where
          // a single cell is empty (e.g. a row with only url+password and no title),
          // which would otherwise be rejected with the misleading
          // "Yedek dosyasının içi liste yapısında değil" error.
          const { items } = validateBackupPayload(scanResult.items, file.size, { fromUniversalImport: true });
          const count = await handleImportedItems(items);
          
          setImportState(prev => ({
            ...prev,
            status: 'syncing',
            percent: 98,
            message: t('settings.import.stage.syncing'),
          }));
          await maybeDelay(300);

          await onDatabaseChanged();

          setImportState({
            status: 'success',
            percent: 100,
            message: '',
            errorMsg: null,
            successMsg: `âœ“ ${scanResult.formatName} ${t('settings.import.detectedSuccessMiddle')} ${count} ${t('settings.import.recordsLoadedSuffix')}`,
            pendingEnvelope: null,
          });

          setTimeout(() => {
            setImportState(prev => prev.status === 'success' ? { ...prev, status: 'idle', successMsg: null } : prev);
          }, 4000);
        }
      }
    } catch (err: any) {
      const errorMsg = err?.code ? getBackupDecryptErrorMessage(err, t) : (err?.message || t('settings.import.errorFallback'));
      setImportState({
        status: 'error',
        percent: 0,
        message: '',
        errorMsg,
        successMsg: null,
        pendingEnvelope: null,
      });
    }
  };

  const triggerImportSelect = () => {
    if (isNativeFileDialogSupported()) {
      void (async () => {
        try {
          const selectedFile = await openDesktopImportFile();
          if (selectedFile) {
            executeImportPipeline(new File([selectedFile.contents], selectedFile.name));
          }
        } catch (err: any) {
          setImportState({
            status: 'error',
            percent: 0,
            message: '',
            errorMsg: err?.message || t('settings.import.fileSelectError'),
            successMsg: null,
            pendingEnvelope: null,
          });
        }
      })();
      return;
    }

    try {
      fileInputRef.current?.click();
    } catch (err: any) {
      setImportState({
        status: 'error',
        percent: 0,
        message: '',
        errorMsg: err?.message || t('settings.import.fileSelectError'),
        successMsg: null,
        pendingEnvelope: null,
      });
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = () => {
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const isImportActive = importState.status !== 'idle' && importState.status !== 'success' && importState.status !== 'error' && importState.status !== 'decrypting_pending';
    if (isImportActive) return;

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      executeImportPipeline(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      executeImportPipeline(e.target.files[0]);
    }
  };

  const triggerReseed = () => {
    void (async () => {
      const reseeded = await reseedDemoData();
      setItems(reseeded);
      onDatabaseChanged();
      onNotify?.({
        title: t('settings.demo.loadedTitle'),
        message: t('settings.demo.loadedMessage'),
        type: 'success',
      });
    })();
  };

  const triggerResetAll = () => {
    const confirmation = window.confirm(t('settings.danger.confirm'));
    if (confirmation) {
      void (async () => {
        await resetSystem();
        window.location.reload();
      })();
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-4xl mx-auto pb-6 sm:pb-10" id="settings-panel-container">
      {/* Title block */}
      <div className="flex items-center gap-3 mb-1 sm:mb-2" id="settings-title-section">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-amber-500/20">
          <Settings className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold font-display text-on-surface">{t('settings.title')}</h2>
          <p className="hidden sm:block text-xs text-on-surface-variant">{t('settings.subtitle')}</p>
        </div>
      </div>

      <SettingsLanguageCard
        language={language}
        onLanguageChange={setLanguage}
        t={t}
      />

      <SettingsThemeCard />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6" id="settings-top-row">
        <SettingsStatsCard
          itemCount={items.length}
          onReseedDemo={triggerReseed}
          t={t}
        />

        <SettingsPasswordCard
          oldPassword={oldPassword}
          newPassword={newPassword}
          confirmPassword={confirmPassword}
          passwordError={passwordError}
          passwordSuccess={passwordSuccess}
          onOldPasswordChange={setOldPassword}
          onNewPasswordChange={setNewPassword}
          onConfirmPasswordChange={setConfirmPassword}
          onSubmit={handlePasswordChange}
          t={t}
        />
      </div>

      {/* Emergency Kit Card */}
      <div data-testid="settings-emergency-kit-card" className="glass-panel p-4 sm:p-6 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 items-center border border-outline-variant/10" id="emergency-kit-settings-card">
        <div className="md:col-span-1 space-y-1.5">
          <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2">
            <Download className="w-4 h-4 text-brand-secondary" />
            <span>{t('settings.emergencyKit.title')}</span>
          </h3>
          <p className="hidden sm:block text-xs text-on-surface-variant leading-relaxed">
            {t('settings.emergencyKit.description')}
          </p>
        </div>

        <div className="md:col-span-2 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end bg-[#141614] p-3 sm:p-4 rounded-xl border border-outline-variant/10">
            <div>
              <label className="block text-[10px] font-bold text-on-surface-variant/85 uppercase mb-1.5">
                {t('settings.emergencyKit.secretKeyLabel')}
              </label>
              <input
                data-testid="settings-emergency-secret-key-input"
                type="password"
                value={emergencySecretKey}
                onChange={(e) => setEmergencySecretKey(e.target.value)}
                className="w-full bg-[#0f100f] border border-outline-variant/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 text-on-surface"
                placeholder={t('settings.emergencyKit.secretKeyPlaceholder')}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="mt-1.5 text-[11px] text-on-surface-variant leading-relaxed">
                {t('settings.emergencyKit.rememberedHint')}
              </p>
            </div>
            <button
              data-testid="settings-emergency-kit-download-button"
              type="button"
              onClick={handleDownloadEmergencyKitFromSettings}
              className="px-5 py-2.5 rounded-lg text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 shrink-0 bg-brand-secondary text-black hover:brightness-110 shadow-md shadow-brand-secondary/10"
            >
              <Download className="w-4 h-4" />
              <span>{t('settings.emergencyKit.download')}</span>
            </button>
          </div>

          {emergencyKitSuccess && (
            <div data-testid="settings-emergency-kit-success" className="p-3 bg-brand-tertiary/10 border border-brand-tertiary/20 rounded-lg text-brand-tertiary text-xs leading-relaxed animate-fade-in flex items-start gap-2">
              <Check className="w-4 h-4 shrink-0 text-brand-tertiary mt-0.5" />
              <span>{emergencyKitSuccess}</span>
            </div>
          )}

          {emergencyKitError && (
            <div data-testid="settings-emergency-kit-error" className="p-3 bg-brand-error/10 border border-brand-error/20 rounded-lg text-brand-error text-xs leading-relaxed animate-fade-in flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <span>{emergencyKitError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Dynamic Auto-Lock Interval Card */}
      <div className="glass-panel p-4 sm:p-6 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 items-center" id="auto-lock-settings-card">
        <div className="md:col-span-1 space-y-1.5">
          <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>{t('settings.autoLock.title')}</span>
          </h3>
          <p className="hidden sm:block text-xs text-on-surface-variant">
            {t('settings.autoLock.description')}
          </p>
        </div>
        
        <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {lockOptions.map((opt) => {
            const isSelected = autoLockDuration === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onAutoLockDurationChange(opt.value)}
                className={`py-3 px-2 rounded-xl text-xs font-bold text-center border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-brand-primary bg-brand-primary/15 text-brand-primary shadow-md'
                    : 'border-outline-variant/15 bg-[#141614] hover:bg-[#1f211f] text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Biometric Lock Settings Card */}
      <SettingsBiometricCard
        biometricEnabled={biometricEnabled}
        biometricLoading={biometricLoading}
        biometricSuccess={biometricSuccess}
        biometricError={biometricError}
        onToggleBiometric={handleToggleBiometric}
        t={t}
      />

      {/* Android Autofill Settings Card */}
      {isAndroidAutofillSupported() && (
        <SettingsAutofillCard
          autofillEnabled={autofillEnabled}
          autofillMessage={autofillMessage}
          autofillError={autofillError}
          onOpenAutofillSettings={handleOpenAndroidAutofillSettings}
          t={t}
        />
      )}

      {/* Passkey (WebAuthn) management */}
      <PasskeyManager
        records={items
          .map((item) => vaultFieldsToRecord(item.id, item))
          .filter((record): record is PasskeyRecord => record !== null)}
        t={t}
        statusKey={passkeyStatusKey}
        statusKind={passkeyStatusKind}
        busy={passkeyBusy}
        onCreatePasskey={handleCreatePasskey}
        onAuthenticatePasskey={handleAuthenticatePasskey}
        onDeletePasskey={handleDeletePasskey}
      />

      {/* Blocked Network Requests (Air-Gap policy log) */}
      <BlockedRequestsPanel />

      {/* Backup, Encryption, and Import Rows */}
      <SettingsBackupSection
        useMasterForBackup={useMasterForBackup}
        setUseMasterForBackup={setUseMasterForBackup}
        customBackupPassword={customBackupPassword}
        setCustomBackupPassword={setCustomBackupPassword}
        backupSuccess={backupSuccess}
        backupError={backupError}
        onExportEncrypted={handleExportEncrypted}
        onExportPlain={handleExportPlain}
        plainExportArmed={plainExportArmed}
        plainExportConfirmation={plainExportConfirmation}
        setPlainExportConfirmation={setPlainExportConfirmation}
        holdProgress={holdProgress}
        startHoldExport={startHoldExport}
        cancelHoldExport={cancelHoldExport}
        importState={importState}
        decryptPasswordInput={decryptPasswordInput}
        setDecryptPasswordInput={setDecryptPasswordInput}
        handleDecryptAndImport={handleDecryptAndImport}
        resetImportFlowState={resetImportFlowState}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        triggerImportSelect={triggerImportSelect}
        isDragOver={isDragOver}
        fileInputRef={fileInputRef}
        handleFileSelect={handleFileSelect}
        t={t}
      />

      {/* Storage Backend Migration Section */}
      <div className="p-4 sm:p-6 bg-surface-elevated border border-white/5 rounded-2xl space-y-4" id="storage-backend-section">
        <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-2">
          <Database className="w-4 h-4 text-brand-primary" />
          <span>{t('settings.storageMigration.title')}</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-start">
          <div className="space-y-3">
            <p className="text-xs text-on-surface-variant leading-relaxed">
              {t('settings.storageMigration.description')}
            </p>
            <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wider font-semibold">
              <span className="px-2.5 py-1 rounded-full border border-white/10 bg-surface text-on-surface-variant">
                {t('settings.storageMigration.current')}
              </span>
              <span className="px-2.5 py-1 rounded-full border border-brand-primary/30 bg-brand-primary/10 text-brand-primary">
                {t('settings.storageMigration.target')}
              </span>
            </div>
          </div>
          <button
            data-testid="wa-sqlite-migration-button"
            onClick={handleWaSqliteMigration}
            disabled={storageMigrationStatus === 'running'}
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 py-2.5 text-xs font-bold text-brand-on-primary transition-all hover:opacity-90 disabled:opacity-60 cursor-pointer"
          >
            {storageMigrationStatus === 'running' ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            <span>{storageMigrationStatus === 'running' ? t('settings.storageMigration.running') : t('settings.storageMigration.button')}</span>
          </button>
        </div>
        {storageMigrationMessage && (
          <div
            data-testid="wa-sqlite-migration-message"
            className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
              storageMigrationStatus === 'promoted'
                ? 'border-brand-tertiary/20 bg-brand-tertiary/10 text-brand-tertiary'
                : storageMigrationStatus === 'blocked'
                  ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-200'
                  : 'border-brand-error/20 bg-brand-error/10 text-brand-error'
            }`}
          >
            {storageMigrationStatus === 'promoted' ? <CheckCircle className="mt-0.5 w-3.5 h-3.5" /> : <AlertCircle className="mt-0.5 w-3.5 h-3.5" />}
            <span>{storageMigrationMessage}</span>
          </div>
        )}
      </div>

      {/* Cloud Sync (E2EE) Section */}
      <SettingsSyncSection
        syncProvider={syncProvider}
        setSyncProvider={setSyncProvider}
        syncUrl={syncUrl}
        setSyncUrl={setSyncUrl}
        syncUsername={syncUsername}
        setSyncUsername={setSyncUsername}
        syncPassword={syncPassword}
        setSyncPassword={setSyncPassword}
        syncStatus={syncStatus}
        syncMessage={syncMessage}
        syncLastAt={syncLastAt}
        syncTestResult={syncTestResult}
        syncTestLoading={syncTestLoading}
        syncLoading={syncLoading}
        onSyncTest={handleSyncTest}
        onSyncSave={handleSyncSave}
        onSyncDisable={handleSyncDisable}
        onSyncNow={handleSyncNow}
        t={t}
      />

      {/* Extension Token Rotation â€” desktop only */}
      {typeof window !== 'undefined' && window.__TAURI_INTERNALS__ && (
        <div className="p-4 sm:p-6 bg-brand-surface-container rounded-2xl border border-white/8 space-y-3" id="extension-token-section">
          <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2 border-b border-white/5 pb-2">
            <RefreshCw className="w-4 h-4 text-brand-primary" />
            <span>{t('settings.extension.title')}</span>
          </h3>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            {t('settings.extension.description')}
          </p>
          <button
            id="rotate-extension-token-btn"
            onClick={handleRotatePairingToken}
            disabled={tokenRotateStatus === 'loading'}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-brand-primary/40 hover:bg-brand-primary/10 text-brand-primary font-semibold text-xs transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${tokenRotateStatus === 'loading' ? 'animate-spin' : ''}`} />
            <span>{tokenRotateStatus === 'loading' ? t('settings.extension.rotating') : t('settings.extension.rotateBtn')}</span>
          </button>
          {tokenRotateMessage && (
            <p className={`text-xs px-1 ${tokenRotateStatus === 'success' ? 'text-green-400' : 'text-red-400'}`}>
              {tokenRotateMessage}
            </p>
          )}
        </div>
      )}

      {/* Extreme Danger Zone */}
      <SettingsDangerZone
        onResetAll={triggerResetAll}
        t={t}
      />
    </div>
  );
}


