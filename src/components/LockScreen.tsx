/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Lock, 
  Unlock, 
  ShieldAlert, 
  Fingerprint, 
  ShieldCheck, 
  Cpu, 
  HardDrive, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  Info,
  Sparkles,
  RefreshCw,
  Trash2
} from 'lucide-react';
import { isMasterPasswordSet, setupMasterPassword, verifyMasterPassword } from '../lib/storage';
import { isBiometricEnabled, isBiometricSupported, authenticateBiometric } from '../lib/biometric';
import { APP_FOOTER_NAME, APP_NAME, APP_SHORT_NAME } from '../lib/branding';

interface LockScreenProps {
  onUnlock: () => void;
}

export default function LockScreen({ onUnlock }: LockScreenProps) {
  const isSetup = isMasterPasswordSet();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Biometric Unlock States
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const isBioEnabled = isBiometricEnabled();

  const handleBiometricUnlock = async () => {
    setBiometricError(null);
    setError(null);
    setBiometricLoading(true);

    try {
      if (!isBiometricSupported()) {
        throw new Error("Cihazınızda veya tarayıcınızda biyometrik kilit açma (WebAuthn) desteklenmiyor.");
      }
      const decryptedMaster = await authenticateBiometric();
      if (await verifyMasterPassword(decryptedMaster)) {
        onUnlock();
      } else {
        throw new Error("Ana şifre bütünlük doğrulaması başarısız! Lütfen manuel olarak giriş yapın.");
      }
    } catch (err: any) {
      let errMsg = err?.message || "Biyometrik kilit açma başarısız oldu.";
      if (err?.name === "SecurityError" || err?.name === "NotAllowedError") {
        errMsg = "Biyometrik doğrulama izni kısıtlandı veya iptal edildi. Tarayıcınız güvenli iframe kısıtlaması uyguluyor olabilir. Lütfen bu özelliği kullanmak için uygulamayı yeni sekmede/tam ekranda açın.";
      }
      setBiometricError(errMsg);
    } finally {
      setBiometricLoading(false);
    }
  };

  // Auto trigger biometric prompt on lock screen if enabled
  React.useEffect(() => {
    if (isSetup && isBioEnabled) {
      const timer = setTimeout(() => {
        handleBiometricUnlock();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isSetup]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBiometricError(null);

    if (!isSetup) {
      if (password.length < 6) {
        setError('Ana şifre en az 6 karakterden oluşmalıdır.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Belirlediğiniz şifreler birbiriyle eşleşmiyor. Lütfen kontrol edin.');
        return;
      }
      await setupMasterPassword(password);
      onUnlock();
    } else {
      if (await verifyMasterPassword(password)) {
        onUnlock();
      } else {
        setError('Hatalı Ana Şifre! Lütfen girilen şifreyi kontrol ederek tekrar deneyiniz.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#070807] flex flex-col justify-between relative overflow-hidden select-none">
      {/* Absolute futuristic ambient glows */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-brand-primary/10 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none" />
      
      {/* Grid Pattern Background */}
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.02] pointer-events-none" />

      {/* Main Grid Panel */}
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-8 lg:py-16 flex items-center justify-center relative z-10">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 items-center">
          
          {/* LEFT COLUMN: Educational & Cyber-Security Features Showcase */}
          <div className="lg:col-span-7 space-y-8 animate-fade-in text-left">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-[10px] font-bold tracking-widest uppercase rounded-full">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                <span>AKILLI SİBER GÜVENLİK KASASI</span>
              </div>
              <h1 className="font-display text-3xl md:text-5xl font-bold tracking-tight text-on-surface leading-tight">
                Dijital Varlıklarınızı <br />
                <span className="text-brand-primary bg-gradient-to-r from-brand-primary to-emerald-400 bg-clip-text text-transparent">Askeri Standartta</span> Koruyun
              </h1>
              <p className="text-on-surface-variant text-sm md:text-base max-w-xl leading-relaxed">
                {APP_NAME}; kişisel parolalarınızı, kredi kartlarınızı ve güvenli notlarınızı en zorlu dijital tehlikelere karşı korumak için tasarlanmış yenilikçi, yerel öncelikli (local-first) bir koruma kalkanıdır.
              </p>
            </div>

            {/* Premium Feature Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <div className="bg-[#101210]/50 border border-outline-variant/10 rounded-2xl p-4 space-y-2 hover:border-brand-primary/20 transition-all duration-300">
                <div className="w-9 h-9 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="font-display font-semibold text-sm text-on-surface">Sıfır-Bilgi Teknolojisi</h3>
                <p className="text-on-surface-variant text-[11.5px] leading-relaxed">
                  Şifreniz ve verileriniz asla uzak sunuculara gönderilmez. Şifre çözme işlemleri tamamen kendi tarayıcınızda ve işlemcinizde gerçekleşir.
                </p>
              </div>

              <div className="bg-[#101210]/50 border border-outline-variant/10 rounded-2xl p-4 space-y-2 hover:border-brand-primary/20 transition-all duration-300">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Cpu className="w-5 h-5" />
                </div>
                <h3 className="font-display font-semibold text-sm text-on-surface font-display">Askeri Düzey Çözümleme</h3>
                <p className="text-on-surface-variant text-[11.5px] leading-relaxed">
                  Güçlü hash mekanizmaları ve AES standartlarında yerel şifreleme motoru sayesinde, cihazınız çalınsa dahi verileriniz ulaşılamaz kalır.
                </p>
              </div>

              <div className="bg-[#101210]/50 border border-outline-variant/10 rounded-2xl p-4 space-y-2 hover:border-brand-primary/20 transition-all duration-300">
                <div className="w-9 h-9 rounded-xl bg-brand-tertiary/10 border border-brand-tertiary/20 flex items-center justify-center text-brand-tertiary">
                  <HardDrive className="w-5 h-5" />
                </div>
                <h3 className="font-display font-semibold text-sm text-on-surface font-display">Tam Yerel Kontrol</h3>
                <p className="text-on-surface-variant text-[11.5px] leading-relaxed">
                  Veritabanınız tamamen sizin kontrolünüzdedir. İstediğiniz an verilerinizi yedekli dışa aktarabilir (JSON) veya geri yükleyebilirsiniz.
                </p>
              </div>

              <div className="bg-[#101210]/50 border border-outline-variant/10 rounded-2xl p-4 space-y-2 hover:border-brand-primary/20 transition-all duration-300">
                <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                  <Trash2 className="w-5 h-5" />
                </div>
                <h3 className="font-display font-semibold text-sm text-on-surface font-display">Akıllı Çöp Kutusu</h3>
                <p className="text-on-surface-variant text-[11.5px] leading-relaxed">
                  Yanlışlıkla silinen parolalarınız kalıcı olarak yok olmaz, 15 gün boyunca yerel çöp kutusunda tutulur ve dilediğiniz an geri döndürülebilir.
                </p>
              </div>

            </div>

            {/* Real-time System Indicators */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-on-surface-variant">
              <div className="flex items-center gap-1.5 bg-[#121412] px-3 py-1.5 rounded-full border border-outline-variant/5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
                <span>Yerel Depolama: Aktif</span>
              </div>
              <div className="flex items-center gap-1.5 bg-[#121412] px-3 py-1.5 rounded-full border border-outline-variant/5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-tertiary" />
                <span>Askeri Şifreleme Kilidi</span>
              </div>
              <div className="flex items-center gap-1.5 bg-[#121412] px-3 py-1.5 rounded-full border border-outline-variant/5">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                <span>Çöp Kutusu Koruması</span>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Interactive High-Precision Password Box */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <div className="w-full max-w-md bg-surface-container/60 border border-outline-variant/20 rounded-2xl p-8 backdrop-blur-xl custom-shadow relative z-10 transition-all duration-300 hover:border-brand-primary/15">
              
              <div className="absolute top-0 left-0 w-32 h-32 bg-brand-primary/5 rounded-full blur-[50px] pointer-events-none" />

              <div className="flex flex-col items-center text-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-brand-primary/10 border border-brand-primary/25 flex items-center justify-center mb-5 shadow-inner group">
                  <Lock className="w-7 h-7 text-brand-primary group-hover:scale-110 transition-transform duration-300" />
                </div>
                <h1 className="font-display text-2xl font-bold text-on-surface leading-tight tracking-tight">
                  {isSetup ? 'Kasa Kilitleri Aktif' : 'Güvenli Kasanızı Kurun'}
                </h1>
                <p className="text-on-surface-variant text-xs mt-2.5 max-w-xs leading-relaxed">
                  {isSetup
                    ? 'Tarayıcınıza kaydedilmiş askeri düzey şifreli verilerinize erişmek için ana şifrenizi girmeniz gerekmektedir.'
                    : `${APP_SHORT_NAME} yerel koruma sistemini aktifleştirmek için kendinize her zaman hatırlayacağınız güçlü bir Ana Şifre belirleyin.`}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-brand-error/10 border border-brand-error/20 text-brand-error text-xs leading-relaxed animate-fade-in">
                    <ShieldAlert className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {biometricError && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-brand-error/10 border border-brand-error/20 text-red-400 text-xs leading-relaxed animate-fade-in">
                    <Fingerprint className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
                    <span>{biometricError}</span>
                  </div>
                )}

                {/* Primary Password Input Container */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase">
                      {isSetup ? 'ANA ŞİFRE (MASTER PASSWORD)' : 'YENİ ANA ŞİFRE'}
                    </label>
                    <span className="text-[10px] text-zinc-500 font-medium">En az 6 karakter</span>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-[#141614] hover:bg-[#191b19] focus:bg-[#1b1d1b] border border-outline-variant/30 rounded-xl pl-4 pr-11 py-3.5 text-on-surface placeholder-on-surface-variant/20 focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-all text-center tracking-widest text-lg font-mono"
                      placeholder="••••••••"
                      required
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-on-surface-variant/60 hover:text-on-surface rounded-md focus:outline-none cursor-pointer"
                      title={showPassword ? 'Gizle' : 'Göster'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Setup Mode: Password Confirmation */}
                {!isSetup && (
                  <div>
                    <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
                      ŞİFREYİ TEKRAR ONAYLAYIN
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full bg-[#141614] hover:bg-[#191b19] focus:bg-[#1b1d1b] border border-outline-variant/30 rounded-xl pl-4 pr-11 py-3.5 text-on-surface placeholder-on-surface-variant/20 focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-all text-center tracking-widest text-lg font-mono"
                        placeholder="••••••••"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-on-surface-variant/60 hover:text-on-surface rounded-md focus:outline-none cursor-pointer"
                        title={showConfirmPassword ? 'Gizle' : 'Göster'}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* CTA Action button */}
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2.5 bg-brand-primary text-brand-on-primary py-4 rounded-xl font-bold transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-lg shadow-brand-primary/10 hover:brightness-110"
                >
                  {isSetup ? (
                    <>
                      <Unlock className="w-4.5 h-4.5" />
                      <span>Sistem Kilidini Aç</span>
                    </>
                  ) : (
                    <>
                      <Fingerprint className="w-4.5 h-4.5" />
                      <span>Güvenli Kasayı Başlat</span>
                    </>
                  )}
                </button>

                {/* Biometric Trigger Button */}
                {isSetup && isBioEnabled && (
                  <button
                    type="button"
                    disabled={biometricLoading}
                    onClick={handleBiometricUnlock}
                    className="w-full flex items-center justify-center gap-2.5 bg-brand-primary/10 border border-brand-primary/30 hover:bg-brand-primary/20 text-brand-primary py-3.5 rounded-xl font-bold transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer animate-fade-in"
                  >
                    <Fingerprint className={`w-4.5 h-4.5 text-brand-primary ${biometricLoading ? 'animate-ping' : 'animate-pulse'}`} />
                    <span>{biometricLoading ? 'Sistem Doğrulanıyor...' : 'Biyometrik Kilit Aç (OS)'}</span>
                  </button>
                )}
              </form>

              {/* Zero-Server trust notice banner */}
              <div className="mt-8 pt-6 border-t border-outline-variant/10 flex flex-col items-center gap-1.5 text-xs text-on-surface-variant/40 text-center">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-brand-tertiary" />
                  <span className="font-bold text-on-surface">Gizlilik Esaslı Yerel Tasarım</span>
                </div>
                <p className="leading-relaxed text-[11px] px-2">
                  Biz verilerinize veya master şifrenize asla erişemeyiz. Şifrenizi kaybetmemek için lütfen güvenli bir yerde saklayın.
                </p>
              </div>

            </div>
          </div>

        </div>
      </div>

      {/* Futuristic clean footer */}
      <footer className="w-full border-t border-outline-variant/5 py-4 bg-[#0a0b0a]/40 text-center text-[10px] text-on-surface-variant/30 font-mono flex flex-col sm:flex-row items-center justify-between px-6 gap-2">
        <span>© 2026 {APP_FOOTER_NAME}</span>
        <span>AES-256-GCM End-To-End Client-Side Cryptography</span>
      </footer>
    </div>
  );
}
