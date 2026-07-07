/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ShieldCheck, AlertTriangle, AlertCircle, Sparkles, ArrowRight, User, WifiOff, Lock, Clock, Link, TrendingUp } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import { VaultItem } from '../types';
import { runVaultAudit, calculatePasswordScore, getPasswordAgeInDays, isUnsecureHttpUrl, supportsTwoFactor, getAuditScoreHistory } from '../lib/security';
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

  const missingTotpItems = items.filter((item) => item.category === 'login' && supportsTwoFactor(item.url) && !item.totpSecret);
  const oldPasswordItems = items.filter((item) => item.category === 'login' && getPasswordAgeInDays(item.updatedAt || item.createdAt) >= 90);
  const unsecureHttpItems = items.filter((item) => isUnsecureHttpUrl(item.url));

  const history = getAuditScoreHistory();

  // Map history values to SVG viewBox coordinates (400 width x 100 height)
  const points = history.map((h, i) => {
    const x = history.length > 1 ? (i / (history.length - 1)) * 360 + 20 : 200;
    const y = 90 - (h.score / 100) * 80;
    return { x, y, score: h.score, date: h.date };
  });

  const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');
  const areaPoints = points.length > 0 
    ? `${points[0].x},95 ` + points.map(p => `${p.x},${p.y}`).join(' ') + ` ${points[points.length - 1].x},95`
    : '';

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Score Visualizer */}
        <div className={`lg:col-span-2 glass-panel p-4 sm:p-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6 border-l-4 ${scoreFeedback.colorBorder}`}>
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 w-full">
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
        </div>

        {/* Security Score Trend line chart */}
        <div className="glass-panel p-4 sm:p-5 rounded-2xl border border-outline-variant/10 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-brand-tertiary" />
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Güvenlik Skoru Trendi</span>
            </div>
            <span className="text-[10px] text-on-surface-variant font-mono">Son {history.length} Denetim</span>
          </div>

          <div className="relative h-20 w-full">
            <svg className="w-full h-full" viewBox="0 0 400 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00E676" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#00E676" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <line x1="10" y1="10" x2="390" y2="10" stroke="#2e302e" strokeWidth="0.5" strokeDasharray="2,2" />
              <line x1="10" y1="50" x2="390" y2="50" stroke="#2e302e" strokeWidth="0.5" strokeDasharray="2,2" />
              <line x1="10" y1="90" x2="390" y2="90" stroke="#2e302e" strokeWidth="0.5" strokeDasharray="2,2" />
              {areaPoints && <polygon points={areaPoints} fill="url(#chartGradient)" />}
              {polylinePoints && (
                <polyline
                  fill="none"
                  stroke="#00E676"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={polylinePoints}
                />
              )}
              {points.map((p, idx) => (
                <g key={idx}>
                  <circle cx={p.x} cy={p.y} r="3" fill="#00E676" stroke="#121312" strokeWidth="1" />
                  <title>{p.date}: %{p.score}</title>
                </g>
              ))}
            </svg>
          </div>

          <div className="flex justify-between text-[9px] text-on-surface-variant/40 font-mono mt-1">
            <span>{history[0]?.date}</span>
            <span>{history[history.length - 1]?.date}</span>
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
            <span data-testid="security-audit-weak-count" className="text-3xl font-bold font-sans text-brand-error">{weakItems.length}</span>
            <span className="text-xs text-on-surface-variant">{t('securityAudit.insufficientCharacters')}</span>
          </div>
        </div>

        <div className="glass-panel p-4 sm:p-5 rounded-xl bg-amber-500/5 border border-amber-500/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider text-on-surface-variant uppercase">{t('securityAudit.reusedPasswords')}</span>
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span data-testid="security-audit-reused-count" className="text-3xl font-bold font-sans text-amber-400">{reusedItems.length}</span>
            <span className="text-xs text-on-surface-variant">{t('securityAudit.reducesSecurity')}</span>
          </div>
        </div>

        <div className="glass-panel p-4 sm:p-5 rounded-xl bg-brand-tertiary/5 border border-brand-tertiary/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider text-on-surface-variant uppercase">{t('securityAudit.securePasswords')}</span>
            <Sparkles className="w-5 h-5 text-brand-tertiary" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span data-testid="security-audit-secure-count" className="text-3xl font-bold font-sans text-brand-tertiary">{secureItems.length}</span>
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
            <span data-testid="security-audit-pwned-count" className="text-3xl font-bold font-sans text-red-300">{pwnedItems.length}</span>
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
                  data-testid="security-audit-weak-item"
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
                  data-testid="security-audit-reused-item"
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

        {/* PWNED GROUPS */}
        {pwnedItems.length > 0 && (
          <div className="space-y-4 lg:col-span-2">
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
                    data-testid="security-audit-pwned-item"
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

        {/* TOTP DEFICIENCY */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{t('securityAudit.totpGroup')} ({missingTotpItems.length})</span>
          </h3>

          <div className="space-y-2.5">
            {missingTotpItems.length === 0 ? (
              <div className="p-4 bg-[#141614] rounded-xl text-xs text-on-surface-variant/40 italic text-center border border-outline-variant/5">
                Tüm FIDO2/2FA destekli hesaplarınızda TOTP yapılandırılmış.
              </div>
            ) : (
              missingTotpItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onSelectItem(item)}
                  className="flex items-center justify-between gap-3 p-3 sm:p-4 bg-[#181612]/80 hover:bg-[#221e15] border border-amber-500/10 rounded-xl cursor-pointer transition-all group"
                >
                  <div className="overflow-hidden pr-2">
                    <h4 className="font-semibold text-sm text-amber-300 group-hover:underline truncate">
                      {item.title}
                    </h4>
                    <div className="flex items-center gap-1.5 text-xs text-on-surface-variant mt-0.5 font-mono truncate">
                      {item.url}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full shrink-0">
                    <span>2FA Tanımla</span>
                    <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* OLD PASSWORDS */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-blue-300 uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>{t('securityAudit.oldGroup')} ({oldPasswordItems.length})</span>
          </h3>

          <div className="space-y-2.5">
            {oldPasswordItems.length === 0 ? (
              <div className="p-4 bg-[#141614] rounded-xl text-xs text-on-surface-variant/40 italic text-center border border-outline-variant/5">
                Tüm şifreleriniz güncel. Eski şifreniz bulunmamaktadır.
              </div>
            ) : (
              oldPasswordItems.map((item) => {
                const age = getPasswordAgeInDays(item.updatedAt || item.createdAt);
                return (
                  <div
                    key={item.id}
                    onClick={() => onSelectItem(item)}
                    className="flex items-center justify-between gap-3 p-3 sm:p-4 bg-[#121418]/80 hover:bg-[#151c24] border border-blue-500/10 rounded-xl cursor-pointer transition-all group"
                  >
                    <div className="overflow-hidden pr-2">
                      <h4 className="font-semibold text-sm text-blue-300 group-hover:underline truncate">
                        {item.title}
                      </h4>
                      <div className="flex items-center gap-1.5 text-xs text-on-surface-variant mt-0.5">
                        <Clock className="w-3.5 h-3.5 text-blue-400" />
                        <span>Şifre Yaşı: {age} gün</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-blue-300 bg-blue-500/10 px-2.5 py-1 rounded-full shrink-0">
                      <span>Güncelle</span>
                      <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* UNSECURE HTTP */}
        <div className="space-y-4 lg:col-span-2">
          <h3 className="text-sm font-bold text-brand-error uppercase tracking-wider flex items-center gap-2">
            <Link className="w-4 h-4" />
            <span>{t('securityAudit.httpGroup')} ({unsecureHttpItems.length})</span>
          </h3>

          <div className="space-y-2.5">
            {unsecureHttpItems.length === 0 ? (
              <div className="p-4 bg-[#141614] rounded-xl text-xs text-on-surface-variant/40 italic text-center border border-outline-variant/5">
                Kasanızda güvensiz HTTP bağlantılı site bulunmamaktadır. Harika!
              </div>
            ) : (
              unsecureHttpItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onSelectItem(item)}
                  className="flex items-center justify-between gap-3 p-3 sm:p-4 bg-[#181212]/80 hover:bg-[#201515] border border-brand-error/15 rounded-xl cursor-pointer transition-all group"
                >
                  <div className="overflow-hidden pr-2">
                    <h4 className="font-semibold text-sm text-brand-error group-hover:underline truncate">
                      {item.title}
                    </h4>
                    <div className="flex items-center gap-1.5 text-xs text-on-surface-variant mt-0.5 font-mono truncate">
                      {item.url}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-brand-error bg-brand-error/10 px-2.5 py-1 rounded-full shrink-0">
                    <span>Düzelt</span>
                    <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
