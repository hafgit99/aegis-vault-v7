/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import {
  KeyRound,
  ShieldCheck,
  Copy,
  Download,
  Trash2,
  Lightbulb,
  AlertTriangle,
  Check,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  generateRecoveryWords,
  setupRecoveryKey,
  isRecoveryKeySetup,
  getRecoveryKeyCreatedAt,
  disableRecoveryKey,
  formatRecoveryWords,
} from '../../lib/recoveryKey';
import {
  setPasswordHint,
  getPasswordHint,
  clearPasswordHint,
} from '../../lib/passwordHint';
import { withActiveBackupPassword } from '../../lib/vaultSession';

interface SettingsRecoverySectionProps {
  masterPassword?: string | null;
  t: (key: string) => string;
}

export function SettingsRecoverySection({ masterPassword, t }: SettingsRecoverySectionProps) {
  // ── Recovery Key State ────────────────────────────────────────────
  const [recoverySetup, setRecoverySetup] = useState(isRecoveryKeySetup());
  const [recoveryCreatedAt] = useState(getRecoveryKeyCreatedAt());
  const [showRecoverySetup, setShowRecoverySetup] = useState(false);
  const [recoveryWords, setRecoveryWords] = useState<string[]>([]);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoverySuccess, setRecoverySuccess] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [showWords, setShowWords] = useState(false);
  const [wordsCopied, setWordsCopied] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);

  // ── Password Hint State ───────────────────────────────────────────
  const [hint, setHint] = useState(getPasswordHint() || '');
  const [hintSaved, setHintSaved] = useState(false);
  const [hintWarning, setHintWarning] = useState(false);

  // ── Recovery Key Handlers ─────────────────────────────────────────

  const handleGenerateRecoveryKey = () => {
    const words = generateRecoveryWords();
    setRecoveryWords(words);
    setShowRecoverySetup(true);
    setShowWords(true);
    setRecoveryError(null);
    setRecoverySuccess(null);
    setWordsCopied(false);
  };

  const handleSaveRecoveryKey = async () => {
    setRecoveryLoading(true);
    setRecoveryError(null);
    try {
      let activePassword = masterPassword;
      if (!activePassword) {
        activePassword = await withActiveBackupPassword((pass) => pass);
      }
      if (!activePassword) {
        setRecoveryError(t('settings.recovery.errorNoSession'));
        setRecoveryLoading(false);
        return;
      }
      await setupRecoveryKey(activePassword, recoveryWords);
      setRecoverySetup(true);
      setRecoverySuccess(t('settings.recovery.keySuccess'));
      setShowRecoverySetup(false);
      setRecoveryWords([]);
    } catch (err) {
      setRecoveryError(err instanceof Error ? err.message : String(err));
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleCopyWords = async () => {
    try {
      await navigator.clipboard.writeText(recoveryWords.join(' '));
      setWordsCopied(true);
      setTimeout(() => setWordsCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  };

  const handleDownloadWords = () => {
    const content = [
      'Aegis Vault 7 Recovery Key',
      '',
      `Generated: ${new Date().toISOString()}`,
      '',
      'Recovery Words (24):',
      formatRecoveryWords(recoveryWords),
      '',
      'Keep this file OFFLINE and OUTSIDE the vault.',
      'You need these 24 words to recover your master password.',
      'Aegis Vault 7 cannot recover these words for you.',
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aegis-vault-recovery-key.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDisableRecoveryKey = () => {
    disableRecoveryKey();
    setRecoverySetup(false);
    setConfirmDisable(false);
    setRecoverySuccess(null);
  };

  // ── Password Hint Handlers ────────────────────────────────────────

  const handleSaveHint = async () => {
    let activePassword = masterPassword;
    if (!activePassword) {
      activePassword = await withActiveBackupPassword((pass) => pass);
    }
    const result = setPasswordHint(hint, activePassword || undefined);
    setHintWarning(result.warning);
    setHintSaved(true);
    setTimeout(() => setHintSaved(false), 2000);
  };

  const handleClearHint = () => {
    clearPasswordHint();
    setHint('');
    setHintWarning(false);
    setHintSaved(false);
  };

  return (
    <div className="space-y-5">
      {/* ── Section Header ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-xl bg-brand-tertiary/10 border border-brand-tertiary/20 flex items-center justify-center text-brand-tertiary shrink-0">
          <ShieldCheck className="w-4.5 h-4.5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-on-surface">{t('settings.recovery.title')}</h3>
          <p className="text-xs text-on-surface-variant/60">{t('settings.recovery.subtitle')}</p>
        </div>
      </div>

      {/* ── R1: Recovery Key ───────────────────────────────────────── */}
      <div className="glass-panel rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-primary/10 border border-brand-primary/15 flex items-center justify-center shrink-0">
            <KeyRound className="w-4 h-4 text-brand-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-on-surface">{t('settings.recovery.keyTitle')}</p>
            <p className="text-[11px] text-on-surface-variant/60 leading-relaxed">
              {t('settings.recovery.keyDescription')}
            </p>
          </div>
          {recoverySetup && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-brand-tertiary bg-brand-tertiary/10 px-2.5 py-1 rounded-full border border-brand-tertiary/20">
              <Check className="w-3 h-3" />
              {t('settings.recovery.keyActive')}
            </span>
          )}
        </div>

        {recoverySetup && recoveryCreatedAt && (
          <p className="text-[10px] text-on-surface-variant/40 pl-11">
            {t('settings.recovery.keyCreatedAt')}: {new Date(recoveryCreatedAt).toLocaleDateString()}
          </p>
        )}

        {/* Recovery Words Display */}
        {showRecoverySetup && recoveryWords.length === 24 && (
          <div className="space-y-3 pt-2 border-t border-outline-variant/10">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-[11px] text-amber-400 font-medium">{t('settings.recovery.keyWarning')}</p>
            </div>

            <div className="relative">
              <div
                className={`grid grid-cols-3 sm:grid-cols-4 gap-1.5 p-3 rounded-lg bg-surface-lowest border border-outline-variant/20 ${
                  !showWords ? 'blur-sm select-none' : ''
                }`}
              >
                {recoveryWords.map((word, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-surface-low/50 text-xs font-mono"
                  >
                    <span className="text-on-surface-variant/40 text-[10px] w-5 text-right">{i + 1}.</span>
                    <span className="text-on-surface font-medium">{word}</span>
                  </div>
                ))}
              </div>

              {!showWords && (
                <button
                  type="button"
                  onClick={() => setShowWords(true)}
                  className="absolute inset-0 flex items-center justify-center bg-surface-lowest/60 backdrop-blur-sm rounded-lg cursor-pointer"
                >
                  <span className="flex items-center gap-2 text-xs font-bold text-brand-primary">
                    <Eye className="w-4 h-4" />
                    {t('settings.recovery.keyReveal')}
                  </span>
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopyWords}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg border border-outline-variant/20 hover:bg-surface-low transition-all cursor-pointer"
              >
                {wordsCopied ? <Check className="w-3.5 h-3.5 text-brand-tertiary" /> : <Copy className="w-3.5 h-3.5" />}
                {wordsCopied ? t('settings.recovery.keyCopied') : t('settings.recovery.keyCopy')}
              </button>
              <button
                type="button"
                onClick={handleDownloadWords}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg border border-outline-variant/20 hover:bg-surface-low transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                {t('settings.recovery.keyDownload')}
              </button>
            </div>

            <button
              type="button"
              onClick={handleSaveRecoveryKey}
              disabled={recoveryLoading}
              className="w-full flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-xl bg-brand-primary text-brand-on-primary hover:brightness-110 transition-all cursor-pointer disabled:opacity-50"
            >
              {recoveryLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5" />
              )}
              {t('settings.recovery.keySave')}
            </button>
          </div>
        )}

        {/* Success/Error Messages */}
        {recoverySuccess && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-brand-tertiary/10 border border-brand-tertiary/20 text-[11px] text-brand-tertiary font-medium">
            <Check className="w-3.5 h-3.5 shrink-0" />
            {recoverySuccess}
          </div>
        )}
        {recoveryError && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-brand-error/10 border border-brand-error/20 text-[11px] text-brand-error font-medium">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {recoveryError}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleGenerateRecoveryKey}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-xl border border-brand-primary/25 bg-brand-primary/10 hover:bg-brand-primary/15 text-brand-primary transition-all cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" />
            {recoverySetup ? t('settings.recovery.keyRegenerate') : t('settings.recovery.keyGenerate')}
          </button>

          {recoverySetup && !confirmDisable && (
            <button
              type="button"
              onClick={() => setConfirmDisable(true)}
              className="flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 px-4 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/5 transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {confirmDisable && (
            <button
              type="button"
              onClick={handleDisableRecoveryKey}
              className="flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 px-4 rounded-xl bg-red-500/90 text-white hover:bg-red-500 transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('settings.recovery.keyDisable')}
            </button>
          )}
        </div>
      </div>

      {/* ── R2: Password Hint ──────────────────────────────────────── */}
      <div className="glass-panel rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/15 flex items-center justify-center shrink-0">
            <Lightbulb className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-on-surface">{t('settings.recovery.hintTitle')}</p>
            <p className="text-[11px] text-on-surface-variant/60 leading-relaxed">
              {t('settings.recovery.hintDescription')}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <input
            type="text"
            value={hint}
            onChange={(e) => {
              setHint(e.target.value);
              setHintSaved(false);
              setHintWarning(false);
            }}
            placeholder={t('settings.recovery.hintPlaceholder')}
            className="w-full bg-surface-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />

          {hintWarning && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-400 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {t('settings.recovery.hintWarning')}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSaveHint}
              disabled={!hint.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg border border-outline-variant/20 hover:bg-surface-low transition-all cursor-pointer disabled:opacity-40"
            >
              {hintSaved ? <Check className="w-3.5 h-3.5 text-brand-tertiary" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              {hintSaved ? t('settings.recovery.hintSaved') : t('settings.recovery.hintSave')}
            </button>
            {getPasswordHint() && (
              <button
                type="button"
                onClick={handleClearHint}
                className="flex items-center justify-center gap-1.5 text-xs font-bold py-2 px-4 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/5 transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
