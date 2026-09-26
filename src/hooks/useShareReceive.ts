/**
 * @file useShareReceive.ts
 * @description Owns the Secure Share send/receive modal state for the unlocked
 * app: which item is being shared, the decrypted received payload, the
 * `#share=` hash-listen flow, and importing a received item. Extracted from
 * UnlockedApp to keep its body declarative.
 *
 * Security: Share links now require a password for decryption (P0-1).
 * The receive flow prompts the user for the share password before attempting
 * to decrypt the payload.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useCallback } from 'react';

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

  // Password-protected share receive flow state
  const [pendingShareHash, setPendingShareHash] = useState<string | null>(null);
  const [isSharePasswordPromptOpen, setIsSharePasswordPromptOpen] = useState(false);
  const [shareReceiveError, setShareReceiveError] = useState<string | null>(null);
  // K-2: escalating attempt delay — Argon2id already makes each guess
  // memory-hard, but the prompt itself also rate-limits retries.
  const [shareFailedAttempts, setShareFailedAttempts] = useState(0);
  const [shareRetryNotBefore, setShareRetryNotBefore] = useState(0);

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
    setPendingShareHash(null);
    setIsSharePasswordPromptOpen(false);
    setShareReceiveError(null);
    window.history.replaceState(null, '', window.location.pathname);
  };

  /**
   * Called when the user submits the share password in the receive prompt.
   * Attempts to decrypt the pending share hash with the provided password.
   */
  const submitSharePassword = useCallback(async (password: string) => {
    if (!pendingShareHash) return;
    setShareReceiveError(null);

    // K-2: escalating lockout between failed attempts.
    const waitRemainingMs = shareRetryNotBefore - Date.now();
    if (waitRemainingMs > 0) {
      setShareReceiveError(
        `${t('share.error.wrongPassword', 'Incorrect password or the link has expired.')} (${Math.ceil(waitRemainingMs / 1000)}s)`,
      );
      return;
    }

    const payload = await decryptShareUrl(pendingShareHash, password);
    if (payload) {
      setShareFailedAttempts(0);
      setShareRetryNotBefore(0);
      setReceivedPayload(payload);
      setIsSharePasswordPromptOpen(false);
      setIsReceiveOpen(true);
      setPendingShareHash(null);
    } else {
      const attempts = shareFailedAttempts + 1;
      setShareFailedAttempts(attempts);
      const delayMs = Math.min(2 ** attempts * 500, 30_000);
      setShareRetryNotBefore(Date.now() + delayMs);
      setShareReceiveError(t('share.error.wrongPassword', 'Incorrect password or the link has expired.'));
    }
  }, [pendingShareHash, t, shareFailedAttempts, shareRetryNotBefore]);

  const cancelSharePasswordPrompt = useCallback(() => {
    setIsSharePasswordPromptOpen(false);
    setPendingShareHash(null);
    setShareReceiveError(null);
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const importShare = async (itemData: Partial<VaultItem>) => {
    try {
      const now = new Date().toISOString();
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
    const checkHashShare = () => {
      if (window.location.hash.startsWith('#share=')) {
        // Store the hash and prompt for password — do NOT try to auto-decrypt
        setPendingShareHash(window.location.hash);
        setIsSharePasswordPromptOpen(true);
        setShareReceiveError(null);
      }
    };

    checkHashShare();

    const handleHashChange = () => {
      checkHashShare();
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  return {
    isShareOpen,
    sharingItem,
    isReceiveOpen,
    receivedPayload,
    openShare,
    closeShare,
    closeReceive,
    importShare,
    // Password-protected receive flow
    isSharePasswordPromptOpen,
    shareReceiveError,
    submitSharePassword,
    cancelSharePasswordPrompt,
  };
}