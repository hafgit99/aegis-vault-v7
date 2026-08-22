/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Lock, Unlock, Download, Upload, ShieldAlert, AlertCircle } from 'lucide-react';
import { progressWidthClass } from '../../lib/progressWidth';
import type { TFunction } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations';

interface SettingsBackupSectionProps {
  useMasterForBackup: boolean;
  setUseMasterForBackup: (val: boolean) => void;
  customBackupPassword: string;
  setCustomBackupPassword: (val: string) => void;
  backupSuccess: string | null;
  backupError: string | null;
  onExportEncrypted: (e: React.FormEvent) => void;
  onExportPlain: () => void;
  plainExportArmed: boolean;
  plainExportConfirmation: string;
  setPlainExportConfirmation: (val: string) => void;
  holdProgress: number;
  startHoldExport: (e: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => void;
  cancelHoldExport: () => void;
  importState: {
    status: 'idle' | 'decrypting_pending' | 'success' | 'error' | string;
    percent: number;
    errorMsg: string | null;
    successMsg: string | null;
    pendingEnvelope?: unknown;
  };
  decryptPasswordInput: string;
  setDecryptPasswordInput: (val: string) => void;
  handleDecryptAndImport: (e: React.SyntheticEvent) => void;
  resetImportFlowState: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  triggerImportSelect: () => void;
  isDragOver: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  t: TFunction;
}

export function SettingsBackupSection({
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
  t,
}: SettingsBackupSectionProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6" id="backup-restore-rows">
      {/* Encrypted Export Card */}
      <div className="glass-panel p-4 sm:p-6 rounded-2xl flex flex-col justify-between space-y-4" id="encrypted-export-card">
        <div className="space-y-3.5">
          <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2 border-b border-outline-variant/10 pb-2">
            <Download className="w-4 h-4 text-brand-tertiary" />
            <span>{t('settings.export.title')}</span>
          </h3>
          <p className="hidden sm:block text-xs text-on-surface-variant leading-relaxed">
            {t('settings.export.descriptionPrefix')} <b className="text-brand-tertiary">.aegis</b> {t('settings.export.descriptionSuffix')}
          </p>

          <form onSubmit={onExportEncrypted} className="space-y-3 pt-1">
            <div className="flex items-center gap-2.5 bg-surface-low p-3 rounded-xl border border-outline-variant/10">
              <input
                type="checkbox"
                id="useMasterCheck"
                checked={useMasterForBackup}
                onChange={(e) => setUseMasterForBackup(e.target.checked)}
                className="w-4 h-4 accent-brand-secondary rounded border-outline-variant bg-surface-low cursor-pointer"
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
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  data-form-type="other"
                  className="w-full bg-surface-lowest border border-outline-variant/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-tertiary text-on-surface"
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
                onClick={onExportPlain}
                className="w-full flex items-center justify-center gap-2 border border-outline-variant/30 text-on-surface-variant hover:text-on-surface py-3 rounded-lg text-xs hover:bg-surface-low/50 active:scale-95 transition-all cursor-pointer"
              >
                <Unlock className="w-4 h-4" />
                <span>{t('settings.export.plainButton')}</span>
              </button>
            </div>

            {plainExportArmed && (
              <div
                data-testid="plain-export-warning"
                className="p-3 bg-brand-error/10 border border-brand-error/25 rounded-xl space-y-3 animate-fade-in"
              >
                <div className="flex items-start gap-2 text-xs text-brand-error leading-relaxed">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{t('settings.export.plainWarning')}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                    <input
                      data-testid="plain-export-confirm-input"
                      type="text"
                      value={plainExportConfirmation}
                      onChange={(event) => setPlainExportConfirmation(event.target.value)}
                      className="w-full bg-surface-lowest border border-brand-error/30 rounded-lg px-3 py-2 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-brand-error"
                      placeholder={t('settings.export.plainConfirmPlaceholder')}
                      autoComplete="off"
                    />
                  <div className="flex flex-col gap-1">
                    <button
                      data-testid="plain-export-confirm-button"
                      type="button"
                      onMouseDown={startHoldExport}
                      onMouseUp={cancelHoldExport}
                      onMouseLeave={cancelHoldExport}
                      onTouchStart={startHoldExport}
                      onTouchEnd={cancelHoldExport}
                      className="flex items-center justify-center gap-2 bg-brand-error text-white font-extrabold px-4 py-2 rounded-lg text-xs hover:brightness-110 active:scale-95 transition-all cursor-pointer relative overflow-hidden select-none"
                    >
                      {holdProgress > 0 && (
                        <div 
                          className={`absolute left-0 top-0 bottom-0 bg-white/20 transition-all duration-30 ${progressWidthClass(holdProgress)}`} 
                        />
                      )}
                      <Unlock className="w-4 h-4" />
                      <span>
                        {holdProgress > 0 
                          ? `${t('settings.export.plainConfirmButton')} (${holdProgress}%)` 
                          : t('settings.export.plainConfirmButton')}
                      </span>
                    </button>
                    <span className="text-[10px] text-brand-error/70 text-right animate-pulse">
                      {t('settings.export.plainConfirmHoldHelp')}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Universal Importer and Uploader Card */}
      <div className="glass-panel p-4 sm:p-6 rounded-2xl flex flex-col justify-between space-y-4" id="universal-import-card">
        <div className="space-y-4">
          <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2 border-b border-outline-variant/10 pb-2">
            <Upload className="w-4 h-4 text-[#2096f3]" />
            <span>{t('settings.import.title')}</span>
          </h3>
          <p className="hidden sm:block text-xs text-on-surface-variant leading-relaxed">
            {t('settings.import.descriptionPrefix')} <u className="text-brand-primary">.aegis</u> {t('settings.import.descriptionMiddle')} <b>Bitwarden (JSON/CSV)</b>, <b>LastPass (CSV)</b>, <b>Chrome (CSV)</b> {t('settings.import.providerJoin')} <b>1Password (CSV)</b> {t('settings.import.descriptionSuffix')}
          </p>

          {/* Show progress bar during import */}
          {(importState.status !== 'idle' &&
            importState.status !== 'decrypting_pending' &&
            importState.status !== 'success' &&
            importState.status !== 'error') && (
            <div className="p-4 bg-surface-low border border-brand-primary/30 rounded-xl space-y-3 transition-opacity duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-brand-primary rounded-full animate-pulse" />
                  <span className="text-xs font-bold text-brand-primary uppercase tracking-wider text-left">
                    {t(`settings.import.stage.${importState.status}` as TranslationKey)}
                  </span>
                </div>
              </div>
              <div className="w-full h-2 bg-surface-lowest rounded-full overflow-hidden border border-brand-primary/20">
                <div
                  className={`h-full bg-gradient-to-r from-brand-primary to-brand-primary/70 transition-all duration-300 ease-out ${progressWidthClass(importState.percent)}`}
                />
              </div>
              <div className="text-[10px] text-on-surface-variant text-right font-mono">
                {importState.percent}%
              </div>
            </div>
          )}

          {/* Display loading state or pending Decryption details */}
          {importState.status === 'decrypting_pending' && importState.pendingEnvelope ? (
            <form onSubmit={handleDecryptAndImport} className="p-4 bg-surface-low border border-brand-primary/20 rounded-xl space-y-3 animate-fade-in text-left">
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
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  data-form-type="other"
                  className="w-full bg-surface-lowest border border-outline-variant/30 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-primary text-on-surface font-mono"
                  placeholder={t('settings.import.decryptPlaceholder')}
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
                  onClick={handleDecryptAndImport}
                  className="flex-1 py-2 bg-brand-primary text-brand-on-primary font-bold text-xs rounded-lg hover:brightness-110 active:scale-95 transition-all"
                >
                  {t('settings.import.decryptSubmit')}
                </button>
                <button
                  data-testid="decrypt-import-cancel-button"
                  type="button"
                  onClick={resetImportFlowState}
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
                triggerImportSelect();
              }}
              className={`border-2 border-dashed rounded-xl p-4 sm:p-5 text-center cursor-pointer transition-all ${
                isDragOver
                  ? 'border-brand-primary bg-brand-primary/10'
                  : 'border-outline-variant/30 bg-surface-low hover:bg-surface-container'
              }`}
              id="drop-zone-select"
            >
              <input
                data-testid="import-file-input"
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                onClick={(e) => e.stopPropagation()}
                accept=".json,.csv,.aegis,.tsv,.txt,application/json,text/csv,text/comma-separated-values,text/tab-separated-values,text/plain"
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
  );
}
