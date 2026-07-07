/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A user-defined tag. Tags are stored in the user's personal library
 * (see src/lib/tags.ts) and referenced by name from `VaultItem.tags`.
 *
 * Tags are the "soft" organisation layer — items can have many, the
 * library controls display colours, and renaming a tag is a single
 * library edit instead of touching every item.
 */
export interface TagDefinition {
  id: string;
  /** Human-readable name, e.g. "İş", "Aile". */
  name: string;
  /** Lower-case, dash-normalised identifier used for lookups. */
  slug: string;
  /**
   * One of a fixed set of brand-friendly palette keys. The mapping to
   * concrete Tailwind/CSS classes lives in `src/lib/tags.ts` so the
   * component layer never has to deal with raw hex codes.
   */
  color: TagColorKey;
  createdAt: string;
}

export type TagColorKey =
  | 'rose'
  | 'pink'
  | 'fuchsia'
  | 'purple'
  | 'violet'
  | 'indigo'
  | 'blue'
  | 'sky'
  | 'cyan'
  | 'teal'
  | 'emerald'
  | 'green'
  | 'lime'
  | 'yellow'
  | 'amber'
  | 'orange'
  | 'red'
  | 'slate';

/**
 * A hierarchical folder. `parentId` is `null` for top-level folders.
 * Cycles are forbidden — the helpers in `src/lib/folders.ts` validate
 * the tree on every mutation.
 */
export interface VaultFolder {
  id: string;
  name: string;
  /** Parent folder id, or null when this is a top-level folder. */
  parentId: string | null;
  color: TagColorKey;
  icon: FolderIconKey;
  /** Optional manual sort hint; lower values render first. */
  order?: number;
  createdAt: string;
}

export type FolderIconKey =
  | 'folder'
  | 'inbox'
  | 'star'
  | 'briefcase'
  | 'home'
  | 'credit-card'
  | 'key-round'
  | 'shield'
  | 'lock'
  | 'tag'
  | 'user'
  | 'globe'
  | 'archive'
  | 'file-text';

/**
 * A single rule in a smart folder's predicate. All rules in a smart
 * folder are combined with AND; within a single rule, all conditions
 * are also AND. OR-only logic is intentionally out of scope for v1.
 */
export type SmartFolderRule =
  | { kind: 'category'; categories: VaultItem['category'][] }
  | { kind: 'hasTag'; tag: string }
  | { kind: 'missingTag'; tag: string }
  | { kind: 'favorite' }
  | { kind: 'unfavorite' }
  | { kind: 'hasTotp' }
  | { kind: 'noTotp' }
  | { kind: 'hasNotes' }
  | { kind: 'noNotes' }
  | { kind: 'hasAttachment' }
  | { kind: 'noAttachment' }
  | { kind: 'olderThanDays'; days: number }
  | { kind: 'newerThanDays'; days: number }
  | { kind: 'weakPassword' }
  | { kind: 'reusedPassword' }
  | { kind: 'passwordLengthAtLeast'; length: number };

export interface SmartFolder {
  id: string;
  name: string;
  description?: string;
  icon: FolderIconKey;
  color: TagColorKey;
  /** When `true`, the folder is locked and the user cannot edit it. */
  builtIn?: boolean;
  rules: SmartFolderRule[];
  createdAt: string;
}

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

  // Optional: free-form tags used by the advanced search feature.
  // Backwards-compatible — the field is omitted for older vaults and
  // for items that simply have no tags. The string here is the
  // human-readable tag name; the resolved colour comes from the
  // user's tag library (see src/lib/tags.ts).
  tags?: string[];

  // Optional reference to a folder in the user's folder library
  // (see src/lib/folders.ts). Items with no folder live in the
  // implicit "root" pseudo-folder.
  folderId?: string;
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
