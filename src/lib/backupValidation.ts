/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultItem } from '../types';

export const validationErrorCodes = {
  invalidBackupFormat: 'validation.invalidBackupFormat',
  missingItems: 'validation.missingItems',
  itemMissingRequiredFields: 'validation.itemMissingRequiredFields',
  attachmentMissingRequiredFields: 'validation.attachmentMissingRequiredFields',
  attachmentTooLarge: 'validation.attachmentTooLarge',
  attachmentCorruptData: 'validation.attachmentCorruptData',
  backupTooLarge: 'validation.backupTooLarge',
} as const;

export type ValidationErrorType = (typeof validationErrorCodes)[keyof typeof validationErrorCodes];

export class BackupValidationError extends Error {
  constructor(public readonly code: ValidationErrorType, message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

const MAX_ATTACHMENT_SIZE = 250 * 1024 * 1024; // 250 MB
export const MAX_BACKUP_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

/**
 * Validates a base64 string format.
 */
function isValidBase64(str: string): boolean {
  if (typeof str !== 'string' || !str) return false;
  // Basic regex for base64 characters
  return /^[A-Za-z0-9+/]*={0,2}$/.test(str) && str.length % 4 === 0;
}

/**
 * Validates and extracts contents from a decrypted backup payload.
 * Supports legacy flat array format and version 7 envelope format.
 *
 * When `options.fromUniversalImport` is true the caller is the CSV/JSON
 * universal importer, which has already normalised every row to a non-empty
 * title (or to the localised "untitled" fallback). In that mode we relax
 * the per-item check so that a CSV row whose source cell is genuinely
 * empty is still accepted as long as the row carries a title, username,
 * url, password or notes value. This is what the user sees as the
 * misleading "Yedek dosyasının içi liste yapısında değil" message.
 */
export function validateBackupPayload(
  parsed: any,
  fileSizeBytes?: number,
  options: { fromUniversalImport?: boolean } = {},
): { items: any[]; attachments: any[] } {
  // 1. File size checks
  if (fileSizeBytes !== undefined && fileSizeBytes > MAX_BACKUP_FILE_SIZE) {
    throw new BackupValidationError(
      validationErrorCodes.backupTooLarge,
      `Backup file size (${Math.round(fileSizeBytes / 1024 / 1024)}MB) exceeds limit of 100MB.`
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new BackupValidationError(validationErrorCodes.invalidBackupFormat, 'Invalid JSON backup payload.');
  }

  // 2. Normalize based on format: Array vs Envelope Object
  let items: any[] = [];
  let attachments: any[] = [];

  if (Array.isArray(parsed)) {
    // Legacy format: raw items array
    items = parsed;
  } else {
    // Envelope format
    if (!parsed.items || !Array.isArray(parsed.items)) {
      throw new BackupValidationError(validationErrorCodes.missingItems, 'Backup envelope is missing items array.');
    }
    items = parsed.items;
    if (parsed.attachments) {
      if (!Array.isArray(parsed.attachments)) {
        throw new BackupValidationError(validationErrorCodes.invalidBackupFormat, 'Backup attachments must be an array.');
      }
      attachments = parsed.attachments;
    }
  }

  // 3. Validate items schema
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    if (!item || typeof item !== 'object') {
      throw new BackupValidationError(
        validationErrorCodes.itemMissingRequiredFields,
        `Item at index ${idx} is not an object.`
      );
    }

    if (options.fromUniversalImport) {
      // The universal importer always materialises a non-empty title and
      // a non-empty username cell, so the strict title-or-username check
      // is too aggressive for CSV-derived rows. Accept the row as long as
      // it carries at least one piece of recognisable vault data.
      const hasAnyVaultField =
        (typeof item.title === 'string' && item.title.trim().length > 0) ||
        (typeof item.username === 'string' && item.username.trim().length > 0) ||
        (typeof item.url === 'string' && item.url.trim().length > 0) ||
        (typeof item.password === 'string' && item.password.length > 0) ||
        (typeof item.notes === 'string' && item.notes.trim().length > 0) ||
        (typeof item.totpSecret === 'string' && item.totpSecret.length > 0) ||
        (typeof item.cardNumber === 'string' && item.cardNumber.length > 0);

      if (!hasAnyVaultField) {
        throw new BackupValidationError(
          validationErrorCodes.itemMissingRequiredFields,
          `Item at index ${idx} has no recognisable vault field.`
        );
      }
      continue;
    }

    // Strict mode: must have title or username
    if (!item.title && !item.username) {
      throw new BackupValidationError(
        validationErrorCodes.itemMissingRequiredFields,
        `Item at index ${idx} is missing required title or username fields.`
      );
    }
  }

  // 4. Validate attachments schema
  for (let idx = 0; idx < attachments.length; idx++) {
    const att = attachments[idx];
    if (!att || typeof att !== 'object') {
      throw new BackupValidationError(
        validationErrorCodes.attachmentMissingRequiredFields,
        `Attachment at index ${idx} is not an object.`
      );
    }
    const { id, name, type, size, dataBase64 } = att;
    if (!id || !name || !type || typeof size !== 'number' || typeof dataBase64 !== 'string') {
      throw new BackupValidationError(
        validationErrorCodes.attachmentMissingRequiredFields,
        `Attachment at index ${idx} is missing required metadata fields (id, name, type, size, dataBase64).`
      );
    }

    if (size > MAX_ATTACHMENT_SIZE) {
      throw new BackupValidationError(
        validationErrorCodes.attachmentTooLarge,
        `Attachment "${name}" size (${Math.round(size / 1024 / 1024)}MB) exceeds limit of 250MB.`
      );
    }

    if (!isValidBase64(dataBase64)) {
      throw new BackupValidationError(
        validationErrorCodes.attachmentCorruptData,
        `Attachment "${name}" contains corrupt or invalid base64 data.`
      );
    }
  }

  return { items, attachments };
}
