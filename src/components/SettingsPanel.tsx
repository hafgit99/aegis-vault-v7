/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Settings } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { isAndroidAutofillSupported } from '../lib/androidAutofill';
import { useSettingsVaultItems } from '../hooks/useSettingsVaultItems';
import { useSettingsPassword } from '../hooks/useSettingsPassword';
import { useSettingsBiometric } from '../hooks/useSettingsBiometric';
import { useSettingsEmergencyKit } from '../hooks/useSettingsEmergencyKit';
import { useSettingsStorageMigration } from '../hooks/useSettingsStorageMigration';
import { useSettingsExtensionToken } from '../hooks/useSettingsExtensionToken';
import { useSettingsPasskey } from '../hooks/useSettingsPasskey';
import { useSettingsSync } from '../hooks/useSettingsSync';
import { useSettingsBackupImport } from '../hooks/useSettingsBackupImport';
import { SettingsLanguageCard } from './settings/SettingsLanguageCard';
import { SettingsThemeCard } from './settings/SettingsThemeCard';
import { SettingsPasswordCard } from './settings/SettingsPasswordCard';
import { SettingsStatsCard } from './settings/SettingsStatsCard';
import { BlockedRequestsPanel } from './settings/BlockedRequestsPanel';
import { SettingsBiometricCard } from './settings/SettingsBiometricCard';
import { SettingsAutofillCard } from './settings/SettingsAutofillCard';
import { SettingsSyncSection } from './settings/SettingsSyncSection';
import { SettingsBackupSection } from './settings/SettingsBackupSection';
import { SettingsRecoverySection } from './settings/SettingsRecoverySection';
import { SettingsDangerZone } from './settings/SettingsDangerZone';
import { SettingsEmergencyKitCard } from './settings/SettingsEmergencyKitCard';
import { SettingsAutoLockCard } from './settings/SettingsAutoLockCard';
import { SettingsStorageMigrationCard } from './settings/SettingsStorageMigrationCard';
import { SettingsExtensionTokenCard } from './settings/SettingsExtensionTokenCard';
import PasswordConfirmModal from './PasswordConfirmModal';
import { PasskeyManager } from './PasskeyManager';
import type { AppNotification } from '../types';

interface SettingsPanelProps {
  onDatabaseChanged: () => void | Promise<void>;
  autoLockDuration: number;
  onAutoLockDurationChange: (duration: number) => void;
  onNotify?: (notification: AppNotification) => void;
}

