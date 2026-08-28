/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Passkey management surface for Aegis Vault 7. Surfaces the WebAuthn
 * capability detected in the current platform, lets the user register a
 * new passkey through the platform authenticator, and lists the registered
 * records stored as vault items. All UI strings are localized through the
 * Aegis i18n key catalog (TR / EN / ZH).
 */

import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { Fingerprint, KeyRound, LogIn, Plus, Trash2 } from 'lucide-react';
import type { TranslationKey } from '../i18n/translations';
import {
  detectWebAuthnCapability,
  type PasskeyAlgorithm,
  type PasskeyRecord,
  type RegisterPasskeyInput,
  type WebAuthnCapability,
} from '../lib/passkey';


export interface PasskeyManagerProps {
  records: PasskeyRecord[];
  statusKey?: TranslationKey | null;
  statusKind?: 'success' | 'error' | 'info' | null;
  onCreatePasskey?: (input: RegisterPasskeyInput) => void | Promise<void>;
  onAuthenticatePasskey?: (record: PasskeyRecord) => void | Promise<void>;
  onDeletePasskey?: (record: PasskeyRecord) => void | Promise<void>;
  busy?: boolean;
}

const ALGORITHM_OPTIONS: PasskeyAlgorithm[] = ['ES256', 'EdDSA', 'RS256'];

