/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import { 
  Settings, 
  ShieldAlert, 
  Download, 
  Upload, 
  Trash2, 
  Key, 
  Database, 
  RefreshCw, 
  Check, 
  CheckCircle, 
  Lock, 
  Clock, 
  ShieldCheck, 
  FileJson, 
  Unlock, 
  AlertCircle,
  Fingerprint
} from 'lucide-react';
import { getVaultItems, setupMasterPassword, resetSystem, reseedDemoData, saveVaultItem, verifyMasterPassword } from '../lib/storage';
import { AppNotification, VaultItem } from '../types';
import { decryptDataWithPasswordSecure, encryptDataWithPasswordSecure } from '../lib/encryption';
import { parseUniversalImport } from '../lib/importer';
import { secureRandomToken } from '../lib/random';
import { registerBiometric, isBiometricEnabled, disableBiometric, isBiometricSupported } from '../lib/biometric';
import { getActiveMasterPassword } from '../lib/vaultSession';
import { openDesktopImportFile, saveDesktopExportFile } from '../lib/desktopFiles';
import { isDesktopRuntime } from '../lib/desktopStorage';

interface SettingsPanelProps {
  onDatabaseChanged: () => void | Promise<void>;
  autoLockDuration: number;
  onAutoLockDurationChange: (duration: number) => void;
  onNotify?: (notification: AppNotification) => void;
}

