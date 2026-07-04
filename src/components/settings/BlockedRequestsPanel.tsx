/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { ShieldAlert, Trash2, Globe } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  getBlockedNetworkEvents,
  clearBlockedNetworkEvents,
  subscribeToSecurityEvents,
  BlockedNetworkEvent
} from '../../lib/securityEvents';

export function BlockedRequestsPanel() {
  const { t } = useLanguage();
  const [events, setEvents] = useState<BlockedNetworkEvent[]>(getBlockedNetworkEvents());

  useEffect(() => {
    // Keep internal list in sync with the SecurityEventBus reactively
    const unsubscribe = subscribeToSecurityEvents(() => {
      setEvents(getBlockedNetworkEvents());
    });
    return unsubscribe;
  }, []);

  const handleClear = () => {
    clearBlockedNetworkEvents();
    setEvents([]);
  };

  return (
    <div className="glass-panel p-4 sm:p-6 rounded-2xl md:col-span-2 space-y-4" id="blocked-requests-panel">
      <div className="flex justify-between items-center border-b border-outline-variant/10 pb-2">
        <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-brand-primary" />
          <span>{t('airgap.panel.title')}</span>
        </h3>
        {events.length > 0 && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 text-xs text-[#ef4444] hover:text-[#f87171] transition-colors cursor-pointer"
            id="clear-blocked-requests-btn"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('airgap.panel.clear')}</span>
          </button>
        )}
      </div>

      {events.length === 0 ? (
        <div className="text-center py-6 text-on-surface-variant/60 text-xs">
          {t('airgap.panel.empty')}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/10 text-on-surface-variant uppercase tracking-wider text-[10px]">
                <th className="py-2 font-semibold">{t('airgap.panel.timestamp')}</th>
                <th className="py-2 font-semibold">{t('airgap.panel.protocol')}</th>
                <th className="py-2 font-semibold">{t('airgap.panel.target')}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-outline-variant/5 last:border-0 hover:bg-[#1a1c1a]/50">
                  <td className="py-2.5 font-mono text-on-surface-variant/80">{event.timestamp}</td>
                  <td className="py-2.5">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-brand-primary/10 text-brand-primary border border-brand-primary/10">
                      {event.protocol}
                    </span>
                  </td>
                  <td className="py-2.5 font-mono text-on-surface flex items-center gap-1.5 break-all max-w-md">
                    <Globe className="w-3.5 h-3.5 text-on-surface-variant/60 shrink-0" />
                    <span>{event.url}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