export function PasskeyManager({
  records,
  statusKey,
  statusKind,
  onCreatePasskey,
  onAuthenticatePasskey,
  onDeletePasskey,
  busy = false,
}: PasskeyManagerProps) {
  const { t } = useLanguage();
  const [capability, setCapability] = useState<WebAuthnCapability | null>(null);
  const [rpId, setRpId] = useState('');
  const [rpName, setRpName] = useState('');
  const [userName, setUserName] = useState('');
  const [algorithm, setAlgorithm] = useState<PasskeyAlgorithm>('ES256');

  useEffect(() => {
    let cancelled = false;
    detectWebAuthnCapability().then((cap) => {
      if (!cancelled) setCapability(cap);
    });
    return () => { cancelled = true; };
  }, []);

  const statusColor = statusKind === 'success'
    ? 'text-[#10b981]'
    : statusKind === 'error'
      ? 'text-red-400'
      : 'text-amber-300';

  const canCreate = useMemo(() => {
    return Boolean(onCreatePasskey && capability?.available && rpId.trim() && userName.trim() && !busy);
  }, [capability?.available, onCreatePasskey, rpId, userName, busy]);

  const handleCreate = async () => {
    if (!onCreatePasskey) return;
    await onCreatePasskey({
      rpId,
      rpName: rpName.trim() || rpId.trim(),
      userName,
      algorithms: [algorithm],
      excludeCredentialIds: records.map((record) => record.credentialId),
    });
    setRpId('');
    setRpName('');
    setUserName('');
    setAlgorithm('ES256');
  };

  return (
    <div className="glass-panel p-4 sm:p-6 rounded-2xl md:col-span-1 space-y-4" id="passkey-manager">
      <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2 border-b border-outline-variant/10 pb-2">
        <Fingerprint className="w-4 h-4 text-brand-primary" />
        <span>{t('passkey.tab.title')}</span>
      </h3>
      <p className="text-xs text-on-surface-variant leading-relaxed">{t('passkey.tab.description')}</p>
      <div className="text-xs flex items-center gap-2 border border-outline-variant/15 rounded-lg px-3 py-2 bg-[#0d0f0d]" id="passkey-capability">
        {capability === null ? (
          <span className="text-on-surface-variant">{t('passkey.status.unavailable')}</span>
        ) : !capability.available ? (
          <span className="text-red-400">{t('passkey.status.unsupported')}</span>
        ) : capability.platform ? (
          <span className="text-[#10b981]">{t('passkey.status.platform')}</span>
        ) : (
          <span className="text-[#10b981]">{t('passkey.status.crossPlatform')}</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 border border-outline-variant/15 rounded-xl p-3 bg-[#0d0f0d]/80">
        <label className="space-y-1 text-[11px] text-on-surface-variant">
          <span>{t('passkey.create.rpIdLabel')}</span>
          <input
            data-testid="passkey-rp-id-input"
            value={rpId}
            onChange={(event) => setRpId(event.target.value)}
            placeholder="example.com"
            className="w-full bg-surface-low border border-outline-variant/20 rounded-lg px-3 py-2 text-xs text-on-surface outline-none focus:border-brand-primary/50"
          />
        </label>
        <label className="space-y-1 text-[11px] text-on-surface-variant">
          <span>{t('passkey.create.rpNameLabel')}</span>
          <input
            data-testid="passkey-rp-name-input"
            value={rpName}
            onChange={(event) => setRpName(event.target.value)}
            placeholder="Example"
            className="w-full bg-surface-low border border-outline-variant/20 rounded-lg px-3 py-2 text-xs text-on-surface outline-none focus:border-brand-primary/50"
          />
        </label>
        <label className="space-y-1 text-[11px] text-on-surface-variant sm:col-span-2">
          <span>{t('passkey.create.userNameLabel')}</span>
          <input
            data-testid="passkey-user-name-input"
            value={userName}
            onChange={(event) => setUserName(event.target.value)}
            placeholder="alice@example.com"
            className="w-full bg-surface-low border border-outline-variant/20 rounded-lg px-3 py-2 text-xs text-on-surface outline-none focus:border-brand-primary/50"
          />
        </label>
        <label className="space-y-1 text-[11px] text-on-surface-variant">
          <span>{t('passkey.create.algorithmLabel')}</span>
          <select
            data-testid="passkey-algorithm-select"
            value={algorithm}
            onChange={(event) => setAlgorithm(event.target.value as PasskeyAlgorithm)}
            className="w-full bg-surface-low border border-outline-variant/20 rounded-lg px-3 py-2 text-xs text-on-surface outline-none focus:border-brand-primary/50"
          >
            {ALGORITHM_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <button
          type="button"
          data-testid="passkey-create-button"
          onClick={handleCreate}
          disabled={!canCreate}
          className="self-end inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold bg-brand-primary text-black disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition"
        >
          <Plus className="w-4 h-4" />
          <span>{t('passkey.create.button')}</span>
        </button>
      </div>

      {statusKey && (
        <p className={'text-xs ' + statusColor} id="passkey-status" role={statusKind === 'error' ? 'alert' : 'status'}>
          {t(statusKey)}
        </p>
      )}
      <div className="space-y-2" id="passkey-list">
        {records.length === 0 ? (
          <p className="text-xs text-on-surface-variant border border-dashed border-outline-variant/25 rounded-lg p-3 text-center">
            {t('passkey.list.empty')}
          </p>
        ) : (
          records.map((record) => (
            <div
              key={record.credentialId}
              className="border border-outline-variant/15 rounded-lg p-3 bg-[#0d0f0d] space-y-2"
              data-testid="passkey-record"
              data-credential-id={record.credentialId}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-on-surface break-all">{record.rpName}</span>
                <span className="text-[10px] font-mono text-on-surface-variant shrink-0">{record.algorithm}</span>
              </div>
              <p className="text-[11px] text-on-surface-variant break-all">{record.rpId} - {record.userName}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[10px] text-on-surface-variant">
                <span>{t('passkey.list.signCount')}: {record.signCount}</span>
                <span>{t('passkey.list.attachment')}: {record.attachment || '-'}</span>
                <span>{t('passkey.list.createdAt')}: {new Date(record.createdAt).toLocaleDateString()}</span>
                <span>{t('passkey.list.lastUsed')}: {record.lastUsedAt ? new Date(record.lastUsedAt).toLocaleDateString() : '-'}</span>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  data-testid="passkey-authenticate-button"
                  onClick={() => onAuthenticatePasskey?.(record)}
                  disabled={!onAuthenticatePasskey || busy}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-brand-primary/15 text-brand-primary border border-brand-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{t('passkey.authenticate.button')}</span>
                </button>
                <button
                  type="button"
                  data-testid="passkey-delete-button"
                  onClick={() => onDeletePasskey?.(record)}
                  disabled={!onDeletePasskey || busy}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-red-500/10 text-red-300 border border-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('passkey.list.delete')}</span>
                </button>
                {record.transports && record.transports.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] text-on-surface-variant border border-outline-variant/15">
                    <KeyRound className="w-3.5 h-3.5" />
                    {record.transports.join(', ')}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