export default function SettingsPanel({
  onDatabaseChanged,
  autoLockDuration,
  onAutoLockDurationChange,
  onNotify,
}: SettingsPanelProps) {
  const { language, setLanguage, t } = useLanguage();

  const {
    items,
    setItems,
    triggerReseed,
    triggerResetAll,
  } = useSettingsVaultItems({ onDatabaseChanged, onNotify });

  const {
    oldPassword,
    newPassword,
    confirmPassword,
    passwordError,
    passwordSuccess,
    onOldPasswordChange,
    onNewPasswordChange,
    onConfirmPasswordChange,
    handlePasswordChange,
  } = useSettingsPassword({ onDatabaseChanged });

  const {
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
    closePasswordPrompt,
  } = useSettingsBiometric();

  const {
    emergencySecretKey,
    onEmergencySecretKeyChange,
    emergencyKitSuccess,
    emergencyKitError,
    handleDownloadEmergencyKit,
  } = useSettingsEmergencyKit();

  const {
    storageMigrationStatus,
    storageMigrationMessage,
    handleWaSqliteMigration,
  } = useSettingsStorageMigration({ onDatabaseChanged, onNotify });

  const {
    tokenRotateStatus,
    tokenRotateMessage,
    handleRotateToken,
  } = useSettingsExtensionToken();

  const {
    passkeyStatusKey,
    passkeyStatusKind,
    passkeyBusy,
    handleCreatePasskey,
    handleAuthenticatePasskey,
    handleDeletePasskey,
    passkeyRecords,
  } = useSettingsPasskey({
    items,
    setItems,
    onDatabaseChanged,
  });

  const {
    syncProvider,
    setSyncProvider,
    syncUrl,
    setSyncUrl,
    syncUsername,
    setSyncUsername,
    syncPassword,
    setSyncPassword,
    s3Endpoint,
    setS3Endpoint,
    s3Region,
    setS3Region,
    s3Bucket,
    setS3Bucket,
    s3AccessKeyId,
    setS3AccessKeyId,
    s3SecretAccessKey,
    setS3SecretAccessKey,
    syncStatus,
    syncMessage,
    syncLastAt,
    syncTestResult,
    syncTestLoading,
    syncLoading,
    onSyncTest,
    onSyncSave,
    onSyncDisable,
    onSyncNow,
  } = useSettingsSync({ onDatabaseChanged });

  const {
    useMasterForBackup,
    setUseMasterForBackup,
    customBackupPassword,
    setCustomBackupPassword,
    backupSuccess,
    backupError,
    onExportEncrypted,
    onExportPlain,
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
  } = useSettingsBackupImport({
    setItems,
    onDatabaseChanged,
  });

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
          onOldPasswordChange={onOldPasswordChange}
          onNewPasswordChange={onNewPasswordChange}
          onConfirmPasswordChange={onConfirmPasswordChange}
          onSubmit={handlePasswordChange}
          t={t}
        />
      </div>

      {/* Emergency Kit Card */}
      <SettingsEmergencyKitCard
        emergencySecretKey={emergencySecretKey}
        onEmergencySecretKeyChange={onEmergencySecretKeyChange}
        emergencyKitSuccess={emergencyKitSuccess}
        emergencyKitError={emergencyKitError}
        onDownloadEmergencyKit={handleDownloadEmergencyKit}
        t={t}
      />

      {/* Dynamic Auto-Lock Interval Card */}
      <SettingsAutoLockCard
        autoLockDuration={autoLockDuration}
        lockOptions={lockOptions}
        onAutoLockDurationChange={onAutoLockDurationChange}
        t={t}
      />

      {/* Biometric Lock Settings Card */}
      <SettingsBiometricCard
        biometricEnabled={biometricEnabled}
        biometricLoading={biometricLoading}
        biometricSuccess={biometricSuccess}
        biometricError={biometricError}
        onToggleBiometric={handleToggleBiometric}
        t={t}
      />

      {/* Recovery Options (Recovery Key & Password Hint) */}
      <SettingsRecoverySection t={t} />

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
        records={passkeyRecords}
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
        onExportEncrypted={onExportEncrypted}
        onExportPlain={onExportPlain}
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
      <SettingsStorageMigrationCard
        storageMigrationStatus={storageMigrationStatus}
        storageMigrationMessage={storageMigrationMessage}
        onMigrate={handleWaSqliteMigration}
        t={t}
      />

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
        s3Endpoint={s3Endpoint}
        setS3Endpoint={setS3Endpoint}
        s3Region={s3Region}
        setS3Region={setS3Region}
        s3Bucket={s3Bucket}
        setS3Bucket={setS3Bucket}
        s3AccessKeyId={s3AccessKeyId}
        setS3AccessKeyId={setS3AccessKeyId}
        s3SecretAccessKey={s3SecretAccessKey}
        setS3SecretAccessKey={setS3SecretAccessKey}
        syncStatus={syncStatus}
        syncMessage={syncMessage}
        syncLastAt={syncLastAt}
        syncTestResult={syncTestResult}
        syncTestLoading={syncTestLoading}
        syncLoading={syncLoading}
        onSyncTest={onSyncTest}
        onSyncSave={onSyncSave}
        onSyncDisable={onSyncDisable}
        onSyncNow={onSyncNow}
        t={t}
      />

      {/* Extension Token Rotation — desktop only */}
      <SettingsExtensionTokenCard
        tokenRotateStatus={tokenRotateStatus}
        tokenRotateMessage={tokenRotateMessage}
        onRotateToken={handleRotateToken}
        t={t}
      />

      {/* Extreme Danger Zone */}
      <SettingsDangerZone
        onResetAll={triggerResetAll}
        t={t}
      />

      {/* Biometric Master Password Confirmation Modal */}
      <PasswordConfirmModal
        isOpen={isPasswordPromptOpen}
        isLoading={isConfirmingBiometricPassword}
        errorMessage={passwordPromptError}
        onConfirm={handleConfirmBiometricPassword}
        onCancel={closePasswordPrompt}
      />
    </div>
  );
}