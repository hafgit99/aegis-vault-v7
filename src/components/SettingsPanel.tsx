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
  Fingerprint
} from 'lucide-react';
import { getVaultItems, setupMasterPassword, resetSystem, reseedDemoData, saveVaultItem, saveVaultItems, verifyMasterPassword } from '../lib/storage';
import { AppNotification, VaultItem } from '../types';
import { decryptDataWithPasswordSecure, encryptDataWithPasswordSecure } from '../lib/encryption';
import { parseUniversalImport, decodeFileBuffer } from '../lib/importer';
import { secureRandomToken } from '../lib/random';
import { registerBiometric, isBiometricEnabled, disableBiometric, isBiometricSupported } from '../lib/biometric';
import { getActiveBackupPassword, getActiveMasterPassword } from '../lib/vaultSession';
import { openDesktopImportFile, saveDesktopExportFile } from '../lib/desktopFiles';
import { isDesktopRuntime } from '../lib/desktopStorage';
import { useLanguage } from '../i18n/LanguageContext';
import { languageLabels, supportedLanguages, type LanguageCode } from '../i18n/translations';

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
      return t('settings.import.decryptErrorUnsupported');
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
  const handleToggleBiometric = async () => {
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
        
        const masterPassword = getActiveMasterPassword();
        if (!masterPassword) {
          throw new Error(t('settings.biometric.missingSessionError'));
        }
        
        await registerBiometric(masterPassword);
        setBiometricEnabled(true);
        setBiometricSuccess(t('settings.biometric.enabledSuccess'));
      } catch (err: any) {
        setBiometricError(getBiometricSettingsErrorMessage(err, t));
      } finally {
        setBiometricLoading(false);
      }
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
    if (newPassword.length < 12) {
      setPasswordError(t('settings.password.error.length'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('settings.password.error.mismatch'));
      return;
    }

    await setupMasterPassword(newPassword);
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordSuccess(true);
    setTimeout(() => setPasswordSuccess(false), 4000);
  };

  // Generate a plain (unencrypted) json export download
  const handleExportPlain = async () => {
    setBackupSuccess(null);
    setBackupError(null);
    const latestItems = await getVaultItems();
    setItems(latestItems);
    const filename = `aegis_acik_yedek_${currentDateSlug()}.json`;
    const contents = JSON.stringify(latestItems, null, 2);

    try {
      const savedWithDialog = await saveDesktopExportFile(filename, contents);
      if (!savedWithDialog) {
        if (isDesktopRuntime()) return;
        downloadTextFile(filename, contents);
      }
    } catch (err: any) {
      setBackupError(`${t('settings.export.plainErrorPrefix')}: ${err?.message || t('settings.export.defaultSaveError')}`);
      return;
    }
    setBackupSuccess(t('settings.export.plainSuccess'));
    setTimeout(() => setBackupSuccess(null), 4000);
  };

  // Generate an ENCRYPTED secure export download
  const handleExportEncrypted = async (e: React.FormEvent) => {
    e.preventDefault();
    setBackupSuccess(null);
    setBackupError(null);

    let passwordToUse = '';
    if (useMasterForBackup) {
      const masterPassword = getActiveBackupPassword();
      if (!masterPassword) {
        setBackupError(t('settings.export.missingMaster'));
        return;
      }
      passwordToUse = masterPassword;
    } else {
      if (!customBackupPassword) {
        setBackupError(t('settings.export.missingPassword'));
        return;
      }
      if (customBackupPassword.length < 12) {
        setBackupError(t('settings.export.passwordTooShort'));
        return;
      }
      passwordToUse = customBackupPassword;
    }

    try {
      const latestItems = await getVaultItems();
      setItems(latestItems);
      const encryptedJsonString = await encryptDataWithPasswordSecure(JSON.stringify(latestItems), passwordToUse);
      const filename = `aegis_guvenli_yedek_${currentDateSlug()}.aegis`;
      const savedWithDialog = await saveDesktopExportFile(filename, encryptedJsonString);
      if (!savedWithDialog) {
        if (isDesktopRuntime()) return;
        downloadTextFile(filename, encryptedJsonString);
      }

      setBackupSuccess(t('settings.export.encryptedSuccess'));
      setCustomBackupPassword('');
      setTimeout(() => setBackupSuccess(null), 5000);
    } catch (err: any) {
      setBackupError(`${t('settings.export.encryptErrorPrefix')}: ${err?.message}`);
    }
  };

  const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error || new Error('Dosya okunamadı.'));
      reader.readAsArrayBuffer(file);
    });
  };

  const handleImportedItems = async (itemsList: any[]) => {
    const mappedItems: VaultItem[] = [];
    const nowStr = new Date().toISOString().split('T')[0];

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
          const percent = 60 + Math.round((savedCount / mappedItems.length) * 35);
          setImportState(prev => ({
            ...prev,
            percent,
          }));
        });
      }
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
      const parsedItemsList = JSON.parse(decryptedDataStr);

      if (!Array.isArray(parsedItemsList)) {
        throw new Error(t('settings.import.invalidList'));
      }

      const importedNum = await handleImportedItems(parsedItemsList);

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
      const buffer = await readFileAsArrayBuffer(file);
      
      setImportState(prev => ({
        ...prev,
        status: 'detecting',
        percent: 15,
        message: t('settings.import.stage.detecting'),
      }));
      await maybeDelay(200);

      const decodedResult = decodeFileBuffer(buffer);
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
        const count = await handleImportedItems(scanResult.items);
        
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
          successMsg: `✓ ${scanResult.formatName} ${t('settings.import.detectedSuccessMiddle')} ${count} ${t('settings.import.recordsLoadedSuffix')}`,
          pendingEnvelope: null,
        });

        setTimeout(() => {
          setImportState(prev => prev.status === 'success' ? { ...prev, status: 'idle', successMsg: null } : prev);
        }, 4000);
      }
    } catch (err: any) {
      setImportState({
        status: 'error',
        percent: 0,
        message: '',
        errorMsg: err?.message || t('settings.import.errorFallback'),
        successMsg: null,
        pendingEnvelope: null,
      });
    }
  };

  const triggerImportSelect = () => {
    if (isDesktopRuntime()) {
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
    <div className="space-y-6 max-w-4xl mx-auto pb-10" id="settings-panel-container">
      {/* Title block */}
      <div className="flex items-center gap-3 mb-2" id="settings-title-section">
        <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-amber-500/20">
          <Settings className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold font-display text-on-surface">{t('settings.title')}</h2>
          <p className="text-xs text-on-surface-variant">{t('settings.subtitle')}</p>
        </div>
      </div>

      <section
        data-testid="language-settings-card"
        className="glass-panel p-6 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-6 items-center border border-outline-variant/10"
      >
        <div className="md:col-span-2 space-y-1.5">
          <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2">
            <Settings className="w-4 h-4 text-brand-primary" />
            <span>{t('settings.language.title')}</span>
          </h3>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            {t('settings.language.description')}
          </p>
        </div>

        <label className="space-y-1.5">
          <span className="block text-[10px] font-bold text-on-surface-variant/85 uppercase">
            {t('settings.language.label')}
          </span>
          <select
            data-testid="language-select"
            value={language}
            onChange={(event) => setLanguage(event.target.value as LanguageCode)}
            className="w-full bg-[#141614] border border-outline-variant/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 text-on-surface"
          >
            {supportedLanguages.map((code) => (
              <option key={code} value={code}>
                {languageLabels[code]}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6" id="settings-top-row">
        {/* Statistics & Info */}
        <div className="glass-panel p-6 rounded-2xl md:col-span-1 space-y-4" id="stats-card">
          <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2 border-b border-outline-variant/10 pb-2">
            <Database className="w-4 h-4 text-brand-primary" />
            <span>{t('settings.stats.title')}</span>
          </h3>
          <div className="space-y-3 pt-1">
            <div className="flex justify-between items-center text-sm border-b border-outline-variant/10 pb-2">
              <span className="text-on-surface-variant">{t('settings.stats.totalItems')}</span>
              <span className="font-mono font-bold text-brand-primary">{items.length}</span>
            </div>
            <div className="flex justify-between items-center text-sm border-b border-outline-variant/10 pb-2">
              <span className="text-on-surface-variant">{t('settings.stats.secureStructure')}</span>
              <span className="text-[#10b981] font-bold text-xs flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> AES-GCM
              </span>
            </div>
            <div className="flex justify-between items-center text-sm border-b border-outline-variant/10 pb-2">
              <span className="text-on-surface-variant">{t('settings.stats.dataLocation')}</span>
              <span className="text-xs text-brand-tertiary">{t('settings.stats.browserMemory')}</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={triggerReseed}
              className="w-full flex items-center justify-center gap-2 text-xs font-semibold bg-[#1a1c1a] border border-outline-variant/25 hover:bg-[#252825] py-3 rounded-lg text-on-surface-variant hover:text-on-surface transition-all cursor-pointer"
              id="demo-reseed-btn"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{t('settings.stats.reseedDemo')}</span>
            </button>
          </div>
        </div>

        {/* Change Master Password Card */}
        <div className="glass-panel p-6 rounded-2xl md:col-span-2 space-y-4" id="change-pass-card">
          <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2 border-b border-outline-variant/10 pb-2">
            <Key className="w-4 h-4 text-brand-secondary" />
            <span>{t('settings.password.title')}</span>
          </h3>

          <form onSubmit={handlePasswordChange} className="space-y-3 pt-1" id="pass-change-form">
            {passwordError && (
              <div className="p-3 bg-brand-error/10 border border-brand-error/20 rounded-lg text-brand-error text-xs flex gap-2 items-center">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}
            {passwordSuccess && (
              <div className="p-3 bg-brand-tertiary/10 border border-brand-tertiary/20 rounded-lg text-brand-tertiary text-xs flex gap-2 items-center animate-pulse">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{t('settings.password.success')}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant/85 uppercase mb-1.5">
                  {t('settings.password.current')}
                </label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full bg-[#141614] border border-outline-variant/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 text-on-surface"
                  placeholder="••••••••"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant/85 uppercase mb-1.5">
                  {t('settings.password.new')}
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#141614] border border-outline-variant/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 text-on-surface"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-on-surface-variant/85 uppercase mb-1.5">
                {t('settings.password.confirm')}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-[#141614] border border-outline-variant/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 text-on-surface"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              className="px-5 py-2.5 bg-brand-primary text-brand-on-primary rounded-lg font-bold text-xs hover:brightness-110 active:scale-95 transition-all mt-1 cursor-pointer"
            >
              {t('settings.password.update')}
            </button>
          </form>
        </div>
      </div>

      {/* Dynamic Auto-Lock Interval Card */}
      <div className="glass-panel p-6 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-6 items-center" id="auto-lock-settings-card">
        <div className="md:col-span-1 space-y-1.5">
          <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>{t('settings.autoLock.title')}</span>
          </h3>
          <p className="text-xs text-on-surface-variant">
            {t('settings.autoLock.description')}
          </p>
        </div>
        
        <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
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
      <div className="glass-panel p-6 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-6 items-center border border-outline-variant/10" id="biometric-settings-card">
        <div className="md:col-span-1 space-y-1.5">
          <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2">
            <Fingerprint className="w-5 h-5 text-brand-primary animate-pulse" />
            <span>{t('settings.biometric.title')}</span>
          </h3>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            {t('settings.biometric.descriptionPrefix')} <b>PBKDF2-SHA256</b> + <b>AES-GCM</b> {t('settings.biometric.descriptionSuffix')}
          </p>
        </div>
        
        <div className="md:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between bg-[#141614] p-4 rounded-xl border border-outline-variant/10">
            <div>
              <span className="text-xs font-bold text-on-surface block uppercase">{t('settings.biometric.statusLabel')}: {biometricEnabled ? t('settings.biometric.statusActive') : t('settings.biometric.statusPassive')}</span>
              <p className="text-[11px] text-on-surface-variant mt-1 leading-relaxed">
                {biometricEnabled 
                  ? t('settings.biometric.activeDescription')
                  : t('settings.biometric.passiveDescription')}
              </p>
            </div>
            <button
              type="button"
              disabled={biometricLoading}
              onClick={handleToggleBiometric}
              className={`px-5 py-2.5 rounded-lg text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shrink-0 ${
                biometricEnabled
                  ? 'border border-red-500/30 text-red-400 hover:bg-red-500/10'
                  : 'bg-brand-primary text-brand-on-primary hover:brightness-110 shadow-md shadow-brand-primary/10'
              }`}
            >
              {biometricLoading ? (
                <span>{t('settings.biometric.loading')}</span>
              ) : biometricEnabled ? (
                <span>{t('settings.biometric.disable')}</span>
              ) : (
                <>
                  <Fingerprint className="w-4 h-4" />
                  <span>{t('settings.biometric.enable')}</span>
                </>
              )}
            </button>
          </div>

          {biometricSuccess && (
            <div className="p-3 bg-brand-tertiary/10 border border-brand-tertiary/20 rounded-lg text-brand-tertiary text-xs leading-relaxed animate-fade-in flex items-start gap-2">
              <Check className="w-4 h-4 shrink-0 text-brand-tertiary mt-0.5" />
              <span>{biometricSuccess}</span>
            </div>
          )}

          {biometricError && (
            <div className="p-3 bg-brand-error/10 border border-brand-error/20 rounded-lg text-brand-error text-xs leading-relaxed animate-fade-in flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <span>{biometricError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Backup, Encryption, and Import Rows */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="backup-restore-rows">
        {/* Encrypted Export Card */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between space-y-4" id="encrypted-export-card">
          <div className="space-y-3.5">
            <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2 border-b border-outline-variant/10 pb-2">
              <Download className="w-4 h-4 text-brand-tertiary" />
              <span>{t('settings.export.title')}</span>
            </h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              {t('settings.export.descriptionPrefix')} <b className="text-brand-tertiary">.aegis</b> {t('settings.export.descriptionSuffix')}
            </p>

            <form onSubmit={handleExportEncrypted} className="space-y-3 pt-1">
              <div className="flex items-center gap-2.5 bg-[#141614] p-3 rounded-xl border border-outline-variant/10">
                <input
                  type="checkbox"
                  id="useMasterCheck"
                  checked={useMasterForBackup}
                  onChange={(e) => setUseMasterForBackup(e.target.checked)}
                  className="w-4 h-4 accent-brand-secondary rounded border-outline-variant bg-[#141614] cursor-pointer"
                />
                <label htmlFor="useMasterCheck" className="text-xs text-on-surface font-semibold cursor-pointer select-none">
                  {t('settings.export.useMaster')}
                </label>
              </div>

              {!useMasterForBackup && (
                <div className="space-y-1.5 animate-fade-in">
                  <label className="block text-[10px] font-bold text-brand-secondary uppercase">
                    {t('settings.export.passwordLabel')}
                  </label>
                  <input
                    type="password"
                    value={customBackupPassword}
                    onChange={(e) => setCustomBackupPassword(e.target.value)}
                    className="w-full bg-[#141614] border border-outline-variant/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-tertiary text-on-surface"
                    placeholder={t('settings.export.passwordPlaceholder')}
                    minLength={6}
                    required={!useMasterForBackup}
                  />
                </div>
              )}

              {backupSuccess && (
                <div className="p-3 bg-brand-tertiary/10 border border-brand-tertiary/20 rounded-lg text-brand-tertiary text-xs">
                  {backupSuccess}
                </div>
              )}

              {backupError && (
                <div className="p-3 bg-brand-error/10 border border-brand-error/20 rounded-lg text-brand-error text-xs flex gap-2 items-center">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{backupError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  data-testid="encrypted-export-button"
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 bg-brand-tertiary text-black font-extrabold py-3 rounded-lg text-xs hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-lg shadow-brand-tertiary/5"
                >
                  <Lock className="w-4 h-4" />
                  <span>{t('settings.export.encryptedButton')}</span>
                </button>
                <button
                  data-testid="plain-export-button"
                  type="button"
                  onClick={handleExportPlain}
                  className="w-full flex items-center justify-center gap-2 border border-outline-variant/30 text-on-surface-variant hover:text-on-surface py-3 rounded-lg text-xs hover:bg-[#1a1c1a]/50 active:scale-95 transition-all cursor-pointer"
                >
                  <Unlock className="w-4 h-4" />
                  <span>{t('settings.export.plainButton')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Universal Importer and Uploader Card */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between space-y-4" id="universal-import-card">
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2 border-b border-outline-variant/10 pb-2">
              <Upload className="w-4 h-4 text-[#2096f3]" />
              <span>{t('settings.import.title')}</span>
            </h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              {t('settings.import.descriptionPrefix')} <u className="text-brand-primary">.aegis</u> {t('settings.import.descriptionMiddle')} <b>Bitwarden (JSON/CSV)</b>, <b>LastPass (CSV)</b>, <b>Chrome (CSV)</b> {t('settings.import.providerJoin')} <b>1Password (CSV)</b> {t('settings.import.descriptionSuffix')}
            </p>

            {/* Show progress bar during import */}
            {(importState.status !== 'idle' &&
              importState.status !== 'decrypting_pending' &&
              importState.status !== 'success' &&
              importState.status !== 'error') && (
              <div className="p-4 bg-[#141614] border border-brand-primary/30 rounded-xl space-y-3 transition-opacity duration-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-brand-primary rounded-full animate-pulse" />
                    <span className="text-xs font-bold text-brand-primary uppercase tracking-wider text-left">
                      {t('settings.import.stage.' + importState.status)}
                    </span>
                  </div>
                </div>
                <div className="w-full h-2 bg-[#0a0c0a] rounded-full overflow-hidden border border-brand-primary/20">
                  <div
                    className="h-full bg-gradient-to-r from-brand-primary to-brand-primary/70 transition-all duration-300 ease-out"
                    style={{
                      width: `${importState.percent}%`
                    }}
                  />
                </div>
                <div className="text-[10px] text-on-surface-variant text-right font-mono">
                  {importState.percent}%
                </div>
              </div>
            )}

            {/* Display loading state or pending Decryption details */}
            {importState.status === 'decrypting_pending' && importState.pendingEnvelope ? (
              <form onSubmit={handleDecryptAndImport} className="p-4 bg-[#141614] border border-brand-primary/20 rounded-xl space-y-3 animate-fade-in text-left">
                <div className="flex items-center gap-2 text-brand-primary">
                  <Lock className="w-4 h-4 animate-bounce" />
                  <span className="text-xs font-bold uppercase tracking-wider">{t('settings.import.lockedTitle')}</span>
                </div>
                <p className="text-[11px] text-on-surface-variant">
                  {t('settings.import.lockedDescription')}
                </p>

                <div>
                  <input
                    data-testid="decrypt-import-password-input"
                    type="password"
                    value={decryptPasswordInput}
                    onChange={(e) => setDecryptPasswordInput(e.target.value)}
                    className="w-full bg-[#181c18] border border-outline-variant/30 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-primary text-on-surface font-mono"
                    placeholder={t('settings.import.decryptPlaceholder')}
                    required
                  />
                </div>

                {importState.errorMsg && (
                  <div
                    data-testid="decrypt-import-error-message"
                    className="p-2.5 bg-brand-error/15 border border-brand-error/30 text-brand-error text-[10px] rounded flex gap-1.5 items-center"
                  >
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{importState.errorMsg}</span>
                  </div>
                )}

                <div className="flex items-center gap-2.5">
                  <button
                    data-testid="decrypt-import-submit-button"
                    type="submit"
                    className="flex-1 py-2 bg-brand-primary text-brand-on-primary font-bold text-xs rounded-lg hover:brightness-110 active:scale-95 transition-all"
                  >
                    {t('settings.import.decryptSubmit')}
                  </button>
                  <button
                    data-testid="decrypt-import-cancel-button"
                    type="button"
                    onClick={() => {
                      resetImportFlowState();
                    }}
                    className="py-2 px-3 border border-outline-variant/30 text-on-surface-variant hover:text-on-surface text-xs rounded-lg"
                  >
                    {t('settings.import.cancel')}
                  </button>
                </div>
              </form>
            ) : (
              <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => {
                  const isImportActive = importState.status !== 'idle' && importState.status !== 'success' && importState.status !== 'error' && importState.status !== 'decrypting_pending';
                  if (isImportActive) return;
                  void triggerImportSelect();
                }}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                  isDragOver
                    ? 'border-brand-primary bg-brand-primary/10'
                    : 'border-outline-variant/30 bg-[#141614] hover:bg-[#181a18]'
                }`}
                id="drop-zone-select"
              >
                <input
                  data-testid="import-file-input"
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  onClick={(e) => e.stopPropagation()}
                  accept=".json,.csv,.aegis,application/json,text/csv"
                  className="hidden"
                />
                <Upload className="w-8 h-8 mx-auto text-on-surface-variant/50 mb-2" />
                <p className="text-xs text-on-surface font-semibold">{t('settings.import.dropTitle')}</p>
                <p className="text-[10px] text-on-surface-variant/40 mt-1 uppercase font-mono tracking-widest">
                  {t('settings.import.supported')}
                </p>
              </div>
            )}

            {importState.errorMsg && importState.status === 'error' && (
              <div
                data-testid="import-error-message"
                className="p-3 bg-brand-error/10 border border-brand-error/20 rounded-lg text-brand-error text-xs"
              >
                {importState.errorMsg}
              </div>
            )}
            
            {importState.successMsg && importState.status === 'success' && (
              <div
                data-testid="import-success-message"
                className="p-3 bg-brand-tertiary/10 border border-brand-tertiary/20 rounded-lg text-brand-tertiary text-xs font-semibold"
              >
                {importState.successMsg}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Extreme Danger Zone */}
      <div className="p-6 bg-brand-error/5 border border-brand-error/20 rounded-2xl space-y-4" id="danger-zone-section">
        <h3 className="font-bold text-sm text-brand-error uppercase tracking-wider flex items-center gap-2 border-b border-brand-error/10 pb-2">
          <Trash2 className="w-4 h-4" />
          <span>{t('settings.danger.title')}</span>
        </h3>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          {t('settings.danger.description')}
        </p>
        <button
          onClick={triggerResetAll}
          className="flex items-center gap-2 px-5 py-3 rounded-lg border-2 border-brand-error hover:bg-brand-error hover:text-brand-on-error font-bold text-xs text-brand-error transition-all cursor-pointer"
        >
          <Trash2 className="w-4" />
          <span>{t('settings.danger.resetAll')}</span>
        </button>
      </div>
    </div>
  );
}
