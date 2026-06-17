/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ShieldCheck, AlertTriangle, AlertCircle, Sparkles, ArrowRight, User, WifiOff } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import { VaultItem } from '../types';
import { runVaultAudit, calculatePasswordScore } from '../lib/security';
import { checkPasswordAgainstHibp } from '../lib/hibp';

interface SecurityAuditProps {
  items: VaultItem[];
  onSelectItem: (item: VaultItem) => void;
}

export default function SecurityAudit({ items, onSelectItem }: SecurityAuditProps) {
  const { t } = useLanguage();
  const [pwnedByPassword, setPwnedByPassword] = React.useState<Map<string, number>>(new Map());
  const [hibpStatus, setHibpStatus] = React.useState<'idle' | 'checking' | 'complete' | 'unavailable'>('idle');
  const audit = runVaultAudit(items);

  React.useEffect(() => {
    let cancelled = false;
    const uniquePasswords = [...new Set(items.map((item) => item.password || '').filter(Boolean))];

    if (uniquePasswords.length === 0) {
      setPwnedByPassword(new Map());
      setHibpStatus('idle');
      return;
    }

    setHibpStatus('checking');

    (async () => {
      const results = new Map<string, number>();
      let unavailable = false;

      for (const password of uniquePasswords) {
        if (cancelled) return;
        const result = await checkPasswordAgainstHibp(password);
        if (result.status === 'pwned') {
          results.set(password, result.count);
        } else if (result.status === 'unavailable') {
          unavailable = true;
        }
      }

      if (!cancelled) {
        setPwnedByPassword(results);
        setHibpStatus(unavailable ? 'unavailable' : 'complete');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [items]);

  // Group items by security status
  const weakItems = items.filter((i) => {
    const pw = i.password || '';
    return pw.length < 8 || calculatePasswordScore(pw) < 40;
  });

  // Calculate reused items
  const passwordFreq: Record<string, number> = {};
  items.forEach((item) => {
    const pw = item.password || '';
    if (pw) {
      passwordFreq[pw] = (passwordFreq[pw] || 0) + 1;
    }
  });
  const reusedItems = items.filter((i) => {
    const pw = i.password || '';
    return pw && passwordFreq[pw] > 1;
  });
  const pwnedItems = items.filter((i) => {
    const pw = i.password || '';
    return pw && pwnedByPassword.has(pw);
  });

  const secureItems = items.filter((i) => {
    const pw = i.password || '';
    return pw.length >= 8 && calculatePasswordScore(pw) >= 80 && !reusedItems.includes(i);
  });

  // Custom feedback text based on vault score
  let scoreFeedback = {
    title: t('securityAudit.excellentTitle'),
    desc: t('securityAudit.excellentDescription'),
    colorBorder: 'border-l-brand-tertiary',
    textColor: 'text-brand-tertiary',
  };

  if (audit.score < 50) {
    scoreFeedback = {
      title: t('securityAudit.criticalTitle'),
      desc: t('securityAudit.criticalDescription'),
      colorBorder: 'border-l-brand-error',
      textColor: 'text-brand-error',
    };
  } else if (audit.score < 80) {
    scoreFeedback = {
      title: t('securityAudit.improvementTitle'),
      desc: t('securityAudit.improvementDescription'),
      colorBorder: 'border-l-brand-secondary',
      textColor: 'text-brand-secondary',
    };
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto pb-6">
      <div className="flex items-center gap-3 mb-1 sm:mb-2">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-brand-tertiary/10 flex items-center justify-center border border-brand-tertiary/20 animate-pulse">
          <ShieldCheck className="w-5 h-5 text-brand-tertiary" />
        </div>
        <div>
          <h2 className="text-xl font-bold font-display text-on-surface">{t('securityAudit.title')}</h2>
          <p className="hidden sm:block text-xs text-on-surface-variant">{t('securityAudit.subtitle')}</p>
        </div>
      </div>

      {/* Main Score Visualizer matching user mockup card precisely */}
      <div className={`glass-panel p-4 sm:p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6 border-l-4 ${scoreFeedback.colorBorder}`}>
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
          {/* Circular SVG dial */}
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-[#1e201e] stroke-current"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                strokeWidth="3.2"
              ></path>
              <path
                className={`${scoreFeedback.textColor} stroke-current transition-all duration-1000`}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                strokeDasharray={`${audit.score}, 100`}
                strokeLinecap="round"
                strokeWidth="3.2"
              ></path>
            </svg>
            <div className={`absolute inset-0 flex items-center justify-center font-mono font-bold text-lg sm:text-xl ${scoreFeedback.textColor}`}>
              %{audit.score}
            </div>
          </div>
          <div className="text-center sm:text-left">
            <h4 className="font-bold text-lg font-display text-on-surface">{scoreFeedback.title}</h4>
            <p className="text-on-surface-variant text-xs sm:text-sm mt-1 max-w-lg leading-relaxed">{scoreFeedback.desc}</p>
          </div>
        </div>
        <div className="flex gap-4 items-center shrink-0">
          <div className="text-right text-xs text-on-surface-variant/40 font-mono hidden md:block">
            {t('securityAudit.audited')}: {items.length} {t('securityAudit.item')}
          </div>
        </div>
      </div>

      {/* Metric quick stats dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="glass-panel p-4 sm:p-5 rounded-xl bg-brand-error/5 border border-brand-error/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider text-on-surface-variant uppercase">{t('securityAudit.weakPasswords')}</span>
            <AlertCircle className="w-5 h-5 text-brand-error" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-sans text-brand-error">{weakItems.length}</span>
            <span className="text-xs text-on-surface-variant">{t('securityAudit.insufficientCharacters')}</span>
          </div>
        </div>

        <div className="glass-panel p-4 sm:p-5 rounded-xl bg-amber-500/5 border border-amber-500/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider text-on-surface-variant uppercase">{t('securityAudit.reusedPasswords')}</span>
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-sans text-amber-400">{reusedItems.length}</span>
            <span className="text-xs text-on-surface-variant">{t('securityAudit.reducesSecurity')}</span>
          </div>
        </div>

        <div className="glass-panel p-4 sm:p-5 rounded-xl bg-brand-tertiary/5 border border-brand-tertiary/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider text-on-surface-variant uppercase">{t('securityAudit.securePasswords')}</span>
            <Sparkles className="w-5 h-5 text-brand-tertiary" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-sans text-brand-tertiary">{secureItems.length}</span>
            <span className="text-xs text-on-surface-variant">{t('securityAudit.militaryProtection')}</span>
          </div>
        </div>

        <div className="glass-panel p-4 sm:p-5 rounded-xl bg-red-500/5 border border-red-500/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider text-on-surface-variant uppercase">{t('securityAudit.pwnedPasswords')}</span>
            {hibpStatus === 'unavailable' ? (
              <WifiOff className="w-5 h-5 text-amber-300" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-300" />
            )}
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-sans text-red-300">{pwnedItems.length}</span>
            <span className="text-xs text-on-surface-variant">
              {hibpStatus === 'checking'
                ? t('securityAudit.pwnedChecking')
                : hibpStatus === 'unavailable'
                  ? t('securityAudit.pwnedUnavailable')
                  : t('securityAudit.pwnedDescription')}
            </span>
          </div>
        </div>
      </div>

      {/* Action lists for correcting credentials */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 pt-1 sm:pt-2">
        {/* WEAK CRITICAL GROUP */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-brand-error uppercase tracking-wider flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{t('securityAudit.weakGroup')} ({weakItems.length})</span>
          </h3>

          <div className="space-y-2.5">
            {weakItems.length === 0 ? (
              <div className="p-4 bg-[#141614] rounded-xl text-xs text-on-surface-variant/40 italic text-center border border-outline-variant/5">
                {t('securityAudit.noWeakPasswords')}
              </div>
            ) : (
              weakItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onSelectItem(item)}
                  className="flex items-center justify-between gap-3 p-3 sm:p-4 bg-[#181212]/80 hover:bg-[#201515] border border-brand-error/15 rounded-xl cursor-pointer transition-all group"
                >
                  <div className="overflow-hidden pr-2">
                    <h4 className="font-semibold text-sm text-brand-error group-hover:underline truncate">
                      {item.title}
                    </h4>
                    <div className="flex items-center gap-1.5 text-xs text-on-surface-variant mt-0.5">
                      <User className="w-3.5 h-3.5 shrink-0 text-on-surface-variant/50" />
                      <span className="font-mono truncate">{item.username}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-brand-error bg-brand-error/10 px-2.5 py-1 rounded-full shrink-0">
                    <span>{t('securityAudit.fixAction')}</span>
                    <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* REUSED GROUPS */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>{t('securityAudit.reusedGroup')} ({reusedItems.length})</span>
          </h3>

          <div className="space-y-2.5">
            {reusedItems.length === 0 ? (
              <div className="p-4 bg-[#141614] rounded-xl text-xs text-on-surface-variant/40 italic text-center border border-outline-variant/5">
                {t('securityAudit.noReusedPasswords')}
              </div>
            ) : (
              reusedItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onSelectItem(item)}
                  className="flex items-center justify-between gap-3 p-3 sm:p-4 bg-[#181612]/80 hover:bg-[#221e15] border border-amber-500/10 rounded-xl cursor-pointer transition-all group"
                >
                  <div className="overflow-hidden pr-2">
                    <h4 className="font-semibold text-sm text-amber-300 group-hover:underline truncate">
                      {item.title}
                    </h4>
                    <div className="flex items-center gap-1.5 text-xs text-on-surface-variant mt-0.5">
                      <User className="w-3.5 h-3.5 shrink-0 text-on-surface-variant/50" />
                      <span className="font-mono truncate">{item.username}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full shrink-0">
                    <span>{t('securityAudit.changeAction')}</span>
                    <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {pwnedItems.length > 0 && (
        <div className="space-y-4 pt-1 sm:pt-2">
          <h3 className="text-sm font-bold text-red-300 uppercase tracking-wider flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{t('securityAudit.pwnedGroup')} ({pwnedItems.length})</span>
          </h3>

          <div className="space-y-2.5">
            {pwnedItems.map((item) => {
              const count = pwnedByPassword.get(item.password || '') || 0;
              return (
                <div
                  key={item.id}
                  onClick={() => onSelectItem(item)}
                  className="flex items-center justify-between gap-3 p-3 sm:p-4 bg-[#1d1212]/80 hover:bg-[#261616] border border-red-400/15 rounded-xl cursor-pointer transition-all group"
                >
                  <div className="overflow-hidden pr-2">
                    <h4 className="font-semibold text-sm text-red-200 group-hover:underline truncate">
                      {item.title}
                    </h4>
                    <div className="flex items-center gap-1.5 text-xs text-on-surface-variant mt-0.5">
                      <User className="w-3.5 h-3.5 shrink-0 text-on-surface-variant/50" />
                      <span className="font-mono truncate">{item.username}</span>
                      <span className="text-red-300/80 shrink-0">{t('securityAudit.pwnedCountPrefix')} {count}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-red-200 bg-red-500/10 px-2.5 py-1 rounded-full shrink-0">
                    <span>{t('securityAudit.fixAction')}</span>
                    <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
