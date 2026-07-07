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

  // Passkey fields (manually managed secure keys — kept for backward compatibility)
  passkeyService?: string;
  passkeyPrivateExponent?: string;
  passkeyPublicId?: string;

  // Passkey fields (real WebAuthn authenticator — see src/lib/passkey.ts)
  passkeyCredentialId?: string;
  passkeyPublicKey?: string;
  passkeyRpId?: string;
  passkeyRpName?: string;
  passkeyUserName?: string;
  passkeyUserHandle?: string;
  passkeyAlgorithm?: 'ES256' | 'EdDSA' | 'RS256';
  passkeySignCount?: number;
  passkeyAttachment?: 'platform' | 'cross-platform';
  passkeyTransports?: string[];
  passkeyCreatedAt?: string;
  passkeyLastUsedAt?: string;
  /** WebCryptoAesGcmPayload JSON shape — vault-key-wrapped private key JWK. */
  passkeyPrivateKeyBundle?: {
    iv: string;
    tag: string;
    ciphertext: string;
  };

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

export type ActiveTab = 'vault' | 'audit' | 'generator' | 'settings' | 'donate' | 'trash';

export interface AuditReport {
  score: number;
  weakCount: number;
  reusedCount: number;
  secureCount: number;
  totalCount: number;
  missingTotpCount?: number;
  oldPasswordCount?: number;
  unsecureHttpCount?: number;
}

export interface AppNotification {
  title: string;
  message: string;
  type?: 'danger' | 'warning' | 'info' | 'success';
}

export interface AppConfirmConfig {
  isOpen: boolean;
  title: string;
  message: string;
  type: 'danger' | 'warning' | 'info' | 'success';
  confirmText?: string;
  cancelText?: string;
  isAlert?: boolean;
  onConfirm: () => void;
}
