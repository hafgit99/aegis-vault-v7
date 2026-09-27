/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, DatabaseBackup, Loader2, X } from 'lucide-react';

import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations';
import { getVaultSnapshots, type VaultSnapshotRecord } from '../../lib/snapshots';
import { rebuildVaultFromSnapshot } from '../../lib/storage';
import { getUnlockAttemptLockoutDelayMs, recordFailedUnlockAttempt } from '../../lib/vaultSession';

/**
 * Snapshot trigger labels, reusing the Settings translations so the recovery
 * panel and the snapshot history cannot drift apart. `SnapshotTrigger` is
 * 'manual' | 'auto' | 'pre_restore'.
 */
const SNAPSHOT_TRIGGER_LABEL_KEYS: Record<string, TranslationKey> = {
  manual: 'settings.snapshot.triggerManual',
  auto: 'settings.snapshot.triggerAuto',
  pre_restore: 'settings.snapshot.triggerPreRestore',
};

/**
 * K-4: the recovery affordance for a vault file that is present but
 * unreadable.
 *
 * The panel is deliberately NOT a password prompt and never counts an attempt:
 * the master password is not what failed. It lists the snapshots that could
 * rebuild the vault, and the user picks one. `rebuildVaultFromSnapshot` proves
 * the password by decrypting the chosen snapshot before it touches anything
 * destructive.
 *
 * If no snapshot can restore anything, the honest fallback is stated plainly
 * rather than leaving the user on a dead end.
 */
interface LockScreenVaultRecoveryProps {
  /** The password already typed into the lock screen form. */
  masterPassword: string;
  onRestored: () => void;
  onDismiss: () => void;
  onResetVault: () => void;
}

export function LockScreenVaultRecovery({
  masterPassword,
  onRestored,
  onDismiss,
  onResetVault,
}: LockScreenVaultRecoveryProps) {
  const { t } = useLanguage();
  const [snapshots, setSnapshots] = useState<VaultSnapshotRecord[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // Snapshot metadata is not encrypted, so it can be listed while locked.
    getVaultSnapshots()
      .then((records) => {
        if (!active) return;
        // Sorted here rather than trusting the caller's ordering: the default
        // selection drives a DESTRUCTIVE action, so "newest first" must be a
        // property of this panel, not an undocumented contract with the store.
        const ordered = [...records].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        setSnapshots(ordered);
        setSelectedId(ordered[0]?.id ?? null);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleRestore = useCallback(async () => {
    if (!selectedId) return;
    if (!masterPassword) {
      setError(t('lock.recovery.passwordRequired'));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await rebuildVaultFromSnapshot(selectedId, masterPassword);
      onRestored();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'snapshot-password-mismatch') {
        // A wrong password here is still a wrong password, so it SHOULD count
        // against the shared lockout rather than being retried freely. The
        // panel closes so the main form shows the usual lockout messaging.
        recordFailedUnlockAttempt();
        setError(t('lock.recovery.passwordRejected'));
        if (getUnlockAttemptLockoutDelayMs() > 0) onDismiss();
      } else if (message === 'snapshot-not-found' || message === 'snapshot-unreadable') {
        setError(t('lock.recovery.snapshotUnusable'));
      } else {
        setError(t('lock.recovery.restoreFailed'));
      }
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }, [masterPassword, onDismiss, onRestored, selectedId, t]);

  return (
    <div
      className="w-full max-w-md rounded-2xl border border-outline-variant/30 bg-surface-container p-5"
      data-testid="vault-recovery-panel"
      role="dialog"
      aria-label={t('lock.recovery.title')}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-error" aria-hidden="true" />
          <div>
            <h2 className="text-base font-semibold text-on-surface">{t('lock.recovery.title')}</h2>
            <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
              {t('lock.recovery.description')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          data-testid="vault-recovery-close"
          aria-label={t('lock.recovery.dismiss')}
          className="rounded-lg p-1 text-on-surface-variant transition-colors hover:bg-surface-high"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {loadError ? (
        <p className="text-xs text-error" data-testid="vault-recovery-list-error">
          {t('lock.recovery.listFailed')}
        </p>
      ) : snapshots === null ? (
        <div className="flex items-center gap-2 py-4 text-xs text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t('lock.recovery.loading')}
        </div>
      ) : snapshots.length === 0 ? (
        <div className="rounded-xl border border-outline-variant/20 bg-surface-low p-3">
          <p className="text-xs text-on-surface-variant">{t('lock.recovery.noSnapshots')}</p>
          <button
            type="button"
            onClick={onResetVault}
            data-testid="vault-recovery-reset"
            className="mt-3 w-full rounded-lg border border-error/40 px-3 py-2 text-xs font-semibold text-error transition-colors hover:bg-error/10"
          >
            {t('lock.recovery.resetVault')}
          </button>
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs font-medium text-on-surface-variant">
            {t('lock.recovery.chooseSnapshot')}
          </p>
          <ul className="max-h-52 space-y-1 overflow-y-auto" data-testid="vault-recovery-list">
            {snapshots.map((snapshot) => {
              const selected = snapshot.id === selectedId;
              return (
                <li key={snapshot.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(snapshot.id)}
                    data-testid={`vault-recovery-option-${snapshot.id}`}
                    aria-pressed={selected}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                      selected
                        ? 'border-brand-tertiary bg-brand-tertiary/10 text-on-surface'
                        : 'border-outline-variant/20 text-on-surface-variant hover:bg-surface-high'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <DatabaseBackup className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {new Date(snapshot.createdAt).toLocaleString()}
                    </span>
                    <span className="text-[11px] opacity-70">
                      {t(SNAPSHOT_TRIGGER_LABEL_KEYS[snapshot.trigger] ?? 'settings.snapshot.triggerAuto')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {confirming ? (
            <div className="mt-3 rounded-xl border border-error/40 bg-error/5 p-3">
              <p className="text-xs leading-relaxed text-on-surface">
                {t('lock.recovery.confirmBody')}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleRestore()}
                  disabled={busy}
                  data-testid="vault-recovery-confirm"
                  className="flex-1 rounded-lg bg-error px-3 py-2 text-xs font-semibold text-on-surface transition-opacity disabled:opacity-60"
                >
                  {busy ? t('lock.recovery.restoring') : t('lock.recovery.confirmAction')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  data-testid="vault-recovery-cancel"
                  className="rounded-lg border border-outline-variant/30 px-3 py-2 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-high"
                >
                  {t('lock.recovery.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              data-testid="vault-recovery-restore"
              className="mt-3 w-full rounded-lg bg-brand-tertiary px-3 py-2 text-xs font-semibold text-on-surface transition-opacity hover:opacity-90"
            >
              {t('lock.recovery.restoreAction')}
            </button>
          )}
        </>
      )}

      {error && (
        <p className="mt-3 text-xs text-error" role="alert" data-testid="vault-recovery-error">
          {error}
        </p>
      )}
    </div>
  );
}
