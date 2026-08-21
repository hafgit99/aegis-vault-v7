/**
 * @file useSettingsBackupImport.ts
 * @description Owns the entire backup/export/import subsystem of the settings
 * panel: encrypted + plaintext exports, universal import pipeline, encrypted
 * .aegis restore, transactional rollback, and the drag-and-drop zone state.
 * This is the largest orchestration block previously embedded in SettingsPanel.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import type { TFunction } from '../i18n/LanguageContext';
import { decryptDataWithPasswordSecure, encryptDataWithPasswordSecure } from '../lib/encryption';
import { parseUniversalImport, decodeFileBuffer } from '../lib/importer';
import type { AttachmentBackupRecord } from '../lib/attachments';
import { exportAllAttachments, importAttachments, deleteAttachments } from '../lib/attachments';
import { validateBackupPayload } from '../lib/backupValidation';
import { secureRandomToken } from '../lib/random';
import { withActiveBackupPassword } from '../lib/vaultSession';
import { isNativeFileDialogSupported, openDesktopImportFile, saveDesktopExportFile } from '../lib/desktopFiles';
import { deleteVaultItem, getVaultItems, saveVaultItems } from '../lib/storage';
import { logSecurityEvent, securityEventCodes } from '../lib/securityEvents';
import { isTestEnv } from '../lib/environment';
import type { VaultItem } from '../types';

interface UseSettingsBackupImportOptions {
  setItems: React.Dispatch<React.SetStateAction<VaultItem[]>>;
  onDatabaseChanged: () => void | Promise<void>;
}

function getBackupDecryptErrorMessage(err: unknown, t: TFunction): string {
  const errorObj = err && typeof err === 'object' ? (err as { code?: string; message?: string; name?: string }) : null;
  const isWebCryptoError = errorObj?.name === 'OperationError' || 
    String(errorObj?.message ?? '').includes('operation-specific') ||
    String(err ?? '').includes('OperationError');
  if (isWebCryptoError) {
    return t('settings.import.decryptErrorIntegrity');
  }
  switch (errorObj?.code) {
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
      return t('settings.import.errorAttachmentTooLarge', 'Attachment size exceeds 250MB limit.');
    case 'validation.backupTooLarge':
      return t('settings.import.errorBackupTooLarge', 'Backup file size exceeds 100MB limit.');
    case 'validation.attachmentCorruptData':
      return t('settings.import.errorAttachmentCorrupt', 'Attachment data is corrupt.');
    default:
      return (typeof errorObj?.message === 'string' && errorObj.message.trim().length > 0)
        ? errorObj.message
        : t('settings.import.decryptErrorFallback');
  }
}

const maybeDelay = async (ms: number): Promise<void> => {
  if (isTestEnv) return;
  await new Promise(resolve => setTimeout(resolve, ms));
};

interface ImportState {
  status: 'idle' | 'reading' | 'detecting' | 'decrypting_pending' | 'decrypting' | 'mapping' | 'saving' | 'attachments_saving' | 'syncing' | 'finalizing' | 'success' | 'error';
  percent: number;
  message: string;
  errorMsg: string | null;
  successMsg: string | null;
  pendingEnvelope: unknown | null;
}

const IDLE_IMPORT_STATE: ImportState = {
  status: 'idle',
  percent: 0,
  message: '',
  errorMsg: null,
  successMsg: null,
  pendingEnvelope: null,
};

export function useSettingsBackupImport({
  setItems,
  onDatabaseChanged,
}: UseSettingsBackupImportOptions) {
  const { t } = useLanguage();

  // ─── Encrypted Export States ─────────────────────────────────────────
  const [useMasterForBackup, setUseMasterForBackup] = useState(true);
  const [customBackupPassword, setCustomBackupPassword] = useState('');
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [plainExportArmed, setPlainExportArmed] = useState(false);
  const [plainExportConfirmation, setPlainExportConfirmation] = useState('');
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Universal Import unified state ─────────────────────────────────
  const [importState, setImportState] = useState<ImportState>(IDLE_IMPORT_STATE);
  const [isDragOver, setIsDragOver] = useState(false);
  const [decryptPasswordInput, setDecryptPasswordInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setImportState(IDLE_IMPORT_STATE);
    setDecryptPasswordInput('');
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
      logSecurityEvent(
        securityEventCodes.securityLegacyCryptoWarning,
        'Exported unencrypted plaintext JSON backup. Plaintext exports expose passwords if stored on unsecured media.',
        'warning',
      );
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
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : t('settings.export.defaultSaveError');
      setBackupError(`${t('settings.export.plainErrorPrefix')}: ${errorMsg}`);
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
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : t('settings.export.defaultSaveError');
        setBackupError(`${t('settings.export.encryptErrorPrefix')}: ${errorMsg}`);
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
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : t('settings.export.defaultSaveError');
      setBackupError(`${t('settings.export.encryptErrorPrefix')}: ${errorMsg}`);
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

  const handleImportedItems = async (itemsList: Array<Partial<VaultItem>>, attachmentsList: AttachmentBackupRecord[] = []) => {
    const mappedItems: VaultItem[] = [];
    const nowStr = new Date().toISOString().split('T')[0] ?? '';

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

          // real WebAuthn passkey fields
          passkeyCredentialId: x.passkeyCredentialId,
          passkeyPublicKey: x.passkeyPublicKey,
          passkeyRpId: x.passkeyRpId,
          passkeyRpName: x.passkeyRpName,
          passkeyUserName: x.passkeyUserName,
          passkeyUserHandle: x.passkeyUserHandle,
          passkeyAlgorithm: x.passkeyAlgorithm,
          passkeySignCount: x.passkeySignCount,
          passkeyAttachment: x.passkeyAttachment,
          passkeyTransports: x.passkeyTransports,
          passkeyCreatedAt: x.passkeyCreatedAt,
          passkeyLastUsedAt: x.passkeyLastUsedAt,
          passkeyPrivateKeyBundle: x.passkeyPrivateKeyBundle,

          // Attachment fields
          attachmentId: x.attachmentId,
          attachmentName: x.attachmentName,
          attachmentSize: x.attachmentSize,
          attachmentType: x.attachmentType,

          // Tags and Folders
          tags: x.tags,
          folderId: x.folderId,

          // Trash / Deletion
          deleted: x.deleted,
          deletedAt: x.deletedAt,
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

    } catch (err: unknown) {
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
  const handleDecryptAndImport = async (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
    }

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
    } catch (err: unknown) {
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
    try {
      setImportState({
        status: 'reading',
        percent: 5,
        message: t('settings.import.stage.reading'),
        errorMsg: null,
        successMsg: null,
        pendingEnvelope: null,
      });
      await maybeDelay(150);

      // 1. Hardened safety check for total backup size
      if (file.size > 100 * 1024 * 1024) {
        throw new Error(t('settings.import.errorBackupTooLarge', 'Backup file size exceeds 100MB limit.'));
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
      let parsedJson: { version?: number; items?: unknown } | null = null;
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
          successMsg: `✓ Aegis JSON Backup ${t('settings.import.detectedSuccessMiddle')} ${count} ${t('settings.import.recordsLoadedSuffix')}`,
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
            successMsg: `✓ ${scanResult.formatName} ${t('settings.import.detectedSuccessMiddle')} ${count} ${t('settings.import.recordsLoadedSuffix')}`,
            pendingEnvelope: null,
          });

          setTimeout(() => {
            setImportState(prev => prev.status === 'success' ? { ...prev, status: 'idle', successMsg: null } : prev);
          }, 4000);
        }
      }
    } catch (err: unknown) {
      const errorObj = err && typeof err === 'object' ? (err as { code?: string; message?: string }) : null;
      const errorMsg = errorObj?.code ? getBackupDecryptErrorMessage(err, t) : (errorObj?.message || (err instanceof Error ? err.message : t('settings.import.errorFallback')));
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
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : t('settings.import.fileSelectError');
          setImportState({
            status: 'error',
            percent: 0,
            message: '',
            errorMsg: message,
            successMsg: null,
            pendingEnvelope: null,
          });
        }
      })();
      return;
    }

    try {
      fileInputRef.current?.click();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('settings.import.fileSelectError');
      setImportState({
        status: 'error',
        percent: 0,
        message: '',
        errorMsg: message,
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

  return {
    useMasterForBackup,
    setUseMasterForBackup,
    customBackupPassword,
    setCustomBackupPassword,
    backupSuccess,
    backupError,
    onExportEncrypted: handleExportEncrypted,
    onExportPlain: handleExportPlain,
    plainExportArmed,
    plainExportConfirmation,
    setPlainExportConfirmation,
    holdProgress,
    startHoldExport,
    cancelHoldExport,
    importState,
    decryptPasswordInput,
    setDecryptPasswordInput,
    handleDecryptAndImport,
    resetImportFlowState,
    onDragOver,
    onDragLeave,
    onDrop,
    triggerImportSelect,
    isDragOver,
    fileInputRef,
    handleFileSelect,
  };
}