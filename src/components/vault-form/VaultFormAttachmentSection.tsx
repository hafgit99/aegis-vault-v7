/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { UploadCloud, File, Trash2, Download, Loader2 } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { formatFileSize } from '../../lib/display';
import { progressWidthClass } from '../../lib/progressWidth';

interface VaultFormAttachmentSectionProps {
  isUploading: boolean;
  uploadProgress: number;
  existingAttachment: {
    id: string;
    name: string;
    size: number;
    type: string;
  } | null;
  selectedFile: File | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onRemoveSelectedFile: () => void;
  onRemoveExistingAttachment: () => void;
  onDownloadExistingAttachment: () => void | Promise<void>;
}

export function VaultFormAttachmentSection({
  isUploading,
  uploadProgress,
  existingAttachment,
  selectedFile,
  fileInputRef,
  onFileChange,
  onDrop,
  onDragOver,
  onRemoveSelectedFile,
  onRemoveExistingAttachment,
  onDownloadExistingAttachment,
}: VaultFormAttachmentSectionProps) {
  const { t } = useLanguage();

  return (
    <div className="bg-surface-low/60 p-4 sm:p-5 rounded-2xl border border-outline-variant/15 space-y-4 text-left">
      <div className="flex items-center justify-between border-b border-outline-variant/5 pb-2">
        <h4 className="text-[10px] font-bold text-brand-primary tracking-widest uppercase flex items-center gap-2">
          <UploadCloud className="w-4.5 h-4.5 text-brand-primary" />
          <span>{t('vaultForm.attachment.title')}</span>
        </h4>
        <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-0.5 rounded border border-emerald-500/15 font-mono">
          {t('vaultForm.attachment.protected')}
        </span>
      </div>

      {/* Display status or progress if uploading */}
      {isUploading ? (
        <div className="flex flex-col items-center justify-center py-6 space-y-3 bg-surface-lowest rounded-xl border border-outline-variant/5">
          <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
          <div className="text-center">
            <p className="text-xs font-bold text-on-surface">{t('vaultForm.attachment.encrypting')}</p>
            <p className="text-[10px] text-on-surface-variant mt-1">{t('vaultForm.attachment.encryptingDescription')}</p>
          </div>
          <div className="w-48 bg-surface-low h-1.5 rounded-full overflow-hidden relative">
            <div className={`bg-brand-primary h-full transition-all duration-300 ${progressWidthClass(uploadProgress)}`} />
          </div>
          <span className="text-[10px] font-mono text-brand-primary">%{uploadProgress}</span>
        </div>
      ) : (
        <div className="space-y-4">
          
          {/* 1. Existing Attachment inside Database */}
          {existingAttachment && (
            <div data-testid="vault-item-existing-attachment" className="flex items-center justify-between p-3.5 bg-brand-primary/5 hover:bg-brand-primary/10 border border-brand-primary/20 rounded-xl transition-all">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-brand-primary/10 flex items-center justify-center text-brand-primary shrink-0">
                  <File className="w-5 h-5 animate-pulse" />
                </div>
                <div className="min-w-0">
                  <p data-testid="vault-item-existing-attachment-name" className="font-bold text-xs text-on-surface truncate pr-2">
                    {existingAttachment.name}
                  </p>
                  <p className="text-[9px] text-[#059669] font-bold font-mono uppercase flex items-center gap-1 mt-0.5">
                    <span>{formatFileSize(existingAttachment.size)}</span>
                    <span>•</span>
                    <span>{t('vaultForm.attachment.encrypted')}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="vault-item-existing-attachment-download-button"
                  onClick={onDownloadExistingAttachment}
                  className="p-2 bg-surface-lowest hover:bg-[#1c1e1c] border border-outline-variant/15 text-brand-primary rounded-lg transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center"
                  title={t('vaultForm.attachment.downloadTitle')}
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  data-testid="vault-item-existing-attachment-remove-button"
                  onClick={onRemoveExistingAttachment}
                  className="p-2 bg-surface-lowest hover:bg-red-500/10 border border-outline-variant/15 text-red-400 hover:text-red-300 rounded-lg transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center"
                  title={t('vaultForm.attachment.deleteTitle')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* 2. Newly targeted upload file */}
          {selectedFile ? (
            <div data-testid="vault-item-selected-attachment" className="flex items-center justify-between p-3.5 bg-brand-secondary/5 border border-brand-secondary/20 rounded-xl animate-fade-in">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                  <File className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p data-testid="vault-item-selected-attachment-name" className="font-bold text-xs text-on-surface truncate pr-2">
                    {selectedFile.name}
                  </p>
                  <p className="text-[10px] text-on-surface-variant font-mono mt-0.5 font-bold flex items-center gap-1">
                    <span>{formatFileSize(selectedFile.size)}</span>
                    <span className="text-brand-primary bg-brand-primary/10 px-1 py-0.2 rounded text-[9px] uppercase">
                      {t('vaultForm.attachment.ready')}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                data-testid="vault-item-selected-attachment-remove-button"
                onClick={onRemoveSelectedFile}
                className="p-2 bg-surface-lowest hover:bg-red-500/10 border border-outline-variant/15 text-red-400 hover:text-red-300 rounded-lg transition-all hover:scale-105 active:scale-95 cursor-pointer"
                title={t('vaultForm.attachment.cancelSelection')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* 3. Drop Zone Area */
            !existingAttachment && (
              <div 
                data-testid="vault-item-attachment-dropzone"
                onDragOver={onDragOver}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-outline-variant/20 hover:border-brand-primary/40 bg-surface-lowest hover:bg-surface-low rounded-2xl p-4 sm:p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 group"
              >
                <input 
                  type="file"
                  data-testid="vault-item-attachment-input"
                  ref={fileInputRef}
                  onChange={onFileChange}
                  className="hidden"
                />
                <div className="w-11 h-11 rounded-xl bg-brand-primary/10 border border-brand-primary/15 flex items-center justify-center text-brand-primary mb-3.5 group-hover:scale-110 transition-transform duration-300">
                  <UploadCloud className="w-5.5 h-5.5" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-on-surface">{t('vaultForm.attachment.dropTitle')}</p>
                  <p className="text-[10px] text-on-surface-variant leading-relaxed max-w-xs">
                    {t('vaultForm.attachment.dropDescription')}
                  </p>
                </div>
              </div>
            )
          )}

        </div>
      )}
    </div>
  );
}
