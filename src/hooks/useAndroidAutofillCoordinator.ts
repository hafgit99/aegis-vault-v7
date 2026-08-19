import { useCallback, useEffect, useRef, useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import type {
  AndroidAutofillRequest,
  AndroidAutofillSaveCandidate} from '../lib/androidAutofill';
import {
  clearPendingAndroidAutofillRequest,
  clearPendingAndroidAutofillSaveCandidate,
  completePendingAndroidAutofillRequest,
  getPendingAndroidAutofillRequest,
  getPendingAndroidAutofillSaveCandidate,
  isAndroidAutofillRequestFresh,
  requiresEncryptedAutofillSaveResolution,
  resolveEncryptedAndroidAutofillSaveCandidate,
  subscribeAndroidAutofillRequests,
  subscribeAndroidAutofillSaveCandidates,
} from '../lib/androidAutofill';
import { logAndroidAutofillSecurityEvent } from '../lib/androidAutofillSecurity';
import type { ActiveTab, AppNotification, VaultItem } from '../types';

interface UseAndroidAutofillCoordinatorOptions {
  unlocked: boolean;
  setActiveTab: (tab: ActiveTab) => void;
  openNewItemForm: (prefill?: Partial<VaultItem> | null) => void;
  showNotification: (notification: AppNotification) => void;
}

export function useAndroidAutofillCoordinator({
  unlocked,
  setActiveTab,
  openNewItemForm,
  showNotification,
}: UseAndroidAutofillCoordinatorOptions) {
  const { t } = useLanguage();
  const [pendingAutofillRequest, setPendingAutofillRequest] = useState<AndroidAutofillRequest | null>(() =>
    getPendingAndroidAutofillRequest(),
  );
  const [pendingAutofillSaveCandidate, setPendingAutofillSaveCandidate] = useState<AndroidAutofillSaveCandidate | null>(() =>
    getPendingAndroidAutofillSaveCandidate(),
  );
  const notifiedAutofillRequestRef = useRef<string | null>(null);
  const handledAutofillSaveRef = useRef<string | null>(null);

  const rejectStaleAutofillRequest = useCallback((request: AndroidAutofillRequest): boolean => {
    if (isAndroidAutofillRequestFresh(request)) return false;

    clearPendingAndroidAutofillRequest(request.requestId);
    logAndroidAutofillSecurityEvent('failed', request);
    if (notifiedAutofillRequestRef.current === request.requestId) {
      notifiedAutofillRequestRef.current = null;
    }
    setPendingAutofillRequest(null);
    return true;
  }, []);

  useEffect(() => {
    const pending = getPendingAndroidAutofillRequest();
    if (pending && !rejectStaleAutofillRequest(pending)) {
      setPendingAutofillRequest(pending);
    }

    return subscribeAndroidAutofillRequests((request) => {
      if (rejectStaleAutofillRequest(request)) return;
      setPendingAutofillRequest(request);
    });
  }, [rejectStaleAutofillRequest]);

  useEffect(() => {
    const pendingSave = getPendingAndroidAutofillSaveCandidate();
    if (pendingSave) {
      setPendingAutofillSaveCandidate(pendingSave);
    }

    return subscribeAndroidAutofillSaveCandidates((candidate) => {
      setPendingAutofillSaveCandidate(candidate);
    });
  }, []);

  useEffect(() => {
    if (!unlocked || !pendingAutofillRequest) return;
    if (rejectStaleAutofillRequest(pendingAutofillRequest)) return;
    if (notifiedAutofillRequestRef.current === pendingAutofillRequest.requestId) return;

    notifiedAutofillRequestRef.current = pendingAutofillRequest.requestId;
    logAndroidAutofillSecurityEvent('requested', pendingAutofillRequest);
    setActiveTab('vault');
    showNotification({
      title: t('autofill.notification.title'),
      message: t('autofill.notification.message'),
      type: 'info',
    });
  }, [pendingAutofillRequest, rejectStaleAutofillRequest, setActiveTab, showNotification, t, unlocked]);

  useEffect(() => {
    if (!unlocked || !pendingAutofillSaveCandidate) return;
    if (handledAutofillSaveRef.current === pendingAutofillSaveCandidate.requestId) return;
    if (requiresEncryptedAutofillSaveResolution(pendingAutofillSaveCandidate)) {
      // The save candidate still references an encrypted temp file. Resolve
      // it via the native bridge so we never look at the password until it
      // has been decrypted in-process. The bridge deletes the file on read.
      const resolved = resolveEncryptedAndroidAutofillSaveCandidate(pendingAutofillSaveCandidate.requestId);
      if (!resolved) {
        clearPendingAndroidAutofillSaveCandidate(pendingAutofillSaveCandidate.requestId);
        handledAutofillSaveRef.current = pendingAutofillSaveCandidate.requestId;
        setPendingAutofillSaveCandidate(null);
        showNotification({
          title: t('autofill.saveCaptured.title'),
          message: t('autofill.saveCaptured.message'),
          type: 'info',
        });
        return;
      }
      setPendingAutofillSaveCandidate(resolved);
      return;
    }

    handledAutofillSaveRef.current = pendingAutofillSaveCandidate.requestId;
    clearPendingAndroidAutofillSaveCandidate(pendingAutofillSaveCandidate.requestId);
    setActiveTab('vault');
    openNewItemForm({
      title: pendingAutofillSaveCandidate.title || pendingAutofillSaveCandidate.webDomain || pendingAutofillSaveCandidate.appPackage || '',
      username: pendingAutofillSaveCandidate.username || '',
      password: pendingAutofillSaveCandidate.password || '',
      url: pendingAutofillSaveCandidate.url || pendingAutofillSaveCandidate.webDomain || '',
      category: 'login',
    });
    setPendingAutofillSaveCandidate(null);
    showNotification({
      title: t('autofill.saveCaptured.title'),
      message: t('autofill.saveCaptured.message'),
      type: 'info',
    });
  }, [openNewItemForm, pendingAutofillSaveCandidate, setActiveTab, showNotification, t, unlocked]);

  const cancelAutofillRequest = useCallback(() => {
    if (pendingAutofillRequest) {
      clearPendingAndroidAutofillRequest(pendingAutofillRequest.requestId);
      logAndroidAutofillSecurityEvent('cancelled', pendingAutofillRequest);
    }

    notifiedAutofillRequestRef.current = null;
    setPendingAutofillRequest(null);
    showNotification({
      title: t('autofill.cancelled.title'),
      message: t('autofill.cancelled.message'),
      type: 'info',
    });
  }, [pendingAutofillRequest, showNotification, t]);

  const approveAutofillRequest = useCallback((item: VaultItem) => {
    if (!pendingAutofillRequest) return;
    if (rejectStaleAutofillRequest(pendingAutofillRequest)) {
      showNotification({
        title: t('autofill.failed.title'),
        message: t('autofill.failed.message'),
        type: 'danger',
      });
      return;
    }

    const completed = completePendingAndroidAutofillRequest(
      pendingAutofillRequest.requestId,
      item.username ?? '',
      item.password ?? '',
      item.title || 'Aegis Vault',
    );

    if (!completed) {
      logAndroidAutofillSecurityEvent('failed', pendingAutofillRequest, item);
      showNotification({
        title: t('autofill.failed.title'),
        message: t('autofill.failed.message'),
        type: 'danger',
      });
      return;
    }

    notifiedAutofillRequestRef.current = null;
    setPendingAutofillRequest(null);
    logAndroidAutofillSecurityEvent('completed', pendingAutofillRequest, item);
    showNotification({
      title: t('autofill.completed.title'),
      message: t('autofill.completed.message'),
      type: 'success',
    });
  }, [pendingAutofillRequest, rejectStaleAutofillRequest, showNotification, t]);

  return {
    pendingAutofillRequest,
    cancelAutofillRequest,
    approveAutofillRequest,
  };
}
