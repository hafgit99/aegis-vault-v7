/**
 * @file useSettingsPasskey.ts
 * @description Owns WebAuthn passkey management inside the settings panel:
 * create / authenticate / delete flows and status message state. The shared
 * vault `items` list is owned by `useSettingsVaultItems`; this hook only
 * updates it after successful mutations.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import { deleteVaultItem, getVaultItems, saveVaultItem, saveVaultItems } from '../lib/storage';
import {
  authenticateAndIncrementPasskey,
  passkeyErrorCodes,
  PasskeyError,
  recordToVaultFields,
  registerPasskey,
  vaultFieldsToRecord,
  type PasskeyRecord,
  type RegisterPasskeyInput,
} from '../lib/passkey';
import type { TranslationKey } from '../i18n/translations';
import type { VaultItem } from '../types';

interface UseSettingsPasskeyOptions {
  items: VaultItem[];
  setItems: React.Dispatch<React.SetStateAction<VaultItem[]>>;
  onDatabaseChanged: () => void | Promise<void>;
}

function passkeyErrorToStatusKey(error: unknown): TranslationKey {
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
}

export function useSettingsPasskey({
  items,
  setItems,
  onDatabaseChanged,
}: UseSettingsPasskeyOptions) {
  const { t } = useLanguage();
  const [passkeyStatusKey, setPasskeyStatusKey] = useState<Parameters<typeof t>[0] | null>(null);
  const [passkeyStatusKind, setPasskeyStatusKind] = useState<'success' | 'error' | 'info' | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

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
      const { updatedRecord } = await authenticateAndIncrementPasskey(record);
      const latestItems = await getVaultItems();
      const now = updatedRecord.lastUsedAt || new Date().toISOString();
      const updatedItems = latestItems.map((item) => {
        if (item.id !== record.itemId) return item;
        return {
          ...item,
          passkeySignCount: updatedRecord.signCount,
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
      const latestItems = await getVaultItems();
      setItems(latestItems);
      setPasskeyStatusKey('passkey.delete.failed');
      setPasskeyStatusKind('error');
    } finally {
      setPasskeyBusy(false);
    }
  };

  return {
    passkeyStatusKey,
    passkeyStatusKind,
    passkeyBusy,
    handleCreatePasskey,
    handleAuthenticatePasskey,
    handleDeletePasskey,
    passkeyRecords: items
      .map((item) => vaultFieldsToRecord(item.id, item))
      .filter((record): record is PasskeyRecord => record !== null),
  };
}