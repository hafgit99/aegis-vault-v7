/**
 * @file useShareReceive.ts
 * @description Owns the Secure Share send/receive modal state for the unlocked
 * app: which item is being shared, the decrypted received payload, the
 * `#share=` hash-listen flow, and importing a received item. Extracted from
 * UnlockedApp to keep its body declarative.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import { decryptShareUrl, type DecryptedSharePayload } from '../lib/share';
import type { VaultItem } from '../types';
import type { AppNotification } from '../types';

interface UseShareReceiveOptions {
  onSaveItem: (item: VaultItem) => Promise<void> | void;
  onNotify?: (notification: AppNotification) => void;
}

export function useShareReceive({
  onSaveItem,
  onNotify,
}: UseShareReceiveOptions) {
  const { t } = useLanguage();
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [sharingItem, setSharingItem] = useState<VaultItem | null>(null);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [receivedPayload, setReceivedPayload] = useState<DecryptedSharePayload | null>(null);

  const openShare = (item: VaultItem) => {
    setSharingItem(item);
    setIsShareOpen(true);
  };

  const closeShare = () => {
    setIsShareOpen(false);
    setSharingItem(null);
  };

  const closeReceive = () => {
    setIsReceiveOpen(false);
    setReceivedPayload(null);
    window.history.replaceState(null, '', window.location.pathname);
  };

  const importShare = async (itemData: Partial<VaultItem>) => {
    try {
      const now = new Date().toISOString().split('T')[0] ?? '';
      const newItem: VaultItem = {
        id: crypto.randomUUID(),
        title: itemData.title || 'Shared Item',
        username: itemData.username || '',
        password: itemData.password || '',
        url: itemData.url || '',
        notes: itemData.notes || '',
        category: itemData.category || 'login',
        totpSecret: itemData.totpSecret || '',
        favorite: false,
        createdAt: now,
        updatedAt: now,
      };

      await onSaveItem(newItem);
      onNotify?.({
        type: 'success',
        title: t('share.title'),
        message: t('share.success.import', 'Shared item imported successfully.'),
      });
      closeReceive();
    } catch (error) {
      console.error('Failed to import shared item:', error);
      onNotify?.({
        type: 'danger',
        title: t('share.title'),
        message: t('share.error.import', 'Failed to import shared item.'),
      });
    }
  };

  useEffect(() => {
    const checkHashShare = async () => {
      if (window.location.hash.startsWith('#share=')) {
        const payload = await decryptShareUrl(window.location.hash);
        if (payload) {
          setReceivedPayload(payload);
          setIsReceiveOpen(true);
        } else {
          onNotify?.({
            type: 'danger',
            title: t('share.title'),
            message: t('share.error.decrypt', 'Failed to decrypt share link.'),
          });
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    };

    void checkHashShare();

    const handleHashChange = () => {
      void checkHashShare();
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [t, onNotify]);

  return {
    isShareOpen,
    sharingItem,
    isReceiveOpen,
    receivedPayload,
    openShare,
    closeShare,
    closeReceive,
    importShare,
  };
}