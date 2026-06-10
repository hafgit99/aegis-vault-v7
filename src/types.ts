/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface VaultItem {
  id: string;
  title: string;
  username: string;
  password?: string;
  url: string;
  totpSecret?: string; // e.g. for generating rotation codes
  notes?: string;
  createdAt: string;
  updatedAt: string;
  category: 'login' | 'card' | 'passkey' | 'identity' | 'secure_note';
  favorite?: boolean;
  deleted?: boolean;
  deletedAt?: string;

  // Credit Card fields
  cardholderName?: string;
  cardNumber?: string;
  cardExpiry?: string;
  cardCvv?: string;
  cardPin?: string;

  // Identity fields
  idNumber?: string; // T.C. Kimlik / Passport No / Driver Licence
  idFullName?: string;
  idBirthDate?: string;
  idExpiryDate?: string;
  idGender?: string;

  // Passkey fields
  passkeyService?: string;
  passkeyPrivateExponent?: string;
  passkeyPublicId?: string;

  // Attachment fields
  attachmentId?: string; // Linked ID in IndexedDB
  attachmentName?: string;
  attachmentSize?: number;
  attachmentType?: string;
}

export interface GeneratorOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
}

export type ActiveTab = 'vault' | 'audit' | 'generator' | 'settings' | 'trash';

export interface AuditReport {
  score: number;
  weakCount: number;
  reusedCount: number;
  secureCount: number;
  totalCount: number;
}
