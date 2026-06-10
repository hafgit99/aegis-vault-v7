/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Sliders, 
  Copy, 
  Check, 
  RefreshCw, 
  KeyRound, 
  Sparkles, 
  BookOpen, 
  Hash, 
  Globe, 
  Minimize2,
  Lock
} from 'lucide-react';
import { GeneratorOptions } from '../types';
import { generatePassword, calculatePasswordScore, getStrengthLabel } from '../lib/security';
import { generateDiceware, DicewareOptions } from '../lib/diceware';
import {
  clearClipboardIfUnchanged,
  DEFAULT_CLIPBOARD_CLEAR_DELAY_MS,
  writeClipboardText,
} from '../lib/clipboard';

export default function PasswordGenerator() {
  const [mode, setMode] = useState<'character' | 'diceware'>('character');

  // Character-based states
  const [options, setOptions] = useState<GeneratorOptions>({
    length: 16,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
  });

  // Diceware word-based states
  const [dicewareOptions, setDicewareOptions] = useState<DicewareOptions>({
    wordCount: 4,
    separator: 'hyphen',
    language: 'tr',
    capitalize: true,
    addNumber: true,
    addSymbol: false,
  });

  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const copiedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clipboardClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCopiedPasswordRef = useRef<string | null>(null);

  const clearCopiedResetTimer = () => {
    if (copiedResetTimerRef.current) {
      clearTimeout(copiedResetTimerRef.current);
      copiedResetTimerRef.current = null;
    }
  };

  const clearClipboardTimer = () => {
    if (clipboardClearTimerRef.current) {
      clearTimeout(clipboardClearTimerRef.current);
      clipboardClearTimerRef.current = null;
    }
  };

  const clearLastCopiedPassword = () => {
    const lastCopiedPassword = lastCopiedPasswordRef.current;
    lastCopiedPasswordRef.current = null;
    if (lastCopiedPassword) {
      void clearClipboardIfUnchanged(lastCopiedPassword);
    }
  };

  // Auto generate on mount or options / mode change
  useEffect(() => {
    handleGenerate();
  }, [mode, options, dicewareOptions]);

  useEffect(
    () => () => {
      clearCopiedResetTimer();
      clearClipboardTimer();
      clearLastCopiedPassword();
    },
    [],
  );

  const handleGenerate = () => {
    clearCopiedResetTimer();
    clearClipboardTimer();
    clearLastCopiedPassword();
    if (mode === 'character') {
      const pw = generatePassword(options);
      setPassword(pw);
    } else {
      const pw = generateDiceware(dicewareOptions);
      setPassword(pw);
    }
    setCopied(false);
  };

  const handleCopy = () => {
    if (!password) return;
    void writeClipboardText(password);
    clearCopiedResetTimer();
    clearClipboardTimer();
    lastCopiedPasswordRef.current = password;
    setCopied(true);
    copiedResetTimerRef.current = setTimeout(() => {
      setCopied(false);
      copiedResetTimerRef.current = null;
    }, 2000);
    clipboardClearTimerRef.current = setTimeout(() => {
      clearLastCopiedPassword();
      clipboardClearTimerRef.current = null;
    }, DEFAULT_CLIPBOARD_CLEAR_DELAY_MS);
  };

  const score = calculatePasswordScore(password);
  const strength = getStrengthLabel(password);

  // Custom descriptions for word list counts in Diceware
  const getDicewareStrengthDescription = (count: number) => {
    if (count <= 3) return { text: 'Orta Güvenlik (Çok Kolay Ezberlenir)', color: 'text-amber-400' };
    if (count === 4) return { text: 'Yüksek Güvenlik (Güvenli & Akılda Kalıcı)', color: 'text-[#10b981]' };
    if (count === 5) return { text: 'Çok Yüksek Güvenlik (Askeri Seviyeye Yakın)', color: 'text-[#10b981]' };
    return { text: 'Askeri Seviye Aşırı Güvenlik (Süper Güçlü Ana Şifre)', color: 'text-brand-tertiary animate-pulse' };
  };

  const dicewareStatus = getDicewareStrengthDescription(dicewareOptions.wordCount);

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-10" id="password-generator-root">
      {/* Header section */}
      <div className="flex items-center gap-3 mb-2" id="generator-header">
        <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center border border-brand-primary/20">
          <KeyRound className="w-5 h-5 text-brand-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold font-display text-on-surface">Şifre Üretim Paneli</h2>
          <p className="text-xs text-on-surface-variant">Askeri düzeyde kriptografik karakterler veya akılda kalıcı Diceware kelime kombinasyonları oluşturun.</p>
        </div>
      </div>

      {/* Mode Switches */}
      <div className="flex bg-[#141614] p-1.5 rounded-xl border border-outline-variant/10 max-w-md" id="generator-mode-tabs">
        <button
          onClick={() => setMode('character')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            mode === 'character'
              ? 'bg-brand-primary text-brand-on-primary shadow-lg'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-[#1a1c1a]'
          }`}
          id="mode-char-tab"
        >
          <Sliders className="w-4 h-4" />
          <span>Karakter Tabanlı</span>
        </button>

        <button
          onClick={() => setMode('diceware')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            mode === 'diceware'
              ? 'bg-brand-primary text-brand-on-primary shadow-lg'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-[#1a1c1a]'
          }`}
          id="mode-diceware-tab"
        >
          <BookOpen className="w-4 h-4" />
          <span>Diceware (Kelime Tabanlı)</span>
        </button>
      </div>

      {/* Password display panel */}
      <div className="glass-panel p-6 rounded-2xl relative overflow-hidden" id="password-display-card">
        <div className="absolute top-0 left-0 w-1 h-full bg-brand-primary"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="font-mono text-sm md:text-lg break-all tracking-wide text-brand-primary select-all bg-[#0d0f0d]/40 p-4 rounded-xl border border-outline-variant/10 flex-1 min-h-[56px] flex items-center">
            {password || 'Lütfen seçenekleri düzenleyin'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleGenerate}
              className="p-3.5 rounded-xl bg-[#1e201e] hover:bg-[#292a28] text-on-surface transition-colors border border-outline-variant/10 flex items-center justify-center cursor-pointer"
              title="Yenile"
              id="refresh-password-btn"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              onClick={handleCopy}
              className={`px-6 py-3.5 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer ${
                copied
                  ? 'bg-brand-tertiary text-brand-on-tertiary'
                  : 'bg-brand-primary text-brand-on-primary shadow-lg shadow-brand-primary/10 hover:brightness-110'
              }`}
              id="copy-password-btn"
            >
              {copied ? (
                <>
                  <Check className="w-5 h-5" />
                  <span>Kopyalandı!</span>
                </>
              ) : (
                <>
                  <Copy className="w-5 h-5" />
                  <span>Kopyala</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Dynamic Strength visual helper */}
        <div className="mt-5 pt-5 border-t border-outline-variant/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
              KUVVET SEVİYESİ
            </div>
            <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${strength.colorClass}`}>
              {strength.label}
            </span>
          </div>
          <div className="flex-1 max-w-xs flex items-center gap-1">
            <div className="w-full h-2 bg-surface-low rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  score >= 90
                    ? 'bg-brand-tertiary'
                    : score >= 70
                    ? 'bg-brand-secondary'
                    : score >= 40
                    ? 'bg-amber-400'
                    : 'bg-brand-error'
                }`}
                style={{ width: `${score}%` }}
              ></div>
            </div>
            <span className="text-xs font-mono font-bold text-on-surface-variant ml-2">% {score}</span>
          </div>
        </div>
      </div>

      {/* Main Settings Body */}
      {mode === 'character' ? (
        /* Character-based Configurations Card */
        <div className="glass-panel p-6 rounded-2xl space-y-6" id="chars-spec-panel">
          <div className="flex items-center gap-2 mb-2 pb-4 border-b border-outline-variant/10">
            <Sliders className="w-5 h-5 text-on-surface-variant" />
            <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider">KARAKTER ÖZELLEŞTİRMELERİ</h3>
          </div>

          {/* Slider for Password Length */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-on-surface">Karakter Uzunluğu</span>
              <span className="font-mono text-base font-bold text-brand-primary bg-[#0d0f0d] px-3 py-1 rounded-lg border border-outline-variant/10">
                {options.length}
              </span>
            </div>
            <input
              type="range"
              min="6"
              max="64"
              value={options.length}
              onChange={(e) => setOptions({ ...options, length: parseInt(e.target.value) })}
              className="w-full h-1.5 bg-surface-low rounded-lg appearance-none cursor-pointer accent-brand-primary"
            />
            <div className="flex justify-between text-[11px] text-on-surface-variant/40 font-mono">
              <span>6 Karakter</span>
              <span>64 Karakter</span>
            </div>
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {/* Upper letters */}
            <label className="flex items-center justify-between p-4 bg-[#141614] hover:bg-[#181a18] rounded-xl border border-outline-variant/10 cursor-pointer transition-colors">
              <div className="flex flex-col">
                <span className="text-sm font-semibold">Büyük Harfler</span>
                <span className="text-xs text-on-surface-variant font-mono">A-Z</span>
              </div>
              <input
                type="checkbox"
                checked={options.uppercase}
                onChange={(e) => setOptions({ ...options, uppercase: e.target.checked })}
                className="w-5 h-5 text-brand-primary bg-surface-low border-outline-variant/30 rounded focus:ring-brand-primary/20 accent-brand-primary cursor-pointer"
              />
            </label>

            {/* Lower letters */}
            <label className="flex items-center justify-between p-4 bg-[#141614] hover:bg-[#181a18] rounded-xl border border-outline-variant/10 cursor-pointer transition-colors">
              <div className="flex flex-col">
                <span className="text-sm font-semibold">Küçük Harfler</span>
                <span className="text-xs text-on-surface-variant font-mono">a-z</span>
              </div>
              <input
                type="checkbox"
                checked={options.lowercase}
                onChange={(e) => setOptions({ ...options, lowercase: e.target.checked })}
                className="w-5 h-5 text-brand-primary bg-surface-low border-outline-variant/30 rounded focus:ring-brand-primary/20 accent-brand-primary cursor-pointer"
              />
            </label>

            {/* Digits */}
            <label className="flex items-center justify-between p-4 bg-[#141614] hover:bg-[#181a18] rounded-xl border border-outline-variant/10 cursor-pointer transition-colors">
              <div className="flex flex-col">
                <span className="text-sm font-semibold">Sayılar / Rakamlar</span>
                <span className="text-xs text-on-surface-variant font-mono">0-9</span>
              </div>
              <input
                type="checkbox"
                checked={options.numbers}
                onChange={(e) => setOptions({ ...options, numbers: e.target.checked })}
                className="w-5 h-5 text-brand-primary bg-surface-low border-outline-variant/30 rounded focus:ring-brand-primary/20 accent-brand-primary cursor-pointer"
              />
            </label>

            {/* Symbols */}
            <label className="flex items-center justify-between p-4 bg-[#141614] hover:bg-[#181a18] rounded-xl border border-outline-variant/10 cursor-pointer transition-colors">
              <div className="flex flex-col">
                <span className="text-sm font-semibold">Özel Semboller</span>
                <span className="text-xs text-on-surface-variant font-mono">@#$%!*</span>
              </div>
              <input
                type="checkbox"
                checked={options.symbols}
                onChange={(e) => setOptions({ ...options, symbols: e.target.checked })}
                className="w-5 h-5 text-brand-primary bg-surface-low border-outline-variant/30 rounded focus:ring-brand-primary/20 accent-brand-primary cursor-pointer"
              />
            </label>
          </div>
        </div>
      ) : (
        /* Diceware configurations Card */
        <div className="glass-panel p-6 rounded-2xl space-y-6" id="diceware-spec-panel">
          {/* Section banner */}
          <div className="flex items-center justify-between mb-2 pb-4 border-b border-outline-variant/10">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-tertiary" />
              <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider">DICEWARE SİSTEM ÖZELLEŞTİRMELERİ</h3>
            </div>
            <div className={`text-xs font-bold ${dicewareStatus.color}`}>
              {dicewareStatus.text}
            </div>
          </div>

          {/* Word list count slider */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-on-surface">Kelime Sayısı</span>
              <span className="font-mono text-base font-bold text-brand-tertiary bg-[#0d0f0d] px-3 py-1 rounded-lg border border-outline-variant/10">
                {dicewareOptions.wordCount} Kelime
              </span>
            </div>
            <input
              type="range"
              min="3"
              max="10"
              value={dicewareOptions.wordCount}
              onChange={(e) => setDicewareOptions({ ...dicewareOptions, wordCount: parseInt(e.target.value) })}
              className="w-full h-1.5 bg-surface-low rounded-lg appearance-none cursor-pointer accent-brand-tertiary"
            />
            <div className="flex justify-between text-[11px] text-on-surface-variant/40 font-mono">
              <span>3 Kelime (Kolay)</span>
              <span>10 Kelime (Aşırı Güçlü)</span>
            </div>
          </div>

          {/* Separator Selection */}
          <div className="space-y-2">
            <span className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Kelimeleri Ayrıştırma Türü</span>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2" id="separator-selection-grid">
              {(
                [
                  { value: 'hyphen', label: 'Tire (-)' },
                  { value: 'dot', label: 'Nokta (.)' },
                  { value: 'underscore', label: 'Alt Çizgi (_)' },
                  { value: 'space', label: 'Boşluk ( )' },
                  { value: 'camel', label: 'CamelCase' },
                  { value: 'none', label: 'Bitişik' },
                ] as const
              ).map((sep) => {
                const isSelected = dicewareOptions.separator === sep.value;
                return (
                  <button
                    key={sep.value}
                    type="button"
                    onClick={() => setDicewareOptions({ ...dicewareOptions, separator: sep.value })}
                    className={`py-2 px-1 text-[11px] font-semibold text-center border rounded-lg transition-all cursor-pointer ${
                      isSelected
                        ? 'border-brand-tertiary bg-brand-tertiary/10 text-brand-tertiary shadow-sm'
                        : 'border-outline-variant/10 bg-[#141614] hover:bg-[#1c1e1c] text-on-surface-variant'
                    }`}
                  >
                    {sep.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Diceware Advanced Settings Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1" id="diceware-options-checkboxes">
            {/* Wordlist Language */}
            <div className="flex items-center justify-between p-4 bg-[#141614] rounded-xl border border-outline-variant/10">
              <div className="flex flex-col">
                <span className="text-sm font-semibold flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-brand-primary" />
                  <span>Kelimeler Sözlüğü</span>
                </span>
                <span className="text-xs text-on-surface-variant">Hangi dildeki kelimeler kullanılsın?</span>
              </div>
              <div className="flex border border-outline-variant/10 rounded-lg overflow-hidden p-0.5 bg-[#0d0f0d]">
                <button
                  type="button"
                  onClick={() => setDicewareOptions({ ...dicewareOptions, language: 'tr' })}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    dicewareOptions.language === 'tr'
                      ? 'bg-brand-primary text-brand-on-primary'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  TR
                </button>
                <button
                  type="button"
                  onClick={() => setDicewareOptions({ ...dicewareOptions, language: 'en' })}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    dicewareOptions.language === 'en'
                      ? 'bg-brand-primary text-brand-on-primary'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  EN
                </button>
              </div>
            </div>

            {/* Capitalize First letters check */}
            <label className="flex items-center justify-between p-4 bg-[#141614] hover:bg-[#181a18] rounded-xl border border-outline-variant/10 cursor-pointer transition-colors">
              <div className="flex flex-col">
                <span className="text-sm font-semibold">Baş Harfleri Büyüt</span>
                <span className="text-xs text-on-surface-variant">Her kelimenin ilk harfini büyük yap (Okunurluk)</span>
              </div>
              <input
                type="checkbox"
                checked={dicewareOptions.capitalize}
                onChange={(e) => setDicewareOptions({ ...dicewareOptions, capitalize: e.target.checked })}
                className="w-5 h-5 text-brand-tertiary bg-surface-low border-outline-variant/30 rounded focus:ring-brand-tertiary/20 accent-brand-tertiary cursor-pointer"
              />
            </label>

            {/* Add Random Numbers */}
            <label className="flex items-center justify-between p-4 bg-[#141614] hover:bg-[#181a18] rounded-xl border border-outline-variant/10 cursor-pointer transition-colors">
              <div className="flex flex-col">
                <span className="text-sm font-semibold flex items-center gap-1.5">
                  <Hash className="w-4 h-4 text-brand-secondary" />
                  <span>Rakam Ekle</span>
                </span>
                <span className="text-xs text-on-surface-variant">Parolanın sonuna/başına rastgele sayı ekler</span>
              </div>
              <input
                type="checkbox"
                checked={dicewareOptions.addNumber}
                onChange={(e) => setDicewareOptions({ ...dicewareOptions, addNumber: e.target.checked })}
                className="w-5 h-5 text-brand-tertiary bg-surface-low border-outline-variant/30 rounded focus:ring-brand-tertiary/20 accent-brand-tertiary cursor-pointer"
              />
            </label>

            {/* Add Random Symbols */}
            <label className="flex items-center justify-between p-4 bg-[#141614] hover:bg-[#181a18] rounded-xl border border-outline-variant/10 cursor-pointer transition-colors">
              <div className="flex flex-col font-sans">
                <span className="text-sm font-semibold flex items-center gap-1.5">
                  <Minimize2 className="w-4 h-4 text-brand-tertiary" />
                  <span>Sembol Ekle</span>
                </span>
                <span className="text-xs text-on-surface-variant">Parolanın sonuna/başına sembol ekler</span>
              </div>
              <input
                type="checkbox"
                checked={dicewareOptions.addSymbol}
                onChange={(e) => setDicewareOptions({ ...dicewareOptions, addSymbol: e.target.checked })}
                className="w-5 h-5 text-brand-tertiary bg-surface-low border-outline-variant/30 rounded focus:ring-brand-tertiary/20 accent-brand-tertiary cursor-pointer"
              />
            </label>
          </div>

          {/* Diceware informational secure helper */}
          <div className="flex gap-3 bg-brand-primary/5 border border-brand-primary/10 p-4 rounded-xl items-start">
            <Lock className="w-5 h-5 text-brand-primary shrink-0 mt-0.5" />
            <div className="text-xs text-on-surface-variant leading-relaxed">
              <b className="text-on-surface block mb-0.5">Neden Diceware Kelime Şifreleri Kullanmalıyım?</b>
              Diceware şifreleri, karmaşık rastgele karakterlere kıyasla <b>insan beyni tarafından katlarca daha kolay ezberlenir</b> ancak <b>kriptografik entropisi inanılmaz derecede yüksektir</b>. Özellikle kasanızın kilit açma şifresi (Ana Şifre) için minimum 4-5 kelimelik bir Türkçe Diceware şifresi kullanmanız şiddetle tavsiye edilir.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
