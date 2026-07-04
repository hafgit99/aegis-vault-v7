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

import { useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import type { TranslationKey } from '../i18n/translations';
import {
  detectWebAuthnCapability,
  type PasskeyAlgorithm,
  type PasskeyRecord,
  type WebAuthnCapability,
} from '../lib/passkey';

type TFunction = (key: TranslationKey) => string;

export interface PasskeyManagerProps {
  records: PasskeyRecord[];
  t: TFunction;
  statusKey?: TranslationKey | null;
  statusKind?: 'success' | 'error' | 'info' | null;
}

const ALGORITHM_OPTIONS: PasskeyAlgorithm[] = ['ES256', 'EdDSA', 'RS256'];

export function PasskeyManager({ records, t, statusKey, statusKind }: PasskeyManagerProps) {
  const [capability, setCapability] = useState<WebAuthnCapability | null>(null);

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
      {statusKey && (
        <p className={`text-xs ${statusColor}`} id="passkey-status" role={statusKind === 'error' ? 'alert' : 'status'}>
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
              className="border border-outline-variant/15 rounded-lg p-3 bg-[#0d0f0d] space-y-1"
              data-testid="passkey-record"
              data-credential-id={record.credentialId}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-on-surface">{record.rpName}</span>
                <span className="text-[10px] font-mono text-on-surface-variant">{record.algorithm}</span>
              </div>
              <p className="text-[11px] text-on-surface-variant">{record.rpId} · {record.userName}</p>
              <p className="text-[10px] text-on-surface-variant">{t('passkey.list.signCount')}: {record.signCount}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