export default function SettingsPanel({ 
  onDatabaseChanged, 
  autoLockDuration, 
  onAutoLockDurationChange,
  onNotify,
}: SettingsPanelProps) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<boolean>(false);

  // Biometric Lock States
  const [biometricEnabled, setBiometricEnabled] = useState(isBiometricEnabled());
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [biometricSuccess, setBiometricSuccess] = useState<string | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);

  // Auto-Lock Option Selectors
  const lockOptions = [
    { value: 15, label: '15 Saniye (Test)' },
    { value: 30, label: '30 Saniye' },
    { value: 60, label: '1 Dakika' },
    { value: 300, label: '5 Dakika' },
    { value: 900, label: '15 Dakika' },
    { value: 1800, label: '30 Dakika' },
    { value: 3600, label: '1 Saat' },
    { value: 0, label: 'Asla Kilitleme' }
  ];

  // Encrypted Export States
  const [useMasterForBackup, setUseMasterForBackup] = useState(true);
  const [customBackupPassword, setCustomBackupPassword] = useState('');
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  // Universal Import states
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [detectedFormat, setDetectedFormat] = useState<string | null>(null);

  // Credentials pending decryption flow
  const [pendingEnvelope, setPendingEnvelope] = useState<any | null>(null);
  const [decryptPasswordInput, setDecryptPasswordInput] = useState('');
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [items, setItems] = useState<VaultItem[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isMounted = true;
    getVaultItems().then((loaded) => {
      if (isMounted) {
        setItems(loaded);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const currentDateSlug = () => new Date().toISOString().split('T')[0];

  const downloadTextFile = (filename: string, contents: string) => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(contents);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', filename);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Helper clear-out
  const resetImportFlowState = () => {
    setImportError(null);
    setImportSuccess(null);
    setDetectedFormat(null);
    setPendingEnvelope(null);
    setDecryptPasswordInput('');
    setDecryptError(null);
  };

  // Handle Toggle Biometric Lock status
  const handleToggleBiometric = async () => {
    setBiometricError(null);
    setBiometricSuccess(null);
    setBiometricLoading(true);

    if (biometricEnabled) {
      try {
        disableBiometric();
        setBiometricEnabled(false);
        setBiometricSuccess("Biyometrik kilit açma (Touch ID / Face ID / Windows Hello) devre dışı bırakıldı.");
      } catch (err: any) {
        setBiometricError(err?.message || "İşlem sırasında bir hata oluştu.");
      } finally {
        setBiometricLoading(false);
      }
    } else {
      try {
        if (!isBiometricSupported()) {
          throw new Error("Cihazınızda veya tarayıcınızda biyometrik kilit açma özelliği (WebAuthn / PublicKeyCredential) desteklenmiyor veya devre dışı.");
        }
        
        const masterPassword = getActiveMasterPassword();
        if (!masterPassword) {
          throw new Error("Oturum doğrulaması eksik. Lütfen sayfayı yenileyip tekrar giriş yapın.");
        }
        
        await registerBiometric(masterPassword);
        setBiometricEnabled(true);
        setBiometricSuccess("✓ Biyometrik kilit başarıyla aktifleştirildi! Bir sonraki girişte ana şifrenizi girmek yerine OS biyometrisini (Windows Hello, Touch ID, Face ID) kullanabilirsiniz.");
      } catch (err: any) {
        let errMsg = err?.message || "Biyometrik kilit kaydı başarısız oldu.";
        if (err?.name === "SecurityError" || err?.name === "NotAllowedError") {
          errMsg = "WebAuthn kısıtlaması veya kullanıcı iptali: Tarayıcınız güvenlik sebebiyle iframe içinde biyometrik kayda izin vermiyor olabilir veya doğrulama iptal edildi. Bu özelliği sorunsuz kullanmak için lütfen sayfayı yeni sekmede/tam ekranda açarak kaydolun.";
        }
        setBiometricError(errMsg);
      } finally {
        setBiometricLoading(false);
      }
    }
  };

  // Handle Master Password updating
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    const isCorrectOld = await verifyMasterPassword(oldPassword);
    if (!isCorrectOld) {
      setPasswordError('Mevcut Ana Şifrenizi hatalı girdiniz.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('Yeni şifre en az 6 karakter olmalıdır.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Şifreler uyuşmuyor.');
      return;
    }

    await setupMasterPassword(newPassword);
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordSuccess(true);
    setTimeout(() => setPasswordSuccess(false), 4000);
  };

  // Generate a plain (unencrypted) json export download
  const handleExportPlain = async () => {
    setBackupSuccess(null);
    setBackupError(null);
    const latestItems = await getVaultItems();
    setItems(latestItems);
    const filename = `aegis_acik_yedek_${currentDateSlug()}.json`;
    const contents = JSON.stringify(latestItems, null, 2);

    try {
      const savedWithDialog = await saveDesktopExportFile(filename, contents);
      if (!savedWithDialog) {
        if (isDesktopRuntime()) return;
        downloadTextFile(filename, contents);
      }
    } catch (err: any) {
      setBackupError(`DÄ±ÅŸa aktarÄ±m hatasÄ±: ${err?.message || 'Dosya kaydedilemedi.'}`);
      return;
    }
    setBackupSuccess('Açık metin parola yedeği başarıyla indirildi.');
    setTimeout(() => setBackupSuccess(null), 4000);
  };

  // Generate an ENCRYPTED secure export download
  const handleExportEncrypted = async (e: React.FormEvent) => {
    e.preventDefault();
    setBackupSuccess(null);
    setBackupError(null);

    let passwordToUse = '';
    if (useMasterForBackup) {
      const masterPassword = getActiveMasterPassword();
      if (!masterPassword) {
        setBackupError('Lütfen önce bir ana şifre oluşturun.');
        return;
      }
      passwordToUse = masterPassword;
    } else {
      if (!customBackupPassword) {
        setBackupError('Lütfen şifre alanını doldurun.');
        return;
      }
      passwordToUse = customBackupPassword;
    }

    try {
      const latestItems = await getVaultItems();
      setItems(latestItems);
      const encryptedJsonString = await encryptDataWithPasswordSecure(JSON.stringify(latestItems), passwordToUse);
      const filename = `aegis_guvenli_yedek_${currentDateSlug()}.aegis`;
      const savedWithDialog = await saveDesktopExportFile(filename, encryptedJsonString);
      if (!savedWithDialog) {
        if (isDesktopRuntime()) return;
        downloadTextFile(filename, encryptedJsonString);
      }

      setBackupSuccess('Askeri düzeyde şifreli yedeğiniz (.aegis) güvenle oluşturuldu ve indirildi.');
      setCustomBackupPassword('');
      setTimeout(() => setBackupSuccess(null), 5000);
    } catch (err: any) {
      setBackupError(`Şifreleme hatası: ${err?.message}`);
    }
  };

  // Normalize dynamic fields and saves parsed list items
  const handleImportedItems = async (itemsList: any[]) => {
    let successCount = 0;
    for (const x of itemsList) {
      if (x.title || x.username) {
        await saveVaultItem({
          id: x.id || secureRandomToken(9),
          title: x.title || 'İçeri Aktarılan Kayıt',
          username: x.username || '',
          password: x.password || '',
          url: x.url || '',
          notes: x.notes || '',
          totpSecret: x.totpSecret || '',
          createdAt: x.createdAt || new Date().toISOString().split('T')[0],
          updatedAt: new Date().toISOString().split('T')[0],
          category: x.category || 'login',
          favorite: !!x.favorite,
          
          // credit card fields
          cardholderName: x.cardholderName || '',
          cardNumber: x.cardNumber || '',
          cardExpiry: x.cardExpiry || '',
          cardCvv: x.cardCvv || '',
          cardPin: x.cardPin || '',

          // identity fields
          idFullName: x.idFullName || '',
          idNumber: x.idNumber || '',
          idBirthDate: x.idBirthDate || '',
          idExpiryDate: x.idExpiryDate || '',
          idGender: x.idGender || '',

          // passkey fields
          passkeyService: x.passkeyService || '',
          passkeyPublicId: x.passkeyPublicId || '',
          passkeyPrivateExponent: x.passkeyPrivateExponent || '',
        });
        successCount++;
      }
    }

    onDatabaseChanged();
    setItems(await getVaultItems());
    return successCount;
  };

  // Decrypts and unpacks encrypted .aegis uploads
  const handleDecryptAndImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setDecryptError(null);

    if (!decryptPasswordInput) {
      setDecryptError('Parola girmediniz.');
      return;
    }

    try {
      const decryptedDataStr = await decryptDataWithPasswordSecure(JSON.stringify(pendingEnvelope), decryptPasswordInput);
      const parsedItemsList = JSON.parse(decryptedDataStr);

      if (!Array.isArray(parsedItemsList)) {
        throw new Error('Yedek dosyasının içi liste yapısında değil.');
      }

      const importedNum = await handleImportedItems(parsedItemsList);
      setImportSuccess(`✓ Şifreli .aegis yedeği başarıyla çözüldü! ${importedNum} adet parola kasaya eklendi.`);
      setPendingEnvelope(null);
      setDecryptPasswordInput('');
    } catch (err: any) {
      setDecryptError(err?.message || 'Şifre çözme başarısız. Lütfen şifrenizi kontrol edip tekrar deneyin.');
    }
  };

  // Parses raw file data through the Universal Importer
  const processImportFile = (file: File) => {
    resetImportFlowState();
    setImporting(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      void (async () => {
        try {
          const result = e.target?.result as string;
          const scanResult = parseUniversalImport(result);

          if (scanResult.type === 'error') {
            throw new Error(scanResult.message);
          }

          if (scanResult.type === 'encrypted_aegis') {
            // Encrypted flow: display decryption dialog
            setDetectedFormat('Şifreli Aegis Kasa Yedeği (.aegis)');
            setPendingEnvelope(scanResult.envelope);
          } else {
            // Success plaintext flow
            const count = await handleImportedItems(scanResult.items);
            setImportSuccess(`✓ ${scanResult.formatName} başarıyla tespit edildi! ${count} adet kayıt kasaya yüklendi.`);
          }
        } catch (err: any) {
          setImportError(err?.message || 'İçe aktarım başarısız oldu. Dosya formatını kontrol edin.');
        } finally {
          setImporting(false);
        }
      })();
    };
    reader.readAsText(file);
  };

  const triggerImportSelect = async () => {
    try {
      const selectedFile = await openDesktopImportFile();
      if (selectedFile) {
        processImportFile(new File([selectedFile.contents], selectedFile.name));
        return;
      }

      if (isDesktopRuntime()) return;
      fileInputRef.current?.click();
    } catch (err: any) {
      resetImportFlowState();
      setImportError(err?.message || 'Dosya seÃ§imi baÅŸarÄ±sÄ±z oldu.');
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = () => {
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processImportFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processImportFile(e.target.files[0]);
    }
  };

  const triggerReseed = () => {
    void (async () => {
      const reseeded = await reseedDemoData();
      setItems(reseeded);
      onDatabaseChanged();
      onNotify?.({
        title: 'Demo Veriler Yüklendi',
        message: 'Varsayılan demo veriler başarıyla yeniden yüklendi!',
        type: 'success',
      });
    })();
  };

  const triggerResetAll = () => {
    const confirmation = window.confirm('Kritik Uyarı!\nTüm parolalarınız ve şifreleme anahtarınız silinecek. Kasa sıfırlanacaktır.\nDevam etmek istiyor musunuz?');
    if (confirmation) {
      resetSystem();
      window.location.reload();
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10" id="settings-panel-container">
      {/* Title block */}
      <div className="flex items-center gap-3 mb-2" id="settings-title-section">
        <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-amber-500/20">
          <Settings className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold font-display text-on-surface">Kasa Ayarları</h2>
          <p className="text-xs text-on-surface-variant">Kilit sürelerinizi, askeri şifreli yedeklerinizi ve çoklu aktarımları bu panelden yönetin.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6" id="settings-top-row">
        {/* Statistics & Info */}
        <div className="glass-panel p-6 rounded-2xl md:col-span-1 space-y-4" id="stats-card">
          <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2 border-b border-outline-variant/10 pb-2">
            <Database className="w-4 h-4 text-brand-primary" />
            <span>Kasa İstatistikleri</span>
          </h3>
          <div className="space-y-3 pt-1">
            <div className="flex justify-between items-center text-sm border-b border-outline-variant/10 pb-2">
              <span className="text-on-surface-variant">Toplam Ürün</span>
              <span className="font-mono font-bold text-brand-primary">{items.length}</span>
            </div>
            <div className="flex justify-between items-center text-sm border-b border-outline-variant/10 pb-2">
              <span className="text-on-surface-variant">Güvenli Yapı</span>
              <span className="text-[#10b981] font-bold text-xs flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> AES-GCM
              </span>
            </div>
            <div className="flex justify-between items-center text-sm border-b border-outline-variant/10 pb-2">
              <span className="text-on-surface-variant">Veri Konumu</span>
              <span className="text-xs text-brand-tertiary">Tarayıcı Belleği</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={triggerReseed}
              className="w-full flex items-center justify-center gap-2 text-xs font-semibold bg-[#1a1c1a] border border-outline-variant/25 hover:bg-[#252825] py-3 rounded-lg text-on-surface-variant hover:text-on-surface transition-all cursor-pointer"
              id="demo-reseed-btn"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Demo Verilerini Getir</span>
            </button>
          </div>
        </div>

        {/* Change Master Password Card */}
        <div className="glass-panel p-6 rounded-2xl md:col-span-2 space-y-4" id="change-pass-card">
          <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2 border-b border-outline-variant/10 pb-2">
            <Key className="w-4 h-4 text-brand-secondary" />
            <span>Ana Şifreyi Değiştir</span>
          </h3>

          <form onSubmit={handlePasswordChange} className="space-y-3 pt-1" id="pass-change-form">
            {passwordError && (
              <div className="p-3 bg-brand-error/10 border border-brand-error/20 rounded-lg text-brand-error text-xs flex gap-2 items-center">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}
            {passwordSuccess && (
              <div className="p-3 bg-brand-tertiary/10 border border-brand-tertiary/20 rounded-lg text-brand-tertiary text-xs flex gap-2 items-center animate-pulse">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>Kasa ana şifreniz başarıyla değiştirildi!</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant/85 uppercase mb-1.5">
                  Mevcut Ana Şifre
                </label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full bg-[#141614] border border-outline-variant/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 text-on-surface"
                  placeholder="••••••••"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant/85 uppercase mb-1.5">
                  Yeni Ana Şifre
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#141614] border border-outline-variant/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 text-on-surface"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-on-surface-variant/85 uppercase mb-1.5">
                Yeni Şifre Tekrarı
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-[#141614] border border-outline-variant/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 text-on-surface"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              className="px-5 py-2.5 bg-brand-primary text-brand-on-primary rounded-lg font-bold text-xs hover:brightness-110 active:scale-95 transition-all mt-1 cursor-pointer"
            >
              Şifreyi Güncelle
            </button>
          </form>
        </div>
      </div>

      {/* Dynamic Auto-Lock Interval Card */}
      <div className="glass-panel p-6 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-6 items-center" id="auto-lock-settings-card">
        <div className="md:col-span-1 space-y-1.5">
          <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Otomatik Kilit Süresi</span>
          </h3>
          <p className="text-xs text-on-surface-variant">
            Uygulama arka planda boşta kaldığında veya belirtilen süre dolduğunda kendini güvenle otomatik kilitler.
          </p>
        </div>
        
        <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {lockOptions.map((opt) => {
            const isSelected = autoLockDuration === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onAutoLockDurationChange(opt.value)}
                className={`py-3 px-2 rounded-xl text-xs font-bold text-center border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-brand-primary bg-brand-primary/15 text-brand-primary shadow-md'
                    : 'border-outline-variant/15 bg-[#141614] hover:bg-[#1f211f] text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Biometric Lock Settings Card */}
      <div className="glass-panel p-6 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-6 items-center border border-outline-variant/10" id="biometric-settings-card">
        <div className="md:col-span-1 space-y-1.5">
          <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2">
            <Fingerprint className="w-5 h-5 text-brand-primary animate-pulse" />
            <span>Biyometrik Kilit Açma</span>
          </h3>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Windows Hello, Touch ID veya Face ID gibi işletim sistemi biyometrisini koruma amaçlı bir kolaylık olarak entegre edin. Ana şifreyi sarmalayan paketi (bundle) <b>PBKDF2-SHA256</b> + <b>AES-GCM</b> ile sararak yerelde saklar.
          </p>
        </div>
        
        <div className="md:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between bg-[#141614] p-4 rounded-xl border border-outline-variant/10">
            <div>
              <span className="text-xs font-bold text-on-surface block uppercase">Durum: {biometricEnabled ? 'AKTİF 🟢' : 'PASİF 🔴'}</span>
              <p className="text-[11px] text-on-surface-variant mt-1 leading-relaxed">
                {biometricEnabled 
                  ? 'OS Biyometrik koruması devrede. Giriş ekranında biyometrik kilit açma butonunu kullanabilirsiniz.' 
                  : 'Biyometrik kilit kapalı. Sadece ana şifrenizle giriş yapabilirsiniz.'}
              </p>
            </div>
            <button
              type="button"
              disabled={biometricLoading}
              onClick={handleToggleBiometric}
              className={`px-5 py-2.5 rounded-lg text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shrink-0 ${
                biometricEnabled
                  ? 'border border-red-500/30 text-red-400 hover:bg-red-500/10'
                  : 'bg-brand-primary text-brand-on-primary hover:brightness-110 shadow-md shadow-brand-primary/10'
              }`}
            >
              {biometricLoading ? (
                <span>Bekleyin...</span>
              ) : biometricEnabled ? (
                <span>Biyometriyi Kaldır</span>
              ) : (
                <>
                  <Fingerprint className="w-4 h-4" />
                  <span>Biyometriyi Aktifleştir</span>
                </>
              )}
            </button>
          </div>

          {biometricSuccess && (
            <div className="p-3 bg-brand-tertiary/10 border border-brand-tertiary/20 rounded-lg text-brand-tertiary text-xs leading-relaxed animate-fade-in flex items-start gap-2">
              <Check className="w-4 h-4 shrink-0 text-brand-tertiary mt-0.5" />
              <span>{biometricSuccess}</span>
            </div>
          )}

          {biometricError && (
            <div className="p-3 bg-brand-error/10 border border-brand-error/20 rounded-lg text-brand-error text-xs leading-relaxed animate-fade-in flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <span>{biometricError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Backup, Encryption, and Import Rows */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="backup-restore-rows">
        {/* Encrypted Export Card */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between space-y-4" id="encrypted-export-card">
          <div className="space-y-3.5">
            <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2 border-b border-outline-variant/10 pb-2">
              <Download className="w-4 h-4 text-brand-tertiary" />
              <span>Verileri Şifreli Yedekle (Export)</span>
            </h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Tüm kasa kayıtlarınızı ve şifrelerinizi askeri düzeyde şifreli bir <b className="text-brand-tertiary">.aegis</b> yedek dosyasına dönüştürün. Bu sayede yedeğiniz başkalarının eline geçse dahi şifresi olmadan asla açılamaz.
            </p>

            <form onSubmit={handleExportEncrypted} className="space-y-3 pt-1">
              <div className="flex items-center gap-2.5 bg-[#141614] p-3 rounded-xl border border-outline-variant/10">
                <input
                  type="checkbox"
                  id="useMasterCheck"
                  checked={useMasterForBackup}
                  onChange={(e) => setUseMasterForBackup(e.target.checked)}
                  className="w-4 h-4 accent-brand-secondary rounded border-outline-variant bg-[#141614] cursor-pointer"
                />
                <label htmlFor="useMasterCheck" className="text-xs text-on-surface font-semibold cursor-pointer select-none">
                  Kasa ana şifremi yedekleme parolası yap
                </label>
              </div>

              {!useMasterForBackup && (
                <div className="space-y-1.5 animate-fade-in">
                  <label className="block text-[10px] font-bold text-brand-secondary uppercase">
                    Yedekleme Güvenlik Şifresi
                  </label>
                  <input
                    type="password"
                    value={customBackupPassword}
                    onChange={(e) => setCustomBackupPassword(e.target.value)}
                    className="w-full bg-[#141614] border border-outline-variant/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-tertiary text-on-surface"
                    placeholder="En az 6 haneli özel yedek şifresi girin"
                    minLength={6}
                    required={!useMasterForBackup}
                  />
                </div>
              )}

              {backupSuccess && (
                <div className="p-3 bg-brand-tertiary/10 border border-brand-tertiary/20 rounded-lg text-brand-tertiary text-xs">
                  {backupSuccess}
                </div>
              )}

              {backupError && (
                <div className="p-3 bg-brand-error/10 border border-brand-error/20 rounded-lg text-brand-error text-xs flex gap-2 items-center">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{backupError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 bg-brand-tertiary text-black font-extrabold py-3 rounded-lg text-xs hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-lg shadow-brand-tertiary/5"
                >
                  <Lock className="w-4 h-4" />
                  <span>Şifreli .aegis Yedeği</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportPlain}
                  className="w-full flex items-center justify-center gap-2 border border-outline-variant/30 text-on-surface-variant hover:text-on-surface py-3 rounded-lg text-xs hover:bg-[#1a1c1a]/50 active:scale-95 transition-all cursor-pointer"
                >
                  <Unlock className="w-4 h-4" />
                  <span>Açık Metin .json Yedeği</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Universal Importer and Uploader Card */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between space-y-4" id="universal-import-card">
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2 border-b border-outline-variant/10 pb-2">
              <Upload className="w-4 h-4 text-[#2096f3]" />
              <span>Evrensel İçe Aktarma Sistemi</span>
            </h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Kendi şifreli <u className="text-brand-primary">.aegis</u> yedeklerinizin yanı sıra <b>Bitwarden (JSON/CSV)</b>, <b>LastPass (CSV)</b>, <b>Chrome (CSV)</b> ve <b>1Password (CSV)</b> gibi diğer kasa yöneticilerinin yedeklerini de buraya yükleyerek anında içeri aktarabilirsiniz.
            </p>

            {/* Display loading state or pending Decryption details */}
            {pendingEnvelope ? (
              <form onSubmit={handleDecryptAndImport} className="p-4 bg-[#141614] border border-brand-primary/20 rounded-xl space-y-3 animate-fade-in text-left">
                <div className="flex items-center gap-2 text-brand-primary">
                  <Lock className="w-4 h-4 animate-bounce" />
                  <span className="text-xs font-bold uppercase tracking-wider">🔒 KİLİTLİ YEDEK TESPİT EDİLDİ</span>
                </div>
                <p className="text-[11px] text-on-surface-variant">
                  Görünüşe göre bu yedek askeri düzeyde bir şifreli dosya. İçeriğini çözüp içe aktarmak için belirlediğiniz şifreyi giriniz:
                </p>

                <div>
                  <input
                    type="password"
                    value={decryptPasswordInput}
                    onChange={(e) => setDecryptPasswordInput(e.target.value)}
                    className="w-full bg-[#181c18] border border-outline-variant/30 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-primary text-on-surface font-mono"
                    placeholder="Kilidi açacak şifreyi girin"
                    required
                  />
                </div>

                {decryptError && (
                  <div className="p-2.5 bg-brand-error/15 border border-brand-error/30 text-brand-error text-[10px] rounded flex gap-1.5 items-center">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{decryptError}</span>
                  </div>
                )}

                <div className="flex items-center gap-2.5">
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-brand-primary text-brand-on-primary font-bold text-xs rounded-lg hover:brightness-110 active:scale-95 transition-all"
                  >
                    Şifreyi Çöz ve Aktar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingEnvelope(null);
                      setDecryptPasswordInput('');
                      setDecryptError(null);
                    }}
                    className="py-2 px-3 border border-outline-variant/30 text-on-surface-variant hover:text-on-surface text-xs rounded-lg"
                  >
                    Vazgeç
                  </button>
                </div>
              </form>
            ) : (
              <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => {
                  void triggerImportSelect();
                }}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                  isDragOver
                    ? 'border-brand-primary bg-brand-primary/10'
                    : 'border-outline-variant/30 bg-[#141614] hover:bg-[#181a18]'
                }`}
                id="drop-zone-select"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".json,.csv,.aegis,application/json,text/csv"
                  className="hidden"
                />
                <Upload className="w-8 h-8 mx-auto text-on-surface-variant/50 mb-2" />
                <p className="text-xs text-on-surface font-semibold">Tıklayarak Seçin ya da Dosyayı Sürükleyin</p>
                <p className="text-[10px] text-on-surface-variant/40 mt-1 uppercase font-mono tracking-widest">
                  DESTEKLENEN: .JSON / .CSV / .AEGIS
                </p>
              </div>
            )}

            {importError && (
              <div className="p-3 bg-brand-error/10 border border-brand-error/20 rounded-lg text-brand-error text-xs">
                {importError}
              </div>
            )}
            
            {importSuccess && (
              <div className="p-3 bg-brand-tertiary/10 border border-brand-tertiary/20 rounded-lg text-brand-tertiary text-xs font-semibold">
                {importSuccess}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Extreme Danger Zone */}
      <div className="p-6 bg-brand-error/5 border border-brand-error/20 rounded-2xl space-y-4" id="danger-zone-section">
        <h3 className="font-bold text-sm text-brand-error uppercase tracking-wider flex items-center gap-2 border-b border-brand-error/10 pb-2">
          <Trash2 className="w-4 h-4" />
          <span>TEHLİKELİ BÖLGE (DANGER ZONE)</span>
        </h3>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          Aşağıdaki sıfırlama işlemi kasanızdaki tüm kayıtlı şifreleri, kimlik belgelerini, özel notları, güvenli ekleri ve Master Password şifrelemesini geri alınamayacak şekilde kalıcı olarak silecektir. Lütfen bu işlemi geri yedeğiniz olmadan yapmayınız.
        </p>
        <button
          onClick={triggerResetAll}
          className="flex items-center gap-2 px-5 py-3 rounded-lg border-2 border-brand-error hover:bg-brand-error hover:text-brand-on-error font-bold text-xs text-brand-error transition-all cursor-pointer"
        >
          <Trash2 className="w-4" />
          <span>Tüm Kasayı Kalıcı Olarak Sıfırla</span>
        </button>
      </div>
    </div>
  );
}
