# AegisVault v7 — Derinlemesine Kod İnceleme Raporu

**Tarih:** 27 Eylül 2026
**Kapsam:** `v7.0.7.0` (`a995bde`) — inceleme; `fb33981` — Aşama 0–1; `5c9752e` + çalışma ağacı — Aşama 0.5, K-1, K-3/K-4/K-7, Y-5, K-4 UI, O-4; `4ecf34c`/`b983354`/`85e5172`/`fb5ea7f`/`54552d6`/`ac6ba3f`/O-3/#43/#44 — Aşama 2
**Durum:** 🟢 **Aşama 0, 1, 0.5, 1.5, 2 uygulandı; K-1, K-3, K-4, K-7, Y-5, O-4, O-13, O-14, O-16, O-17, O-20/O-21 ve Y-20 kapatıldı.** 7 kritik bulgunun **6'sı kapandı**, 1'i kısmen. **Veri kaybı sınıfındaki üçlü kapandı**; sömürülebilir tek kritik bulgu (K-1) kapandı ve Android Autofill sınırı CI'da **20** kontrollük statik kapıyla kilitlendi; bütünlük etiketi dosya dışı bir defterle zorunlu kılındı; kilit ekranından tek tıkla kurtarma var; **K-1'in Kotlin derleme borcu gerçek derlemeyle kapandı ve Android lint CI'a bağlandı**; snapshot geri yükleme atomik ve bütçeli; **passkey assertion imzası artık gerçekten doğrulanıyor**; **`revoke` artık gerçekten iptal ediyor** (token döndürme, hâlâ açık oturumları da sonlandırıyor); ve **`index.html` artık bütünlük kapsamında** — `dist/`'de bütünlük garantisi olmayan dosya kalmadı. Toplam **2151 JS + 68 Rust** test yeşil, **8 güvenlik kapısı** PASS. Güncel durum için **§1.2 – §1.6**, **§1.16** – **§1.18** ve **§8** okunmalı.
**Kalan açık iş:** tek kalem operasyonel — Y-19 imzalama sertifikaları (#32). Kodla değil secret yönetimiyle çözülür ve o zamana kadar imzasız yayın bilerek bloke kalır.
**İnceleme Alanı:** Tüm depo — TypeScript/React 19 frontend, Rust/Tauri 2 masaüstü katmanı, Kotlin/Android katmanı, Chrome/Firefox/Safari eklenti katmanı, `wa-sqlite` depolama, CI/CD ve build scriptleri
**Yöntem:** 5 paralel derin inceleme oturumu (kriptografi, depolama, import/sync, React, native/CI) + tüm otomatik kontrollerin çalıştırılması + kritik bulguların manuel doğrulanması

---

## 1. Yönetici Özeti

AegisVault, bir şifre yöneticisi için **ciddi anlamda olgun ve disiplinli** bir codebase. Argon2id, AES-256-GCM, oturum sırlarının sıfırlanması (zeroization), tehdit modeli dokümantasyonu, fuzz testleri, mutasyon testleri (Stryker) ve 12 dilde tam anahtar eşitliğinin hepsi mevcut. Rastgele sayı üretiminde `Math.random()` yedeğine düşme yok, `crypto.subtle.decrypt` etiket doğrulamasını çözme öncesi yapıyor, Rust tarafındaki native messaging kriptografisi (XChaCha20-Poly1305) tam doğru yazılmış, `capabilities/default.json` minimal ve doğru.

Ancak inceleme **ciddi sayıda gerçek ve doğrulanmış kusur** ortaya çıkardı. En önemli yapısal örüntü şu:

> **Güvenlik kontrolleri "best-effort" olarak yazılmış; hata durumlarında sessizce vazgeçiliyor.**

Tipik desen: bir doğrulama başarısız oluyor → `catch` bloğu hatayı yutuyor → fonksiyon `[]` / `false` / `true` döndürüyor → UI "başarılı" diyor. Bu desen hem bir şifre yöneticisi için **veri kaybı** (sessiz eski kopyaya düşme, sessiz boş kasa) hem de **güvenlik baytı** (bütünlük doğrulamasının atlanması) üretiyor.

**İkinci örüntü:** Yayınlanmış UI var, arkasında bağlı kod yok. Otomatik yedekleme ayarları tam çalışır görünüyor ama hiçbir yerden tetiklenmiyor. Kilit ekranında bütünlük uyarı bandı var ama hiçbir production yolu onu geçirmiyor. Passkey "kimlik doğrulama" düğmesi var ama imza hiç doğrulanmıyor.

**Üçüncü örüntü:** CI kendi güvenlik kapılarını çalıştırmıyor. Depoda `security:csp`, `security:session-gates`, `lint`, `gitleaks` scriptleri tanımlı; hiçbiri CI'da çalışmıyor. `security:csp` ve `security:session-gates` şu anda **elle çalıştırıldığında başarısız** durumda.

### Sayısal Özet

| Önem Derecesi | Adet |
|---|---|
| Kritik | 7 |
| Yüksek | 24 |
| Orta | 34 |
| Düşük / Bilgi | 30+ |

### Otomatik Kontrol Sonuçları — İnceleme Anı (Orijinal)

| Kontrol | Sonuç |
|---|---|
| `npm run typecheck` | ✅ Temiz |
| `npm run test:unit` | ✅ 225 dosya / 1860 test geçti (55 sn) |
| `npm run build` | ✅ Başarılı |
| `npm run i18n:audit` | ✅ 12 dil, %100 anahtar eşitliği |
| `npm run security:no-js-master-string` | ✅ Geçti |
| `npm audit --audit-level=high` | ✅ 0 zafiyet |
| **`npm run lint`** | ❌ **1 hata**, 22 uyarı |
| **`npm run security:csp`** | ❌ **3 ihlal** |
| **`npm run security:session-gates`** | ❌ **3 ihlal** |

> **Not:** `security:csp` ve `security:session-gates` başarısız olmasına rağmen CI'da çalıştırılmadıkları için yeşil görünüyor. Bu, tek başına en kolay kapatılabilecek yüksek değerli bir bulgu.

---

## 1.1 Aşama 0–1 Doğrulama Raporu (Güncelleme: 26.09.2026, 17:00)

> **Bu bölüm arşivdir.** Aşama 0–1'in o andaki halini anlatır. Aşama 0.5 sonrası güncel tablo için aşaıdaki **§1.2**'ye bakınız.

Aşama 0 ve Aşama 1 maddeleri 6 commit ile uygulanmış ve doğrulanmıştır:

| Commit | Kapsam |
|---|---|
| `6a594b1` | `fix(security): remediate code-review findings (review phase 0+1)` — 47 dosya, +549/−179 |
| `227f941` | `ci(security): run security gates in CI and block unsigned desktop releases` |
| `fe3630a` | `chore(merge): resolve conflict with main` |
| `76552bb` | `fix(rust): resolve clippy warnings on linux target` |
| `cd5c1f7` | `ci(rust): replace cargo-audit with cargo-deny` |
| `fb33981` | `ci(rust): pin cargo-deny to 0.20.2` |

### Kontrol Sonuçları — Düzeltmelerden Sonra

| Kontrol | İnceleme Anı | Şimdi | Durum |
|---|---|---|---|
| `npm run typecheck` | ✅ | ✅ | ✅ Korundu |
| `npm run test:unit` | ✅ 1860 | ✅ **1861** | ✅ Korundu (+1 test) |
| `npm run build` | ✅ | ✅ | ✅ Korundu |
| `npm run lint` | ❌ 1 hata, 22 uyarı | ✅ **0 hata, 23 uyarı** | ✅ **Düzeldi** |
| `npm run security:csp` | ❌ 3 ihlal | ✅ **PASS** | ✅ **Düzeldi** |
| `npm run security:session-gates` | ❌ 3 ihlal | ✅ **PASS** | ✅ **Düzeldi** |
| `npm run security:no-js-master-string` | ✅ (gevşek taban) | ✅ **PASS (sıkı taban 5→3)** | ✅ **Sıkılaştı** |
| `npm run i18n:audit` | ✅ %100 | ❌ **BLOCKED (2 dil)** | 🔴 **YENİ REGRESYON** |
| `npm audit --audit-level=high` | ✅ 0 | ✅ 0 | ✅ Korundu |

### Doğrulanan Düzeltmeler

| Bulgu | Durum | Kanıt |
|---|---|---|
| **K-7** Otomatik yedekleme ölü kod | ✅ **Çözüldü** | `useVaultLock.ts:26` — `void checkAndTriggerAutoSnapshot('lock')`, `closeVaultSession()`'den **önce**; kullanılmayan import kaldırıldı; `useVaultLock.test.tsx:64` doğruluyor |
| **K-2** Paylaşım bağlantısı HKDF + 4 karakter | ✅ **Çözüldü** | `share.ts:28` min 12 karakter; `deriveArgon2idKey` (32 MiB/3, WASM güvenliği için bilinçli olarak 64 yerine 32 — yorumda gerekçelendirilmiş); `webcrypto.ts` AAD desteği, `s=` parametresi AEAD'e bağlandı; `useShareReceive.ts:91-93` artan deneme gecikmesi (max 30 sn) eklendi |
| **K-3** HMAC hatası yutuluyor → boş kasa | ✅ **KAPANDI** (Aşama 0.5 + §1.4) | `sqlite_opfs.ts` artık `vault-database-integrity-corrupted`'ı yeniden fırlatıyor **ve** `saveToPersistentStorage` doğrulanmamış durumu yeniden imzalayamıyor (`mayReSignState`). Detay: **§1.4** |
| **K-5** `persistVaultDatabase` yazmadan `true` dönüyor | ✅ **Çözüldü** (+ O-23 bonus) | `sqliteOpfsPersistence.ts:180-182` `createWritable` yoksa `throw`; `catch` içinde `writable.abort()` (kilitleme sızıntısı düzeldi); `clearTimeout` `finally`'de; `persistVaultDatabase` yazamazsa `false` döner |
| **K-6** wa-sqlite txn serileştirmesi yok | ✅ **Çözüldü** | `waSqliteEngine.ts:256-262` `enqueue()` promise zinciri; `PRAGMA busy_timeout = 5000` şemaya eklendi. `execute/executeReadOnly/initialize/close` refaktörle serileştirilmiş `*Internal` fonksiyonlara alındı |
| **Y-1** Biometrik kilitlemeyi atlıyor | ✅ **Çözüldü** | `LockScreen.tsx:167-171` kilitleme kontrolü `verifyMasterPassword`'tan **önce**; `:191-194` başarısızlıkta `recordFailedUnlockAttempt()`; otomatik prompt kilitleme sırasında devre dışı; başarıda `clearLockoutState()` |
| **Y-2** Kurtarma modalı state'i temizlemiyor | ✅ **Çözüldü** | `LockScreenRecoveryModal.tsx:66-86` render-phase "adjust state on prop change" deseni — 7 alan sıfırlanıyor, efekt kullanılmıyor (eski secret flash'ı önleniyor) |
| **Y-3** Kurtarma anahtarı döndürülmüyor | ✅ **Çözüldü** | `storage.ts:485,540` — her iki `changeMasterPassword` dalında `disableRecoveryKey()` |
| **Y-6** Arka plan kilidi uygulanmıyor | 🔴 **REGRESYON** | Aşağıdaki yeni bulgu N-1'e bakınız |
| **Y-10** Senkronizasyon aynı gün düzenlemeleri atlıyor | ✅ **Çözüldü** | `sqlite_opfs.ts` 6 noktada `new Date().toISOString().split('T')[0]` → tam ISO-8601 (`updatedAt` **ve** `createdAt`) |
| **Y-17** Yazma boyut sınırı yok | ✅ **Çözüldü** | `src-tauri/src/lib.rs:343-351` — `write_vault_database_file` artık `MAX_VAULT_FILE_BYTES` uyguluyor, okuma/yazma simetrik |
| **Y-21** `onSave` await edilmiyor | ✅ **Çözüldü** | `VaultFormModal.tsx:392-402` `try/await/catch/finally` + `t('vaultForm.saveFailed')`; `ConfirmModal.tsx:103-115` async onConfirm await + `isConfirming` ile çift gönderim guard'ı |
| **Y-23** Kararsız geri çağım → sızan dinleyici | ✅ **Çözüldü** | `useRuntimeSecurity.ts:24-32` `onLockRef`/`onSensitiveStateClearRef`; native dinleme efekti `[]` bağımlılığa indirildi; `disposed` bayrağı ile `.then` yarışı çözüldü (`if (disposed) unlisten()`); görünürlük efekti `[backgroundLockDelayMs, isAutofillMode, unlocked]` |
| **Y-25** Düz metin dışa aktarım zamanlayıcısı | ✅ **Çözüldü** | `useSettingsBackupImport.ts` unmount cleanup eklendi |
| **O-5** Denetim sezgisel skorlama | ✅ **Çözüldü** | `security.ts:290-295` — `fastPasswordScore >= 40` olan her "zayıf değil" hükmü `calculatePasswordScore` (zxcvbn) ile doğrulanıyor. Zayıf yönde (over-report) kalan yarım sezgisel hükümler güvenli yönde |
| **O-32** Chunk yükleme hatası → sonsuz splash | ✅ **Çözüldü** | `main.tsx` — `.catch` + `application.bundle.loadFailed` güvenlik olayı + yeni `ProgressFill` fatal ekranı; `document.getElementById('root')!` yerine kontrollü hata |
| **Aşama 0 #3** CSP inline style | ✅ **Çözüldü** | `ui/ProgressFill.tsx` yeni bileşen; 3 bileşen `style={{width}}` yerine `percent` prop'u kullanıyor |
| **Aşama 0 #4** Oturum kapısı ihlali | ✅ **Çözüldü** | `snapshots.ts` yetkili dosyalar listesine eklendi — şifreli anlık görüntüler için meşru |
| **Aşama 0 #6** CI güvenlik işi | ✅ **Çözüldü** | `ci.yml` yeni `security` işi: lint, dependency audit, CSP, no-js-master-string, session-gates, **fuzz testleri**, gitleaks. `rust-tests` işine `cargo clippy -- -D warnings` + `cargo deny check advisories` |
| **Aşama 1 #22** İmzasız yayın engeli | ✅ **Çözüldü** | `release-desktop.yml` — Windows/macOS/Linux işlerinde `desktop:release:signing:report -- --require-signed` + `desktop:release:gate`, artefakt yüklemesinden **önce** bloke edici adım |
| **Aşama 1 #23** no-js-master-string tabanı | ✅ **Sıkılaştırıldı** | 5 → 3 (`deriveEncryptionKey`), gerçek kullanım sayısına göre |

### Yeni Bulgu — Yüksek Öncelik

> **Durum (Aşama 0.5):** ✅ **KAPANDI.** `useRuntimeSecurity.ts:89` — `backgroundDeadline` artık `number | null`; `null` "bekleyen kilit yok" anlamına geliyor ve `Date.now() >= null`'ın her zaman doğru olması sorunu ortadan kalktı. 3 kalıcı regresyon testi eklendi (`useRuntimeSecurity.test.tsx`), düzeltme geri alınarak testlerin kırıldığı doğrulandı.

#### 🔴 N-1 · Y-6 düzeltmesi, Android autofill sonrası **anında kilitleme** regresyonu getirdi

**Dosya:** `src/hooks/useRuntimeSecurity.ts:82, 91-99, 105-120`

```ts
let backgroundDeadline = 0;                      // ← başlangıç değeri 0

const shieldAndScheduleLock = () => {
  if (isAutofillMode) return;                     // ← autofill'de ERKEN DÖNÜŞ
  ...
  backgroundDeadline = Date.now() + backgroundLockDelayMs;   // ← hiç çalışmıyor
};

const handleVisibilityChange = () => {
  if (document.hidden) { shieldAndScheduleLock(); }
  else {
    const deadlinePassed = Date.now() >= backgroundDeadline;  // ← 0 >= 0 → HER ZAMAN true
    clearLockTimer();
    if (deadlinePassed) { onLockRef.current(); return; }      // ← ANINDA KİLİT
```

**Senaryo (doğrulandı):**

1. `isAutofillMode === true` iken uygulama arka plana geçer (`document.hidden = true`, `visibilitychange` tetiklenir — kodun kendi yorumu bunu açıkça bekliyor: *"the Activity is temporarily re-launched which causes blur/visibility-change events"*).
2. `shieldAndScheduleLock()` `isAutofillMode` nedeniyle **erken dönüyor** → `backgroundDeadline` **0** olarak kalıyor (bunun nedeni kasıtlı: kullanıcı siyah ekran görmesin).
3. Autofill tamamlanır, uygulama öne döner, `isAutofillMode` `false` olur. `isAutofillMode` efektin bağımlılığı olduğu için efekt yeniden çalışır ve `backgroundDeadline` **tekrar 0'a döner**.
4. `visibilitychange` → `deadlinePassed = Date.now() >= 0` → **her zaman `true`** → `onLockRef.current()` → **kasa anında kilitlenir.**

**Etki:** Android'de autofill akışı, uygulama autofill sırasında arka plana geçtiyse **kullanıcıyı autofill tamamlandıktan hemen sonra kilitler.** Hem işlevsel bir regresyon (oturim autofill sonrası ölür) hem de kullanıcıya neden açıklanamayan bir kilitlenme. `isAutofillMode` yalnızca `pendingAutofillRequest` varken true olduğu için bu, **her Android autofill kullanımında** tetiklenir.

**Doğrulama:** Geçici bir regresyon testi yazarak kanıtlandı — `onLock` 1 kez çağrıldı (beklenen: 0). Test geçici dosyadan kaldırıldı, depo temiz bırakıldı.

**Önerilen düzeltme** — `0` bir "silahlanmamış" durum olarak ayırt edilemiyor, nullable kullanılmalı:

```ts
let backgroundDeadline: number | null = null;
...
if (isAutofillMode) return;
backgroundDeadline = Date.now() + backgroundLockDelayMs;
...
const deadlinePassed = backgroundDeadline !== null && Date.now() >= backgroundDeadline;
backgroundDeadline = null;
clearLockTimer();
if (deadlinePassed) { onLockRef.current(); return; }
```

`OnboardingTour`/`useRuntimeSecurity.test.tsx`'e bu senaryoyu kapsayan kalıcı bir regresyon testi eklenmelidir.

### Diğer Yeni Bulgular

> **Durum (Aşama 0.5):** N-1 ✅ kapandı · N-2 ✅ kapandı (kök nedeniyle) · N-3 ✅ kapandı · N-4 ⏸️ operasyonel · N-5 ✅ kapandı · N-6 ✅ kapandı. Ayrıca **iki yeni bulgu açıldı ve kapandı**: N-7 (RustSec, kritik) ve N-8 (fail-open, yüksek) — bkz. **§1.2**.

| # | Önem | Bulgu | Dosya | Durum |
|---|---|---|---|---|
| **N-2** | Yüksek | **`npm run i18n:audit` artık BAŞARISIZ** (BLOCKED, exit≠0). `6a594b1` commit'i `vaultForm.saveFailed` anahtarını `fr.ts` ve `it.ts`'e **çift tırnakla** eklemiş; `scripts/i18n-audit.cjs:20` anahtar regex'i `^\s*'([^']+)'\s*:` yalnızca **tek tırnaklı** anahtarları tanıyor. Sonuç: iki dil "eksik anahtar" olarak raporlanıyor, halbuki anahtarlar mevcut. **Not:** CI'ın `security` işi `i18n:audit`'i çalıştırmıyor, bu yüzden CI kırmızı değil — ama yerel kalite kapısı sessizce bozuldu. **Düzeltme:** `fr.ts:224` ve `it.ts:224` anahtarları tek tırnaka çevirin (dosyanın geri kalanı tek tırnak kullanıyor). | `fr.ts:224`, `it.ts:224` | ✅ **Kapandı** — anahtarlar düzeltildi, **kök neden** (`i18n-audit.cjs` iki tırnak stili de okuyor, kanıtı satırıyla raporluyor) ve **kapı** (CI `security` işine eklendi) kapatıldı |
| **N-3** | Düşük | `ProgressFill` yalnızca `percent`/`className`/`testId` kabul ediyor, ancak `OnboardingTour.tsx:71` **`data-testid="tour-progress-bar"`** geçiriyor. Tireli JSX öznitelikleri TypeScript'in excess-property kontrolünden kaçtığı için `typecheck` bunu yakalamıyor. Sonuç: test kancası sessizce düşüyor (mevcut testler kullanmadığı için kırılmıyor). `testId` olarak düzeltilmeli. | `OnboardingTour.tsx:71`, `ui/ProgressFill.tsx:11` | ✅ **Kapandı** — `testId` düzeltildi; `...rest` önerisi **revize edildi** (bkz. §1.2), prop sözleşmesi `ProgressFill.test.tsx` (4 test) ile sabitlendi |
| **N-4** | Bilgi | Yeni `desktop:release:signing:report -- --require-signed` kapısı, imzalama kimlik bilgileri yapılandırılana kadar **etiket-tetikli yayınları bloke eder**. Commit mesajı bunu açıkça belirtiyor — kasıtlı ve doğru bir trade-off, ancak operasyonel olarak `APPLE_*` ve Windows Authenticode secret'ları pipeline'a eklenene kadar sürüm çıkarılamaz. | `release-desktop.yml` | ⏸️ **Operasyonel** — #32 olarak açık |
| **N-5** | Bilgi | `cargo deny check advisories` çalışıyor ancak depoda `deny.toml` **yok** (varsayılan config ile çalışır). Raporun Aşama 2 önerisindeki `deny.toml` + lisans/ban listesi kısıtlamaları hâlâ açık. `cargo-audit` → `cargo-deny` geçişinin teknik gerekçesi doğru ve commit'lerde belgelenmiş. | `src-tauri/deny.toml` (yok) | ✅ **Kapandı** — `deny.toml` `[graph]/[advisories]/[bans]/[licenses]/[sources]` ile tam; CI `check advisories bans licenses sources` çalıştırıyor. Ayrıca **N-7 açığa çıktı**: kapı tanımlıydı ama fiilen kırmızıydı |
| **N-6** | Bilgi | `PRAGMA journal_mode = WAL` eklenmedi (yalnızca `busy_timeout`). Muhtemelen bilinçli — `IDBMinimalVFS` WAL'i desteklemeyebilir. Kararın gerekçesi kodda belgelenmemiş; ileride birisi eklemeye çalışırsa sessizce başarısız olur. | `waSqliteEngine.ts:100-102` | ✅ **Kapandı** — `waSqliteEngine.ts:100-119`'da gerekçe yazılı: `IDBMinimalVFS` shared memory (`xShmMap`) desteklemediği için WAL **sessizce** mevcut moda düşerdi; eşzamanlılık `busy_timeout` + `enqueue()` ile sağlanıyor |

### Kalan Artık riskler (Aşama 2'ye taşındı — beklenen)

| Bulgu | Kalan |
|---|---|
| **K-3** | ? **KAPANDI** (bkz. §1.4) — `mayReSignState()` kapısı eklendi: yalnızca `trusted` / `needs-reseal` / `unsigned` durumları yeniden imzalanabiliyor. `kdfParams` + `sealedAtVersionCounter` imzalanan girdiye girdi, HKDF etiketi v2 oldu, doğrulama diskten okunan pristine kopya üzerinde yapılıyor, rotasyonda eski anahtarla doğrulanıyor. |
| **K-4** | ? **KAPANDI** (bkz. §1.4) — `unreadable` durumu `unavailable`dan ayrıldı; `decodePersistedVaultPayload` 6 hata sınıfını etiketliyor; `sqlite_opfs` bunu sert başlangıç hatası olarak fırlatıyor; kilit ekranı kaba kuvvet sayacını artırmadan doğru mesajı gösteriyor. |
| **K-7** | ? **KAPANDI** (bkz. §1.4) — `useAutoSnapshotScheduler` `UnlockedApp`e bağlandı: 60 sn yoklama + kilit açılışında anında çalışma + ön plana dönüş (arka plan zamanlayıcıları kısıldığı için). `daily`/`weekly` artık kilitleme beklemiyor. |
| **K-2** | `share.ts:97` yalnızca uzunluk kontrolü yapıyor (≥12). zxcvbn güç skoru uygulanmadı — `"aaaaaaaaaaaa"` geçiyor. |
| **Paylaşım formatı** | Argon2id'ye geçiş **formatı kırdı**: `share.ts:125-129` paketinde sürüm ayırıcısı yok, eski bağlantılar kalıcı olarak çözülemez. Güvenlik açısından kabul edilebilir (eski bağlantılar zaten 4 karakterlik HKDF ile korunuyordu) ama **`CHANGELOG.md` güncellenmedi** (`git log -- CHANGELOG.md` → son dokunuş `1fc51b3`, yani bu dalgadan önce). Kullanıcıya kırık bağlantı olarak bildirilmeli. |
| **Y-11, Y-12, Y-13, Y-15, Y-16, Y-18, Y-19 (kısmi), O-1…O-25** | Aşama 2 kapsamında, beklendiği gibi dokunulmadı. |

### Düzenleme Kalitesi Değerlendirmesi

Uygulama **yüksek kaliteli**. Gözlemlenen güçlü yanlar:

- **Her düzeltme kök nedeni hedefliyor, üstü kapalı değil.** Örnek: Y-23 için sadece bağımlılık dizisi düzeltilmedi, `listen()`'in asenkron doğasından doğan `unlistenFn === null` yarışı da `disposed` bayrağıyla çözüldü.
- **Gerekçeler kodda belgeleniyor.** `K-7`'de neden `lock`'tan önce çağrıldığı, K-2'de neden 64 MiB yerine 32 MiB seçildiği (WASM tahsis sınırı), O-5'te neden hibrit skorlama tercih edildiği — hepsi yorumda.
- **Bonus düzeltmeler:** O-23 (OPFS kilit sızıntısı + `clearTimeout`) K-5 ile birlikte kapatıldı; K-2'ye deneme sayacı eklendi; `Y-2`'de efekt yerine render-phase deseni seçildi (eski secret flash'ını önler).
- **Kapı değişiklikleri meşru.** `security-no-js-master-string` tabanı **gevşetilmedi, sıkılaştırıldı** (5→3). `security-session-gates`'e `snapshots.ts` eklenmesi bir bayt geçişi değil, şifreli anlık görüntülerin meşru `withActiveBackupPassword` kullanımının tanınması.
- **CI takibi iyi:** `cargo-audit` → `cargo-deny` geçişinin teknik gerekçesi (taiki-e install-action uyumsuzluğu, edition 2024 parse hatası) ve sürüm sabitleme sorunu (`0.13.9` panic) commit mesajlarında belgelenmiş.

Zayıf yanlar: Y-6'nın uç durum analizi yapılmadan uygulanmış (N-1), i18n anahtar tırnak tutarlılığı denetlenmemiş (N-2), `ProgressFill` prop sözleşmesi gözden geçirilmemiş (N-3).

---

## 1.2 Aşama 0.5 Doğrulama Raporu (Güncelleme: 26.09.2026, 18:00)

Aşama 0–1'in bıraktığı 9 kalem (**#24–#32**) kapatıldı. Kapanan kalemlerin **6'sı** yalnızca raporun önerdiği düzeltmeyi değil, önerinin **kök nedenini** de kapattı; iki kalemde öneri bilinçli olarak **revize edildi** (gerekçesi aşağıda).

### Kontrol Sonuçları — Aşama 0.5 Sonrası

| Kontrol | Aşama 0–1 Sonrası | Şimdi | Durum |
|---|---|---|---|
| `npm run typecheck` | ✅ | ✅ | ✅ Korundu |
| `npm run test:unit` | ✅ 1861 | ✅ **1869** | ✅ **+8 test** |
| `npm run build` | ✅ | ✅ | ✅ Korundu |
| `npm run lint` | ✅ 0 hata, 23 uyarı | ✅ **0 hata, 23 uyarı** | ✅ Taban korundu |
| `npm run security:csp` | ✅ PASS | ✅ **PASS** | ✅ Korundu |
| `npm run security:session-gates` | ✅ PASS | ✅ **PASS** | ✅ Korundu |
| `npm run security:no-js-master-string` | ✅ PASS | ✅ **PASS** | ✅ Korundu |
| `npm run i18n:audit` | 🔴 BLOCKED (2 dil) | ✅ **PASS (12 dil, 1140 anahtar)** | ✅ **Düzeldi** |
| `npm run test:fuzz` | ✅ | ✅ **37 test** | ✅ Korundu |
| `npm audit --audit-level=high` | ✅ 0 | ✅ **0** | ✅ Korundu |
| `cargo check --all-targets` | ✅ | ✅ | ✅ Korundu |
| `cargo test` | ✅ 19 | ✅ **19** | ✅ Korundu |
| `cargo clippy --all-targets -- -D warnings` | ✅ | ✅ | ✅ Korundu |
| **`cargo deny check`** | 🔴 **YOKTU (FAIL)** | ✅ **PASS (4 kapı)** | ✅ **Düzeldi** |

### Kapatılan Kalemler

| # | Aksiyon | Durum | Kanıt |
|---|---|---|---|
| **24** | **N-1** `backgroundDeadline` → `number \| null` | ✅ **Çözüldü** | `useRuntimeSecurity.ts:89, 107, 125-126` — `null` = "bekleyen kilit yok", `0` = "silahlanmamış" ile karıştırılamıyor artık. `!== null` kontrolü eklenmeden önce `Date.now() >= 0` **her zaman** doğruydu. |
| **25** | `fr.ts` / `it.ts` anahtarları tek tırnaka | ✅ **Çözüldü** | `fr.ts:224`, `it.ts:224` — `vaultForm.saveFailed` |
| **26** | `i18n:audit`'i CI'a ekle | ✅ **Çözüldü** | `ci.yml` `security` işi — "i18n key parity audit (12 locales)" adımı |
| **27** | `OnboardingTour` `data-testid` → `testId` | ✅ **Çözüldü** (+ bonus) | `OnboardingTour.tsx:71`; `ProgressFill` bilinçli olarak `...rest` almıyor (aşağıdaki "Revize Edilen Öneri") ve sözleşmesi `ProgressFill.test.tsx` ile sabitlendi |
| **28** | N-1 kalıcı regresyon testi | ✅ **Çözüldü** | `useRuntimeSecurity.test.tsx` — **3** test. Doğrulandı: düzeltme geri alınınca 2 test kırılıyor. |
| **29** | `CHANGELOG.md` paylaşım formatı notu | ✅ **Çözüldü** | `CHANGELOG.md` — yeni `## 7.0.7.0` bölümü, `### Breaking Changes` altında eski bağlantıların **açılamayacağı** ve alıcıya ne yapması gerektiği açıkça yazılı; süre sonunun yalnızca tavsiye niteliği olduğu da belirtildi |
| **30** | `deny.toml` (lisans/bans + advisory politikası) | ✅ **Çözüldü** (+ CI bağlandı) | `src-tauri/deny.toml` — `[graph] all-features`, `[advisories]`, `[bans]`, `[licenses]` (29 `clarify` girdisi), `[sources]`. CI artık `cargo deny check advisories bans licenses sources` çalıştırıyor. |
| **31** | `journal_mode` kararının gerekçesi | ✅ **Çözüldü** | `waSqliteEngine.ts:100-119` — `IDBMinimalVFS`'in shared memory (`xShmMap`) desteklemediği, WAL'in bu yüzden **sessizce** mevcut moda düşeceği ve eşzamanlılığın bunun yerine `busy_timeout` + `enqueue()` ile sağlandığı yazılı |
| **32** | `APPLE_*` / Windows Authenticode secret'ları | ⏸️ **Operasyonel — bekliyor** | Kodla kapatılamaz. İmza kapısı bu secret'lar eklenene kadar etiket-tetikli yayınları bloke etmeye devam eder (kasıtlı trade-off, N-4). |

### Aşama 0.5'te Kapatılan Yeni Bulgu — 🔴 Kritik (raporda yoktu)

#### 🔴 N-7 · `cargo deny check advisories` **CI'ı kırmızı bırakmış**; CI'daki tek Rust güvenlik kapısı fiilen çalışmıyordu

**Dosya:** `src-tauri/Cargo.lock:2997-2999` (`rustls 0.23.43`), `src-tauri/deny.toml`

`cargo deny check` ilk çalıştırıldığında **advisories, bans, licenses ve sources'ın dördü birden FAIL** verdi:

```
error[vulnerability]: TLS 1.3 handshake messages incorrectly accepted across encryption level boundaries
   ID: RUSTSEC-2026-0285
   rustls v0.23.43  ->  Solution: Upgrade to >= 0.23.45
error[unmaintained]: unic-char-property / unic-char-range / unic-common / unic-ucd-ident / unic-ucd-version
error[rejected]: failed to satisfy license requirements  (MPL-2.0 dahil ~28 crate)
```

**Neden rapora yansımadı:** Rapor Aşama 0–1'i "CI yeşil" diye kaydetmişti (`cd5c1f7` + `5c9752e` yalnızca `RUSTSEC-2024-0370` için `ignore` ekliyordu). Advisory veritabanı sonradan büyüdü ve `rustls` sürümü geride kaldı. `deny.toml`'de yalnızca `[advisories]` bölümü olduğu için **`licenses` ve `sources` politikası hiç tanımlı değildi**; CI da yalnızca `check advisories` çalıştırdığı için bu iki kapı hiçbir zaman fail edemezdi.

**Etki:** CI'ın Rust tarafındaki tek güvenlik kapısı sessizce ölüydü. `RUSTSEC-2026-0285`, `rustls`'in TLS 1.3 el sıkışmasında şifreleme düzeyi sınırını ihlal eden mesajları kabul etmesi — el sıkışma transkripti hâlâ kimlik doğrulanmış olduğu için ağ konumundaki saldırganın el sıkışmayı **değiştirmesini veya tamamlamasını sağlamıyor**, ancak düz metin `EncryptedExtensions` gibi şifrelenmesi gereken mesajlar reddedilmiyor. Bu, güncelleme (updater) ve WebDAV/S3 senkronizasyonu TLS yollarını etkiliyor.

**Düzeltme — istisna değil, yükseltme:**

```diff
- rustls v0.23.43
+ rustls v0.23.45      (cargo update -p rustls)
```

Yeni advisory'ler `ignore` listesine **eklenmedi**; `deny.toml`'ye "RUSTSEC-2026-0285 çıkarsa yükseltin, buraya istisna eklemeyin" notu düşüldü.

**`unic-*` ailesi (5 unmaintained advisory):** `tauri-utils 2.9.3 -> urlpattern 0.3.0 -> unic-ucd-ident 0.9.0` zinciriyle geliyor. `urlpattern 0.6.0` rust-unic'i bırakıyor, ancak `tauri-utils 2.x` `urlpattern = "0.3"` sabitlediği için tek yol Tauri 3 (alpha). Bunlar **unmaintained, zafiyet değil**; çalışma zamanında güvenilmeyen URLPattern girdisi işlenmiyor. Beş advisory, gerekçesi ve yeniden değerlendirme koşuluyla birlikte `ignore` listesine alındı.

**Lisans politikası:** `MPL-2.0` yalnızca Linux `wry` zincirinden (`scraper`/`html5ever` -> `cssparser`, `selectors`, `dtoa-short`, `option-ext`) geliyor — dosya düzeyinde zayıf copyleft, değiştirilmeden kullanılıyor. İzin verildi, gerekçesi yazıldı. `GPL`/`AGPL`/`LGPL` **kasten** izin listesinde yok. 29 `clarify` girdisi, SPDX dışı lisans ifadelerini (`MIT/Apache-2.0`, `Unlicense/MIT`, `Apache-2.0 / MIT` vb.) sürüm sabitle çözümledi.

### Aşama 0.5'te Kapatılan Yeni Bulgu — 🔴 Yüksek (raporda yoktu)

#### 🔴 N-8 · Yok sayılan bir autofill isteği, arka plan otomatik kilidini **süresiz** bastırıyordu (N-1'in ikinci kapısı)

**Dosya:** `src/hooks/useAndroidAutofillCoordinator.ts:96-131` (yeni), `src/lib/androidAutofill.ts:75,303-312`

N-1 kapatıldıktan sonra `isAutofillMode` bu satırda duruyor:

```ts
const shieldAndScheduleLock = () => {
  if (isAutofillMode) return;   // ← kilit hiç silahlanmıyor
  ...
};
```

Bu, kasıtlı ve doğru (Autofill Activity yeniden başlatılırken siyah ekran/kilitlenme olmasın diye). Ama `isAutofillMode` tek kaynağı olan `pendingAutofillRequest`, **olay bazlı** temizleniyordu: `rejectStaleAutofillRequest` yalnızca (a) subscribe geri çağrısında, (b) bildirim efektinde, (c) `approveAutofillRequest` içinde çağrılıyor — hepsi **yeni bir olay** gerektiriyor. `ANDROID_AUTOFILL_REQUEST_MAX_AGE_MS` (5 dk) aşılsa bile, kullanıcı onaylamayı reddeden istek **sınırsız süreyle** state'te kalıyordu.

**Etki:** Kullanıcı bir autofill isteği alır, onaylamaz, uygulamayı arka plana alır. `isAutofillMode` hâlâ `true` → arka plan kilidi hiç silahlanmıyor → kullanıcının "arka planda X saniye sonra kilitle" ayarı **sonsuza kadar** etkisiz. Aşama 1 #20 / N-1'in kapatmayı amaçladığı fail-open, **farklı bir kapıdan** geri geliyordu.

**Düzeltme:** Bekleyen istek artık bir zamanlayıcıyla kendi tazelik penceresi sonunda **süresi dolmuş** olarak temizleniyor. Süre hesaplanamıyorsa gecikme `0`'a düşer (fail-closed), ve reddetme zamanlayıcı üzerinden yapılır ki efekt gövdesinde senkron `setState` oluşmasın (`react-hooks/set-state-in-effect` kapısı).

**Doğrulama:** `useAndroidAutofillCoordinator.test.tsx` — "REGRESSION (N-8): expires an ignored autofill request…" testi eklendi. Düzeltme `git stash` ile geri alınarak **testin gerçekten kırıldığı** doğrulandı.

### Revize Edilen Öneri — #27'de `...rest` yayılımı **yapılmadı**

Raporun önerisi: *"ProgressFill'a `...rest` yayılımı ekleyerek bu tür sessiz düşüşleri kalıcı kılın."* Bu öneri **uygulanmadı, çünkü bu bileşeni düşüne getiren şeyi geri getirirdi.** `ProgressFill` üç bileşenden inline `style` prop'unu kaldırmak için çıkarıldı; `security:csp` kapısı kaynakta yalnızca **literal** `style={` geçişlerini tarayan regex tabanlı. Bir `...rest` yayılımı, çağıranların kapıdan görünmez şekilde `style={{...}}` geçirmesine izin verir — yani kapı, kendi çıkardığı açığı sessizce geri açılır.

Bunun yerine: prop listesi **kapalı** tutuldu, gerekçesi bileşende yazılı, ve tip denetiminin yakalayamayacağı bu sessiz düşüş sınıfı `ProgressFill.test.tsx` (4 test) ile sabitlendi. Test kancalarının gerçekten DOM'a düştüğü doğrulandı.

### Düzenleme Kalitesi Değerlendirmesi — Aşama 0.5

- **Kök neden, tabiî sonuç değil.** #25'te iki tırnak düzeltilmedi; `i18n-audit.cjs`'in **kök nedeni** olan tek tırnaklı anahtar regex'i iki tırnaklı anahtarları da okuyacak ve **kendi satırında** kanıtlayacak şekilde genişletildi (`NON-CANONICAL KEY QUOTING` bulgusu). Aynı hatanın bir daha sessizce geçmesi artık mümkün değil — geçici olarak `tr.ts`'te bir anahtar çift tırnaklı yapılıp kapının yakaladığı doğrulandı.
- **Yükseltme, istisna listesi tercih edildi.** Yeni RustSec advisory'si `deny.toml`'ye eklenmedi, `Cargo.lock` yükseltildi.
- **Kapı yine sıkılaştı.** `cargo deny check advisories` → `check advisories bans licenses sources`: iki politika (`licenses`, `sources`) tanımlandı **ve** uygulanır hale getirildi.
- **Regresyon testleri kanıtlanmış.** N-1 ve N-8 testleri, düzeltmeler `git stash` ile geri alınarak kırılmaları doğrulandı — yalnızca yeşil oldukları görülmedi.
- **Lint tabanı korundu.** Yeni `setTimeout(0)` yaklaşımı, ilk denemede eklenen `react-hooks/set-state-in-effect` uyarısını (23 → 24) önledi; uyarı sayısı tabanda tutuldu.

**Kalan zayıf yan:** #25 ve #27'nin kök nedenleri ancak bu turda kapatıldı; #24 ve #28 daha önce uygulanmıştı. Yani ilk turda "yol haritası bitti" denmişti, oysa dört kalem daha vardı — bir kısmı alttan yukarı (bulgu), bir kısmı yukarıdan aşağıya (kapı) savunmasızdı.

### Kalan Artık Riskler (Aşama 2'ye taşındı — değişmedi)

| Bulgu | Kalan |
|---|---|
| **K-1** (kritik) | ✅ **KAPANDI** — bkz. **§1.3**. `MainActivity` `exported="false"` + `LauncherActivity` trampoline; istekler süreç-geneli registry'den; intent yalnızca 128-bit rastgele id; düz metin şifre yolu silindi; `security:android-autofill-boundary` kapısı CI'da. |
| **K-3** | ? **KAPANDI** (bkz. §1.4) — `mayReSignState()` kapısı eklendi: yalnızca `trusted` / `needs-reseal` / `unsigned` durumları yeniden imzalanabiliyor. `kdfParams` + `sealedAtVersionCounter` imzalanan girdiye girdi, HKDF etiketi v2 oldu, doğrulama diskten okunan pristine kopya üzerinde yapılıyor, rotasyonda eski anahtarla doğrulanıyor. |
| **K-4** | ? **KAPANDI** (bkz. §1.4) — `unreadable` durumu `unavailable`dan ayrıldı; `decodePersistedVaultPayload` 6 hata sınıfını etiketliyor; `sqlite_opfs` bunu sert başlangıç hatası olarak fırlatıyor; kilit ekranı kaba kuvvet sayacını artırmadan doğru mesajı gösteriyor. |
| **K-7** | ? **KAPANDI** (bkz. §1.4) — `useAutoSnapshotScheduler` `UnlockedApp`e bağlandı: 60 sn yoklama + kilit açılışında anında çalışma + ön plana dönüş (arka plan zamanlayıcıları kısıldığı için). `daily`/`weekly` artık kilitleme beklemiyor. |
| **K-2** | `share.ts:97` yalnızca uzunluk kontrolü yapıyor (≥12). zxcvbn güç skoru uygulanmadı — `"aaaaaaaaaaaa"` geçiyor. |
| **#32** | `APPLE_*` / Windows Authenticode secret'ları operasyonel olarak bekliyor. |
| **Y-11, Y-12, Y-13, Y-15, Y-16, Y-18, Y-19 (kısmi), O-1…O-25** | Aşama 2 kapsamında, beklendiği gibi dokunulmadı. |

---

## 1.3 K-1 Kapatma Raporu — Android Autofill Güven Sınırı (Güncelleme: 26.09.2026, 18:30)

Aşama 0.5'in sonundaki "kalan en acil konu" **K-1** kapandı: sömürülebilir tek kritik bulgu. Bu, inceleme boyunca en yüksek etkili düzeltmedir — saldırganın **seçilen kimlik bilgisini kendi `onActivityResult`'ine** alma yeteneğini ortadan kaldırır.

### Saldırı Yüzeyi → Düzeltme Eşlemesi

| # | Saldırı yolu | Kapatma |
|---|---|---|
| 1 | `MainActivity` `exported="true"` → herhangi bir uygulama açık intent gönderebilir | `exported="false"`; LAUNCHER filtresi `LauncherActivity` trampoline'ine taşındı |
| 2 | `EXTRA_AUTOFILL_WEB_DOMAIN` saldırganın seçtiği alan adıyla **phishing UI** gösteriyor | Alan adı artık yalnızca `AssistStructure`'dan, servisin kendi kaydettiği registry girdisinden geliyor |
| 3 | `EXTRA_AUTOFILL_PASSWORD_IDS` ile saldırganın `AutofillId`'leri dolduruluyor | Parcelable okuma tamamen kaldırıldı; `AutofillId` listeleri registry'de |
| 4 | `AndroidAutofillBridge.completePendingRequest` → `setResult(RESULT_OK, FillResponse)` → **kimlik bilgisi saldırgana** | `requestId` registry'de kayıtlı olmalı; kayıtsız istek reddediliyor ve reddediliyor olarak loglanıyor |
| 5 | `EXTRA_AUTOFILL_SAVE_PASSWORD` — düz metin şifre kabul eden canlı kod yolu | **Tamamen silindi** (sabit + fallback dalı); servis yalnızca şifrelenmiş `FileProvider` yükü stajlıyor |
| 6 | Forged `ACTION_AUTOFILL_SAVE` ile **kasa zehirleme** | Kayıt tamamen servis içinde; intent'ten hiçbir değer alınmıyor |
| 7 | `singleTask` + `onNewIntent` ile gerçek isteğin **değiştirilmesi** | Intent yalnızca yönlendirme ipucu; hiçbir istek verisi taşımıyor, değiştirilecek veri yok |
| 8 | `isFresh()` 2 dk + `requestId` tahmin edilebilir (`"android-autofill-$createdAt"`) | Id'ler `UUID.randomUUID()` (128-bit rastgele) |
| 9 | Registry sızıntısı / sınırsız büyüme | `synchronized` + 8 girdilik üst sınır + tazelik bazlı alma |

### Eklenen / Değişen Dosyalar

| Dosya | Değişiklik |
|---|---|
| `security/AutofillRequestRegistry.kt` | **Yeni.** Süreç-geneli, senkronize, sınırlı registry. Yazma tarafı yalnızca `AegisAutofillService`. |
| `security/AutofillSecurityLog.kt` | **Yeni.** Tüm reddi tek log noktasından `AegisAutofill` etiketiyle yazar (cihaz denetimi bu etiketi tarar). |
| `LauncherActivity.kt` | **Yeni.** Tek dışa açık giriş noktası. **Hiçbir extra iletmez.** `noHistory` + `excludeFromRecents`. |
| `AndroidManifest.xml` | `MainActivity` → `exported="false"`, intent-filter kaldırıldı. `LauncherActivity` → `exported="true"` + MAIN/LAUNCHER/LEANBACK. |
| `AegisAutofillService.kt` | Her iki isteği registry'ye yazıyor; intent'e **yalnızca** `EXTRA_REQUEST_ID` + `EXTRA_REQUEST_CREATED_AT` koyuyor; `UUID.randomUUID()`; 14 extra sabiti 2'ye indi. |
| `MainActivity.kt` | `captureAutofillIntent` artık yalnızca id okuyup registry'ye bakıyor; bilinmeyen id reddi; bridge'in geri verdiği nesnenin **ikame edilmesi** engelleniyor. |
| `AndroidAutofillBridge.kt` | `setResult` yolu registry'ye bağlı; kayıtsız istek reddi audit event'i ile loglanıyor. |
| `scripts/security-android-autofill-boundary.cjs` | **Yeni statik kapı — 18 kontrol.** Aşağıda. |
| `package.json`, `ci.yml` | `security:android-autofill-boundary` → CI `security` işi. |

### Yeni Statik Kapı — `security:android-autofill-boundary`

Sadece manifest'i kontrol etmek **yetmezdi**: biri `intent.getStringExtra(EXTRA_..._WEB_DOMAIN)` satırını geri ekleseydi kapı yeşil kalırdı. Bu yüzden kapı Kotlin kaynaklarını da tarar ve **açığı üç yerden birden** kilitler:

1. **Manifest yüzeyi** — `MainActivity` `exported="false"` ve intent-filtersız; `LauncherActivity` dışa açık ve LAUNCHER'lı; başka dışa açık Activity yok; `AegisAutofillService` `BIND_AUTOFILL_SERVICE` iznini koruyor; `android:process` yok (registry bellek içi).
2. **Veri sınırı** — `MainActivity` intent'ten **hiçbir** Autofill extra'sı okumuyor; servisin `putExtra` çağrıları yalnızca yönlendirme metadata'sı; `EXTRA_AUTOFILL_SAVE_PASSWORD` hiçbir yerde yok; registry'ye yalnızca servis yazıyor.
3. **Dayanıklılık** — Sabit taraması yetmediği için kapı **her iki yazımı** de eşliyor: Kotlin sabiti (`EXTRA_AUTOFILL_WEB_DOMAIN`) *ve* tam nitelikli string (`"...extra.AUTOFILL_WEB_DOMAIN"`), sonra `AegisAutofillService`'in kendi sabit tablosundan çözüp aynı isme indirgiyor. `MainActivity` uydurma id üretemiyor. Yorumlar ayrıştırılıp atıldığı için açığı *anlatan* dokümantasyon yanlışlıkla ihlal sayılmıyor.

**Kapının regresyon gücü doğrulandı** — dört ayrı geri getirme denendi, dördü de yakalandı:

| Geri getirilen açık | Yakalandı |
|---|---|
| `MainActivity` → `exported="true"` + LAUNCHER intent-filter | ✅ 3 ihlal |
| `MainActivity` → string literal ile `webDomain` okuması | ✅ 1 ihlal |
| `MainActivity` → `getParcelableArrayListExtra` ile `AutofillId` okuması | ✅ 2 ihlal |
| `MainActivity` → `?: "android-autofill-$now"` ile uydurma id | ✅ 1 ihlal |

### Bilinçli Trade-off'lar

- **Trampoline ekran titremesi.** `LauncherActivity` → `MainActivity` → `finish()` soğuk başlangıçta kısa bir geçiş efekti getirir. `overridePendingTransition(0, 0)` ile bastırıldı. Bunun alternatifi `exported="true"` idi; bir şifre yöneticisi için credential exfiltration'ın önüne geçmez.
- **İmza değişikliği.** Manifest değişikliği APK imzasını değiştirir; `android:release:signing:check` yeniden üretim isteyecektir. Android 12+ zaten `android:exported` beyanı zorunlu kıldığı için build zaten bu satırı okumak zorundaydı.
- **İsteğin tazelik penceresi daraldı.** Kayıt, native tarafta artık 2 dakikalık `AUTOFILL_REQUEST_MAX_AGE_MS` ile sınırlı (JS tarafındaki 5 dakikalık kontrolden daha sıkı). Bu bir sıkılaştırmadır, davranış gerilemesi değildir.
- **Süreç öldüyse istek reddedilir.** Registry bellek içi olduğu için servis ile Activity arasındaki süreç yeniden başlatılırsa istek kaybolur ve kullanıcı fill'ı tekrarlar. Bu kasıtlı **fail-closed** davranıştır; sessiz bir ikame yolunden yeğerdir.

### Doğrulama (K-1 sonrası tam tur)

| Kontrol | Sonuç |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ **0 hata, 23 uyarı** (taban korundu) |
| `npm run test:unit` | ✅ **1869 / 1869** |
| `npm run build` | ✅ |
| `npm run test:fuzz` | ✅ 37 |
| `npm run security:csp` | ✅ PASS |
| `npm run security:session-gates` | ✅ PASS |
| `npm run security:no-js-master-string` | ✅ PASS |
| **`npm run security:android-autofill-boundary`** | ✅ **PASS — 18 kontrol** |
| `npm run i18n:audit` | ✅ PASS (12 dil) |
| `npm audit --audit-level=high` | ✅ 0 |

> **Doğrulama sınırı (dürüstlük notu):** Kotlin **derlemesi bu ortamda çalıştırılamadı** — `:app:compileDebugKotlin` gereken NDK/Gradle bağımlılıklarını indirirken zaman aşımına uğradı. Bu nedenle değişiklikler statik kapı + elle inceleme ile doğrulandı, `kotlinc` ile derlenerek doğrulanmadı. **Yayın öncesi `npm run android:build:apk` ile bir Android derlemesi alınmalıdır.** Bu, raporun kalan tek açık doğrulama borcudur.

---

## 1.4 Veri Kaybı Sınıfı Kapatma Raporu — K-3, K-4, K-7 (Güncelleme: 26.09.2026, 19:10)

K-1'den sonra geriye kalan üç veri kaybı bulgusu kapatıldı. Bunlar üçü de aynı deseni paylaşıyordu: **sistem "emin değil" durumunda "devam et" diyordu.** K-3'te bu "doğrulanmamış durumu imzala", K-4'te "bayat aynaya düş", K-7'de "tetikleyiciyi hiç çağırma" idi.

### K-3 · Yeniden imzalama ("laundering") yarısı — ✅ KAPANDI

Bulgu: bir bütünlük hatası bir kez **okunduğunda** fark ediliyor, sonraki yazma ise o durumu **koşulsuz** yeniden imzalıyordu. Bundan sonra değişiklik meşru bir düzenlemeyle ayırt edilemez hale geliyordu.

**Kapatma — dört parça:**

| # | Parça | Nerede |
|---|---|---|
| 1 | `kdfParams` ve `sealedAtVersionCounter` imzalanan girdiye **eklendi** | `computeCanonicalStateString` |
| 2 | HKDF `info` etiketi **v1 → v2** | `deriveVaultHmacKey` |
| 3 | Yeniden imzalama bir **hüküm kapısından** geçiyor: `mayReSignState()` yalnızca `trusted` / `needs-reseal` / `unsigned` durumlarına izin veriyor | `saveToPersistentStorage` |
| 4 | Doğrulama, **diskten okunan pristine kopya** üzerinde yapılıyor, mutasyon sonrası state üzerinde değil | `loadedStateSnapshot` |

**Bilinçli bir tasarım hatası bulundu ve düzeltildi:** ilk denemede bütünlük değerlendirmesini *canlı* state üzerinde yaptım. Bu, meşru her kaydı "tampered" sayıyordu — 25 test kırıldı. Doğru model, diske yazıldığı andaki state'sin kendisini doğrulamak; bellekteki state'in etiketten *ayrılması* beklenen bir şeydir, çünkü meşru bir değişiklikten sonra tam olarak o olur.

**Kritik ayrıntı — ana şifre rotasyonu:** saklanan state **eski** anahtarla imzalanmıştır. Rotasyonda tek anahtarla doğrulamak her rotasyonu "tampered" sayardı. Çözüm: `saveToPersistentStorage(signingKey, verifyKey)` — imzalama yeni anahtarla, doğrulama eski anahtarla. `changeMasterPassword` ve `changeMasterPasswordWithHash` ikisini de geçiyor.

**K-3, Y-4 ve Y-5'i birlikte kapatıyor:**
- **Y-4:** `kdfParams` artık imzaya giriyor, yani `{"memoryKiB": 8192}` ile zayıflatma artık "temiz" görünmüyor.
- **Y-5 (göç bayrağı atlama):** Okuma yolu eskisiydi: `integrityHmac && !shouldMigrateStaticSalt && !shouldMigrateKdf`. JSON'dan `kdfParams` **ve** `encryption_salt` silinince iki bayrak da `true` olup koşulun tamamı `false` oluyor, doğrulama hiç çalışmıyor, sonra uygulama "yardım için" yeni tuz üretip veritabanını yeniden şifreleyip kaydediyordu. Doğrulama artık **göç bayraklarından önce** yapılıyor; göç artık muafiyet değil.

**Geriye bilinçli bırakılan artık risk:** `integrityHmac` alanını **tamamen boşaltmak** (Y-5'in diğer yarısı) hâlâ mümkün. Kapıyı kapatsaydım `setupMaster`'ı anahtarsız çağıran her yol kırılırdı ve arayüz sözleşmesi bunu opsiyonel yapıyor. Kapatmak, etiketi "ana şifre varsa zorunlu" yapmayı ve dosya dışında bir yüksek su işareti tutmayı gerektiriyor — depolama sözleşmesi değişikliği. Bu **ayrı bir iş** (Y-5, Aşama 2 #33) ve K-3'ün kapsamı dışına sızarak gömülmedi; kodda açıkça "bilinen artık risk" olarak işaretlendi.

### K-4 · Bozuk dosya sessizce bayat aynaya düşüyordu — ✅ KAPANDI

Bulgu: `PersistedLoadResult` yalnızca `unavailable` / `missing` / `empty` / `state` biliyordu. Bozuk JSON, geçersiz UTF-8 veya 25 MB üstü dosya → `unavailable` → `migrateLegacyLocalStorage()` → **bayat IndexedDB aynası yetkili durum yükleniyor** → kullanıcı bir şifre düzenliyor → gerçek kasa eziliyor.

**Kapatma:**

| # | Parça |
|---|---|
| 1 | `{ kind: 'unreadable'; reason; detail }` durumu eklendi — `unavailable`'dan **ayrı** |
| 2 | `decodePersistedVaultPayload()` her hata sınıfını etiketliyor: `too-large`, `invalid-encoding`, `empty`, `invalid-json`, `invalid-shape`, `read-failed` |
| 3 | `MAX_VAULT_PAYLOAD_BYTES` (25 MB) Rust tarafındaki `MAX_VAULT_FILE_BYTES` ile birebir aynı |
| 4 | `sqlite_opfs` `unreadable`'ı **sert başlangıç hatası** olarak fırlatıyor — aynaya düşmüyor |
| 5 | `VaultStorageUnreadableError` tipi + kilit ekranında **kaba kuvvet sayacından ayrı** yüzey |
| 6 | 12 dilde `lock.error.vaultUnreadable` mesajı |

**Kritik UX kararı:** bozuk kasa bir "yanlış parola" değil. Kilit ekranı bu durumda **titremiyor**, deneme sayacını **artırmıyor** ve "tekrar dene" demiyor — mesaj doğrudan "Ayarlar > Anlık Görüntüler'den geri yükle" diyor. `initializeStorage` ayrıca bu hatayı yutmayı reddediyor, çünkü yutulması tam olarak boş kasa üretmekti.

**0 baytlık dosya hâlâ `empty`.** `createWritable` ilk yazmadan önce dosyayı kırpar, yani kesilmiş ilk yazma gerçekten 0 bayt bırakabilir. Bunu bozulma saymak yeni kurulan kasayı kilitlerdi.

### K-7 · `interval` tetikleyicisinin çağıranı yoktu — ✅ KAPANDI

Bulgu: `shouldTriggerAutoSnapshot(settings, 'interval')` ve `checkAndTriggerAutoSnapshot('interval')` vardı, testleri vardı, **production'da tek bir çağıranı yoktu**. `daily` / `weekly` frekansları yalnızca kilitleme anında değerlendirildiği için kullanıcı günlerce kilitlemeden kalırsa **hiç otomatik yedek oluşmuyordu**.

**Kapatma:** `useAutoSnapshotScheduler` hook'u `UnlockedApp`'e bağlandı. Üç uyandırma kaynağı var, çünkü tek başına her birinin bir boşluğu var:

| Kaynak | Kapatığı boşluk |
|---|---|
| 60 sn `setInterval` | Olağan durum |
| Kilit açılışında anında çalıştırma | Uzun süre sonra açılan kullanıcı, ilk tick'i bekleyemeden yedeğini alır |
| `visibilitychange` ile ön plana dönüş | Tarayıcı/WebView arka plandaki zamanlayıcıları kısar veya askıya alır. **Yoksa bir gün boyunca uyuyan dizüstü günlük yedeğini kaçırır** — Y-6/N-1'in aynı kusur sınıfı |

Ayrıca üst üste binen yakalamalar `inFlightRef` ile serileştirildi (eşzamanlı iki yakalama, retention budama ve `lastAutoSnapshotTime` üzerinde yarışırdı).

### Yeni Testler (34 adet, üç bulgu için)

| Dosya | Test | Kapsam |
|---|---|---|
| `vaultDatabaseIntegrity.test.ts` | **13** | Yeniden imzalama reddi (satır silme, `argon_hash` değişimi), rollback, `kdfParams` zayıflatma, `kdfParams`+`encryption_salt` silme atlama, `sealedAtVersionCounter` uyuşmazlığı, legacy `needs-reseal` geçişi, v2→v1 replay engeli, farklı anahtar |
| `sqliteOpfsUnreadable.test.ts` | **14** | Bozuk JSON, geçersiz UTF-8, okuma hatası, 25 MB aşımı, boş-olmayan-ama-çözülemez dosya, 0 bayt `empty` kalıyor, masaüstü yolu, `unavailable` hâlâ gerçek eksiklik için |
| `useAutoSnapshotScheduler.test.tsx` | **7** | Anında çalışma, 60 sn yoklama, kilitliyken hiç çalışmama, kilitlemede durma, ön plana dönüş, unmount cleanup, üst üste binmeme |

### K-3 tasarımında bulunan iki gerçek hata (kendi testlerim yakaladı)

1. **Canlı state üzerinde değerlendirme** → 25 test kırıldı. Yukarıda anlatıldı.
2. **Rotasyonda anahtar uyuşmazlığı** → rotasyon testleri kırıldı. Yukarıda anlatıldı.

Ayrıca rapor önerisinden **bilinçli sapma:** kapı tabanını (`no-js-master-string`, `deriveEncryptionKey` sayısı 11) gevşetmemek için, web yolunda ilk state'i imzalamak amacıyla `storage.ts`'ye **yeni bir ana şifre işleme noktası eklemedim**. Değer marjinaldi (ilk `saveVaultItem` zaten imzalıyor) ve kapının tabanını gevşetmeyi gerektiriyordu. Masaüstü yolunda imzalama bedava (Rust anahtarı zaten döndürüyor), web yolundaki küçük pencere kodda açıkça belgelendi.

### Doğrulama

| Kontrol | Sonuç |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ **0 hata, 23 uyarı** (taban korundu) |
| `npm run test:unit` | ✅ **1903 / 1903** (1869 → 1903, **+34**) |
| `npm run build` | ✅ |
| `npm run test:fuzz` | ✅ 37 |
| `npm run security:csp` | ✅ PASS |
| `npm run security:session-gates` | ✅ PASS |
| `npm run security:no-js-master-string` | ✅ PASS (taban **gevşetilmedi**) |
| `npm run security:android-autofill-boundary` | ✅ PASS (18 kontrol) |
| `npm run i18n:audit` | ✅ PASS (12 dil, **1141** anahtar) |
| `npm audit --audit-level=high` | ✅ 0 |
| `cargo test` | ✅ 19 |

### Kalan Artık Riskler

| Bulgu | Kalan |
|---|---|
| **Y-5** (yüksek) | `integrityHmac` alanını boşaltma varyantı. Kapanması etiketi "ana şifre varsa zorunlu" kılmak + dosya dışı yüksek su işareti gerektiriyor → Aşama 2 #33 |
| **K-4 UI** | Kilit ekranı artık doğru mesajı gösteriyor ve snapshot restore yolunu işaret ediyor, ancak **kilit ekranından tek tıkla geri yükleme** henüz yok; kullanıcı Settings'e yönlendiriliyor → Aşama 2 #47 |
| **O-8, O-16, O-17** | Bütünlük mimarisinin kalan parçaları (snapshot geri yükleme atomikliği, boyut bütçesi, budama bağlantısı) → Aşama 2 #47 |
| **K-1 derleme borcu** | Kotlin derlemesi alınamadı → yayın öncesi `npm run android:build:apk` |

---

## 1.5 Y-5 ve K-4 UI Kapatma Raporu (Güncelleme: 26.09.2026, 19:35)

Aşama 2'nin en yüksek iki kalemi kapatıldı: **Y-5** (bütünlük etiketi boşaltma + dosya dışı yüksek su işareti) ve **K-4'ün kilit ekranı kurtarma yolu**.

### Y-5 · Etiket boşaltma ve rollback — ✅ KAPANDI

Bulgu iki parçaydı ve ikisi de aynı kökten besleniyordu: bütünlük kanıtının **tamamı kasa dosyasının içindeydi**. Dosyaya yazan biri hem etiketi silebiliyor hem de `versionCounter`'ı geri alabiliyordu. "Zayıf" durumun yeniden imzalanabilir olması (K-3) bu ikisini kapatmışti ama kaynak kurutulmamıştı.

**Kapatma — dosya dışı bir bütünlük defteri (`vaultIntegrityLedger`):**

| Defter alanı | Ne kapatıyor |
|---|---|
| `sealed: boolean` | `integrityHmac` alanını **boşaltmak** artık `tampered`. Kapanmadan önce "etiket yok" ile "etiket bilerek silinmiş" aynı durumdu. |
| `highestVersionCounter` | **Uygulama yeniden başlatıldıktan sonra** rollback tespiti. Önceki yüksek su işareti modül durumuydu; her yeniden başlatmada sıfırlanıyordu, yani "eski dosyayı geri koy + yeniden başlat" tam bir atlatmaydı. |

**Tehdit modeli dürüstçe yazıldı:** defter IndexedDB + localStorage'de, kasa dosyasında değil. Bu kriptografik bir ayrım **değil**, bir **konum** ayrımı. Kazanılan şey şu: **kasa veritabanı dosyasını düzenlemek artık tek başına yeterli değil.** Gerçekçi senaryoların — eski yedekten geri gelen dosya, geçmiş veri replay eden bir sync eşi, kısmi yazma, başka bir araçla düzenlenmiş dosya — hiçbiri IndexedDB'ye dokunmuyor.

**Yanlış pozitif koruması:** üç yol defteri bilinçli olarak sıfırlar/düşürür:
- `resetAll()` — kullanıcı kasayı sildiyse, `versionCounter` 1'e dönüyor; defter temizlenmezse yeni kasa **hiçbir zaman kaydedemez** hale gelirdi.
- `lowerVaultSealMark()` — snapshot geri yükleme meşru bir geri gidiş; işaret onu takip etmezse kullanıcı bir kez geri yükleyip bir daha hiçbir şey kaydedemez.
- Bozuk defter **felaket değil**: okunamıyorsa "yok" sayılıyor. Yardımcı bir kaydın bozuk olması yüzünden kasayı açmamak daha kötü bir arıza olurdu.

### K-4 UI · Kilit ekranından tek tıkla geri yükleme — ✅ KAPANDI

Bulgu: bozuk dosyada kilit ekranı doğru mesajı gösteriyordu ama kullanıcıyı Settings'e yönlendiriyordu — yani kasanın **açılmadığı** bir ekrandan, açılmayan kasayı düzeltme isteği.

**Tasarım — mevcut geri yükleme yolu kullanılamıyordu.** `restoreVaultSnapshot` **mevcut kasayı** okuyor (`getVaultItems`) ve açık bir oturum istiyor. İkisi de burada yok: kasa dosyasının bozuk olması, kilit ekranının sıradan geri yükleme afordansını sunamamasının tam nedeni.

**Bunun yerine yeniden kurulum (rebuild):**

1. Seçilen anlık görüntüyü verilen parolayla çöz — bu hem parolanın doğruluğunu kanıtlar hem de düz metin öğeleri verir;
2. okunamayan kasayı sil ve **aynı parolayla** yeniden oluştur (yeni tuz, yeni argon2id hash → kullanıcının parolası çalışmaya devam eder);
3. öğeleri ve ekleri yeni kasaya yaz.

**Güvenlik sırası testle sabitlendi:** yanlış parola, `resetAll` çağrılmasından **önce** reddediliyor. Testi yazarken bunu ayrı bir vaka olarak assert ettim, çünkü tersi bir sıralama sessizce yıkıcı hale gelirdi.

**Yanlış parola bu yolda da kaba kuvvet sayacına tabi.** Snapshot listesi aksi halde bir parola oracle'ı olurdu; panel kendi kilitlemesi yerine paylaşılan kilidi kullanıyor.

**Panel ayrıca:** yıkıcı eylemden önce açık onay ister; snapshot yoksa reset teklif eder; **listeleme hatası** "snapshot yok" gibi gösterilmez (aksi halde kullanıcı gereksiz bir yıkıcı reset'e yönlendirilirdi); ve "en yeni" seçimini kütüphanenin sıralamasına değil **kendine** yapar, çünkü varsayılan seçim yıkıcı bir eylemi tetikliyor.

### Bu turda düzeltilen önceden var olan bir hata

`tr.ts` içinde **depoda önceden** bulunan mojibake: `passkey.create.unsupportedAlgorithm` ve `passkey.create.sessionMissing` dizeleri `?` karakterlerine bozulmuştu — kullanıcıya Türkçe metin yerine `Se?ilen passkey algoritmas?` görünüyordu. `git diff` ile doğrulandı (bu turda eklenen 18 yeni anahtar dışında `tr.ts`'e dokunulmamıştı). İkisi de düzeltildi. Ayrıca zh locale bloğunun ilk yazımında PowerShell'in CJK karakterlerini taşıyamaması nedeniyle oluşan bozulma tespit edilip düzeltildi.

### Yeni Testler (33 adet)

| Dosya | Test | Kapsam |
|---|---|---|
| `vaultIntegrityLedger.test.ts` | **9** | Kayıt, monotonluk, bozuk defter, yabancı `appId`, sayaç normalizasyonu, temizleme, bilinçli düşürme |
| `vaultIntegrityLedgerGate.test.ts` | **8** | Etiket boşaltma (sayaç şişirilmiş haliyle birlikte), restart sonrası rollback, tam sınırda/üstünde kabul, sıfır taban |
| `LockScreenVaultRecovery.test.tsx` | **9** | Listeleme + en yeni seçimi, yeniden kurulum, açık onay, parola zorunluluğu, kilit sayacı, listeleme hatası, iptal |
| `storageVaultRebuild.test.ts` | **7** | **Yıkıcı sıfırlamadan önce parola reddi**, bilinmeyen id, aynı parolayla yeniden kurma, defter temizliği, `finally` ile oturum kapanması, ek yok senaryosu |

### Doğrulama

| Kontrol | Sonuç |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ **0 hata, 23 uyarı** (taban korundu) |
| `npm run test:unit` | ✅ **1936 / 1936** (1903 → 1936, **+33**) |
| `npm run build` | ✅ |
| `npm run test:fuzz` | ✅ 37 |
| `npm run security:csp` | ✅ PASS |
| `npm run security:session-gates` | ✅ PASS |
| `npm run security:no-js-master-string` | ✅ PASS (taban **gevşetilmedi**) |
| `npm run security:android-autofill-boundary` | ✅ PASS (18 kontrol) |
| `npm run i18n:audit` | ✅ PASS (12 dil, **1158** anahtar) |
| `npm audit --audit-level=high` | ✅ 0 |

### Kalan Artık Riskler

| Konu | Kalan |
|---|---|
| **O-8** | `versionCounter` yüksek su işaretinin **cihaz kaybında** ( IndexedDB temizlenir/senkron yedek geri yüklenir) korunması. Konum ayrımı dosya ile defter arasında; iki konumu da kaybetmek ayrı bir saldırı yüzeyi. → Aşama 2 #33 |
| **O-16/O-17** | Anlık görüntü geri yükleme işleminin kendisi hâlâ atomik değil (rebuild yolu bir güvenlik yedeği alıyor ama yarı kalmış bir yazma mümkün). → Aşama 2 #47 |
| **K-1 derleme borcu** | Kotlin derlemesi alınamadı → yayın öncesi `npm run android:build:apk` |

---

## 1.6 O-4 Kapatma Raporu — Passkey İmza Doğrulaması (Güncelleme: 26.09.2026, 20:50)

Sıradaki en yüksek etkili bulgu seçildi: **O-4 — passkey assertion imzası hiç doğrulanmıyordu.** Bunun K-7'den farkı şu: K-7 bir özelliğin çalışmamasıydı, O-4 ise **çalışmayan bir şeyin başarı diye raporlanmasıydı.**

### Yeniden Doğrulama (bulgu teyit edildi)

`authenticateAndIncrementPasskey` (eski hâli) şunu yapıyordu:

```ts
const assertion = await authenticatePasskey({...});
if (assertion.credentialId !== record.credentialId) throw ...;   // tek kontrol
const updatedRecord = incrementPasskeySignCount(record);        // yerel +1
return { assertion, updatedRecord };                             // "başarılı"
```

İmza, `clientDataJSON`, `rpIdHash` — hiçbiri incelenmiyordu. `AuthenticatePasskeyResult` alanları base64 olarak **dolduruluyor ve hiç okunmuyordu**; kayıtta saklanan `publicKey` ise daha sonra hiçbir işe yaramıyordu.

**Etkisi:** UI başarılı bir kriptografik kimlik doğrulama gösteriyor, kasa `signCount` artırıyor ve `lastUsedAt` damgalıyor, ama **hiçbir imza kontrol edilmiyor**. Platformun bu credential id için döndürdüğü her şey kabul ediliyor.

### Kapatma — `passkeyAssertion.ts` (yeni)

Tarayıcıda anlamlı olan WebAuthn Level 3 relying-party adımları:

| # | Kontrol | Reddedilen durum |
|---|---|---|
| 1 | `clientDataJSON.type === 'webauthn.get'` | `webauthn.create` töreni taklidi |
| 2 | `clientDataJSON.challenge` = **bu çağrının** ürettiği challenge | replay / challenge uydurma |
| 3 | `clientDataJSON.origin` = beklenen origin | başka origin'den gelen assertion |
| 4 | `crossOrigin` reddi | iframe kaynaklı assertion |
| 5 | `authenticatorData.rpIdHash` = SHA-256(rpId) | **farklı bir RP için imza** (phishing) |
| 6 | User Present bayrağı | UP'sız assertion |
| 7 | `authenticatorData ‖ SHA-256(clientDataJSON)` imzası, saklanan public key ile | sahte / başka anahtarlı imza |
| 8 | `userHandle` eşleşmesi | farklı kullanıcı |
| 9 | `signCount` ilerlemesi | **klon sinyali** (sayaç geri gidiyor) |

**Bilinçli olarak iddia edilmeyen:** attestation güveni. Kayıt `attestation: 'none'` kullandığı için bir köke zincirlenecek attestation ifadesi yok. Doğrulanan şey "bu assertion, bu credential için özel anahtarın sahibinden geldi" — bir relying party'nin gerçekten ihtiyaç duyduğu budur.

**İki gerçek hata, yazarken testlerim yakaladı:**
1. **DER ayrıştırıcıda kısa formlu uzunluktan sonra `offset` ilerletilmemişti** → *her* ES256 imzası çözülemiyordu. WebAuthn ES256 imzaları ASN.1 DER, WebCrypto ise ham `r‖s` bekliyor; bu dönüşüm yapılmazsa doğru bir doğrulama sessizce başarısız olur — en klasik WebAuthn tuzağı.
2. **`writeRightAligned` hedefi tüm tampon sanıyordu**, kendi slotunu değil → `r` 32 bayt ötelenerek yazılıyordu.

**`signCount` artık yerel `+1` değil**, doğrulanmış authenticator verisinden gelen gerçek sayaç. Yerel artış, gerçek bir relying party sayacı gibi görünürken imzayla hiçbir ilişkisi olmadığı için anlamsızdı.

**Kullanıcıya gösterilen mesaj da ayrıldı:** "imza doğrulaması BAŞARISIZ, hiçbir şey kaydedilmedi, bu işlemi siz başlatmadıysanız devam etmeyin" — genel bir "başarısız" mesajı, kriptografik olarak bir şeylerin ters gittiği tek ayrıntıyı gizliyordu.

### Yeni Testler (32 adet, gerçek kriptografi)

| Dosya | Test | Kapsam |
|---|---|---|
| `passkeyAssertion.test.ts` | **24** | Gerçek ES256/RS256 anahtar çiftleriyle **geçerli** assertion kabulü; imza doğrulaması; farklı anahtar; farklı baytlar; RP ID hash değiştirilmiş; farklı RP; replay; farklı origin; cross-origin; tören tipi; UP bayrağı; kırpılmış veri; sayaç regresyonu; **sıfır sayaçlı çoklu cihaz passkey'leri**; DER dönüşüm kenar durumları; base64url |
| `passkeyAuthentication.test.ts` | **8** | **Uçtan uca**: `navigator.credentials.get` senkronize bir authenticator ile değiştirilir, gerçek imza üretilir |

**Regresyon kanıtı:** O-4 düzeltmesi kaldırıldığında `passkeyAuthentication.test.ts`'in **7 testi kırılıyor**, düzeltme geri gelince 8'i de geçiyor. Yani bu testler O-4'ü gerçekten yakalıyor — sadece yeşil olduklarını görmekle kalmadım.

**Test yazarken düzelttiğim iki kendi hatam:** (a) RP ID testi yanlıştı — RP ID bir *istek* parametresi, asıl saldırı kimlik doğrulayıcının **farklı bir RP için** imza atması; (b) DER uzun-form test fixture'ım `0x81` ile 260 baytlık gövde kodluyordu, ki `0x81` en fazla 255 kodlar.

### Bu turda düzeltilen önceden var olan bir hata

`tr.ts` içinde **depoda önceden** bulunan mojibake (bkz. §1.5) düzeltildi; `zh` locale bloğunun ilk yazımında PowerShell'in CJK karakterlerini taşıyamaması sonucu oluşan bozulma da tespit edilip onarıldı. Her iki durum da yazılan içeriğin gerçekten UTF-8 olduğunu doğrulayan bir geçici denetimle tarandı.

### Doğrulama

| Kontrol | Sonuç |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ **0 hata, 23 uyarı** (taban korundu) |
| `npm run test:unit` | ✅ **1968 / 1968** (1936 → 1968, **+32**) |
| `npm run build` | ✅ |
| `npm run test:fuzz` | ✅ 37 |
| `npm run security:csp` | ✅ PASS |
| `npm run security:session-gates` | ✅ PASS |
| `npm run security:no-js-master-string` | ✅ PASS |
| `npm run security:android-autofill-boundary` | ✅ PASS (18 kontrol) |
| `npm run i18n:audit` | ✅ PASS (12 dil, **1161** anahtar) |
| `npm audit --audit-level=high` | ✅ 0 |

### Kalan Artık Riskler

| Konu | Kalan |
|---|---|
| **Attestation** | `attestation: 'none'` kullandığı için kimlik doğrulayıcının sağlamlığına dair güven kanıtı yok. Bu, WebAuthn'ın normal çalışma biçimi; ama "bu cihaz güvenilir mi" sorusunun cevabını vermiyor. → Aşama 2 #48 genişletmesi |
| **O-8** | Yüksek su işaretinin cihaz kaybında korunması → Aşama 2 #33 |
| **O-16/O-17** | Snapshot geri yükleme atomikliği → Aşama 2 #47 |
| **K-1 derleme borcu** | Kotlin derlemesi alınamadı → yayın öncesi `npm run android:build:apk` |

---

## 1.7 Y-11 Kapatma Raporu - Senkronizasyon Koşulsuz Üstüne Yazma (Güncelleme: 26.09.2026, 21:15)

### Yeniden Doğrulama (bulgu teyit edildi)

Bulgu doğrulandı ve Y-11 bir **veri kaybı sınıfı** kusurdur; yalnızca "risk" değildir.

Somut üst üste binme senaryosu:

1. Cihaz A `vault.aegis` blob'unu başarıyla yükler → **uzak yedek güncel ve sağlam**.
2. Aynı çağrıda `metadata.json` PUT'u başarısız olur (ağ kesintisi, kota, 500).
3. `uploadVault` hata fırlatır ama **blob uzakta durmaya devam eder** (kod sırası: önce blob, sonra meta veri).
4. Sonraki senkronizasyonda `getRemoteMetadata()` meta veri dosyasını okuyamaz ve **eskiden `null` dönüyordu** — yani "uzak yok" ile karışıyordu.
5. `performSync` `remoteMetadata === null` gördüğü için **indirmeyi tamamen atlıyor** ve `uploadVault` ile yerel durumu **koşulsuz** üzerine yazıyor.
6. Sonuç: sağlam uzak yedek yok ediliyor ve kullanıcıya `status: 'success'` bildiriliyordu.

Ek olarak, her iki sağlayıcıda da `PUT` isteği `If-Match` taşımıyordu; yani iki cihazın eşzamanlı yazması sessizce son yazanın kazanmasına bırakılmıştı.

### Kapatma - Sözleşme Düzeltmesi (`syncTypes.ts`)

Asıl hata tiplerdeydi. `getRemoteMetadata(): Promise<SyncMetadata | null>` sözleşmesinde `null` iki farklı anlamı taşıyordu ve bu belirsizlik veri kaybına yol açıyordu. Ayrıştırılmış birleşim tipi getirildi:

| `kind` | Anlamı | Çağıranın yapması gereken |
|---|---|---|
| `absent` | HTTP 404 — gerçekten uzak anlık görüntüsü yok | İlk senkronizasyon, yükleme serbest |
| `unreadable` | Dosya **var** ama okunmuyor/ayrıştırılamıyor | **YÜKLEME YASAK** |
| `ok` | Okundu, `etag` varsa taşındı | `etag`'i yazma önkoşulu olarak kullan |

Yeni hata kodları: `sync.remoteStateUnknown`, `sync.remoteModified`.

### Kapatma - `syncEngine.ts`

- `unreadable` durumunda `performSync` **daha fazla ağ isteği yapmadan** `remoteStateUnknown` hatasıyla dönüyor. Ne `downloadVault` ne `uploadVault` çağrılıyor.
- Yazma, okuma sırasında gözlenen ETag ile koşullu: `provider.uploadVault(blob, meta, { ifMatch: etag })`.
- `SyncResult.uploadedETag` eklendi: **yazma sonrası** okunan ETag (sıradaki senkronizasyonun "hâlâ benim anlık görüntüm mü?" sorusunu yanıtlar). Sağlayıcı ETag veremiyorsa alan `undefined` kalır ve senkronizasyon yine başarılıdır.

### Kapatma - `webdavProvider.ts` / `s3Provider.ts`

- `If-Match` / `if-match` **imzalanan isteğe** ekleniyor.
- 412/409 yanıtı artık `uploadFailed` değil `remoteModified`: yazma reddedildi, hiçbir şey ezilmedi.
- Vault PUT başarısız olduğunda metadata PUT'u **çalıştırılmıyor**.
- Metadata yazma başarısız olduğunda hata mesajı durumu açıkça söylüyor ("remote vault intact but unlabelled") — çünkü bir sonraki senkronizasyon bu haliyle reddedecek ve kullanıcı bunu bilmeli.
- Yeni isteğe bağlı `getVaultETag()` (HEAD).

### Neden "unreadable" sessizce `null` olamaz

Bu, düzeltmenin en önemli kısmı. Sessiz düşüş, veri kaybının sebebiydi. Artık okunamayan durum **hata olarak yüzeye çıkıyor** ve kullanıcı uzak klasörü kontrol edip tekrar deneyebiliyor. Uzaktaki sağlam yedek ise korunuyor.

### Yeni Testler (17 adet, bu bulgu için)

`syncEngine.test.ts` içinde `Y-11 remote overwrite protection` bloğu:

| Test | Kanıtladığı |
|---|---|
| `refuses to upload when remote metadata is unreadable` | **Asıl regresyon.** `uploadVault` **hiç çağrılmıyor** |
| `does not download the remote blob when metadata is unreadable` | Gereksiz/risli indirme de yapılmıyor |
| `uploads on a genuine first sync (remote absent)` | Düzeltme mevcut akışı bozmuyor |
| `replays the observed ETag as a write precondition` | ETag yazmaya taşınıyor |
| `sends no precondition on first sync` | Yeni uzak, yanlışlıkla reddedilmiyor |
| `surfaces a rejected conditional write without reporting success` | 412 `success` sanmıyor |
| `reports the post-upload ETag, not the stale pre-upload one` | Yanlış ETag bildirilmiyor |
| `still succeeds when the provider cannot report an ETag` | ETag yoksa akış kırılmıyor |

`webdavProvider.test.ts` / `s3Provider.test.ts` içinde: 404 → `absent`, bozuk JSON → `unreadable`, `If-Match` gönderimi, 412/409 → `remoteModified` ve metadata PUT'unun atlanması, `Authorization` başlığının korunması, `getVaultETag` davranışı.

### Mutasyon Kanıtı

`webdavProvider.getRemoteMetadata` içindeki `unreadable` dönüşü geçici olarak `absent`'e çevrildiğinde `webdavProvider.test.ts` içindeki `Y-11: reports unreadable, NOT absent, on corrupt JSON` testi **kırıldı**. Düzeltme sonrası geri alındı.

### Bu turda düzeltilen önceden var olan bir hata

`performSync` içinde ilk yazımda `uploadedETag` alanına **yazma öncesi** (bayat) ETag atanıyordu; bu, alanın amacıyla tamamen çelişiyordu. Yazma sonrası `getVaultETag()` okumasına çevrildi ve bunu doğrulayan ayrı bir test eklendi.

### Doğrulama

| Kontrol | Sonuç |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ **0 hata, 23 uyarı** (taban korundu) |
| `npm run test:unit` | ✅ **1985 / 1985** (1968 → 1985, **+17**) |
| `npm run build` | ✅ |
| `npm run test:fuzz` | ✅ 37 |
| `npm run security:csp` | ✅ PASS |
| `npm run security:session-gates` | ✅ PASS |
| `npm run security:no-js-master-string` | ✅ PASS |
| `npm run security:android-autofill-boundary` | ✅ PASS (18 kontrol) |
| `npm run i18n:audit` | ✅ PASS (12 dil, **1161** anahtar) |
| `npm audit --audit-level=high` | ✅ 0 |

### Kalan Artık Riskler

| Konu | Kalan |
|---|---|
| **S3 koşullu yazma** | S3 uyumlu mağazaların hepsi `PutObject`'ta `If-Match`'i zorunlu kılmaz. `(a)` ve `(c)` korumaları bağımsız olarak güvenli tarafı seçtiği için veri kaybı yine engellenir, ancak bazı sağlayıcılarda çakışma tespiti yalnızca bir sonraki turda yakalanır |
| **O-20 / O-21** | İndirme boyut tavanı ve `dispose()` + hava boşluğu izin listesi temizliği → Aşama 2 |
| **İki aşamalı yazma** | Blob ve meta veri iki ayrı istek. Meta veri yazma başarısızsa uzak "intakt ama etiketsiz" kalır. Reddeden davranış doğru, ancak tek işlemde atomik yazma sunucu desteği gerektirir |
| **K-1 derleme borcu** | Kotlin derlemesi alınamadı → yayın öncesi `npm run android:build:apk` |

---

## 1.8 Y-12 Kapatma Raporu - Terfi Sonrası Oturum Anahtarı Yanlış (Güncelleme: 26.09.2026, 21:20)

### Yeniden Doğrulama (bulgu teyit edildi — satır numaraları kaymıştı)

Rapor `storage.ts:565-578` diyordu; K-4/K-7 düzeltmeleri satırları kaydırmış. Gerçek kod `storage.ts:736-744`.

Bulgunun üç iddiası da doğrulandı:

1. `waSqliteVaultStorageRepository.ts:132` — `setupMaster` **marka yeni rastgele bir tuz** üretiyor (`createVaultEncryptionSalt()` → `secureRandomBytes(16)`).
2. `vaultStorageMigration.ts:79-83` — `setupMaster` çağrılıyor, ardından `saveVaultItems(..., masterPasswordPlain)` ile satırlar **yeni** tuzdan türetilen anahtarla yazılıyor.
3. `storage.ts:736-738` — eski `if (existingKey)` dalı, oturumdaki **eski** `Argon2id(credential, oldOpfsSalt)` anahtarını terfi sonrası doğrudan oturuma geri yazıyor.

`if (existingKey)` dalının **her zaman** doğru olduğu da doğrulandı: `migrateActiveVaultStorageToWaSqlite` `withActiveSessionSecrets` içinde çalışıyor, yani aktif oturum zaten var ve anahtarı taşıyor.

### Etki Zinciri (En kötü hali)

Terfi bildirimi gösterildikten hemen sonra masaüstünde ilk `changeMasterPassword`:

- `storage.ts:484` oturumdan `oldVaultKey`'i okuyor → bu **yanlış** anahtar (eski OPFS tuzu).
- `storage.ts:508` → `changeMasterPasswordWithHash(..., oldVaultKey, newVaultKey)`.
- wa-sqlite her satırı `oldVaultKey` ile çözmeye çalışıyor → **ilk satırda** `WA_SQLITE_ROW_DECRYPT_ERROR`.

**Kullanıcı ana şifresini hiç değiştiremiyor** ve her satır okuması bir çözme hatası kaydediyor. `storage.ts:514-521` sonra tutarsız anahtar çiftiyle ek rotasyon deneyerek durumu daha da kötüleştiriyor. Terfi başarılı bildirildiği için kullanıcı bunu kendi hatası sanıyor.

### Kapatma

`storage.ts:733-744` — kısayol tamamen kaldırıldı, terfi sonrası anahtar daima yeni aktif depodan türetiliyor:

```ts
const promotedKey = await getVaultStorageRepository().deriveEncryptionKey(credential);
updateActiveVaultEncryptionKey(promotedKey);
promotedKey.fill(0);
```

**Kısayolun SEC-B3 gerekçesi gerçek değildi.** Yorum, "anahtarı yeniden türetmek ana şifreyi IPC sınırından ikinci kez geçirirdi" diyordu. Oysa `credential` zaten `withActiveSessionSecrets` tarafından bu kapsamda çözülmüş durumdadır ve `else` dalı zaten **tam olarak bu türetmeyi** yapıyordu. Kısayol hiçbir güvenlik kazancı sağlamıyor, yalnızca yanlış anahtar üretiyordu. K-3'teki aynı tür "mevcut durumu yeniden kullanma" sapmasının bir başka örneği.

Türetme hatası artık **sessizce yutulmuyor** — `deriveEncryptionKey` reddederse hata yukarı çıkıyor. Bayat anahtarı koruyup sessizce devam etmek, tam olarak bu hatanın kendisiydi.

### Yeni Testler (5 adet, `storageSession.test.ts`)

`Y-12` bloğunda; oturum anahtarı (`0x11`) ile terfi sonrası türetilen anahtar (`0x5a`) **bilerek farklı** tutuldu, böylece iki yol ayırt edilebiliyor:

| Test | Kanıtladığı |
|---|---|
| `replaces the pre-migration session key with the promoted repository key` | **Asıl regresyon.** Oturum eski anahtarı tutmuyor |
| `derives from the promoted repository even when a session key is already held` | Kısayolun atlardığı `deriveEncryptionKey` çağrısı yapılıyor |
| `does not re-derive when the migration is blocked` | `blocked` durumunda mevcut anahtar **korunuyor** (aşırı düzeltme yok) |
| `propagates a derivation failure instead of silently keeping a stale key` | Türetme hatası yutulmuyor |
| `zeroizes the derived key copy it hands to the session` | `fill(0)` korunuyor, oturum çalışan kopyayı tutuyor |

### Mutasyon Kanıtı

Eski `if (existingKey)` kısayolu geçici olarak geri konduğunda 4 test kırıldı (`replaces...`, `derives from...`, `propagates...`, `zeroizes...`); `does not re-derive when the migration is blocked` doğru şekilde geçti — çünkü o dal `blocked` durumunda zaten hiçbir şey yapmıyor. Düzeltme sonrası geri alındı.

### Doğrulama

| Kontrol | Sonuç |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ **0 hata, 23 uyarı** (taban korundu) |
| `npm run test:unit` | ✅ **1990 / 1990** (1985 → 1990, **+5**) |
| `npm run build` | ✅ |
| `npm run test:fuzz` | ✅ 37 |
| `npm run security:csp` | ✅ PASS |
| `npm run security:session-gates` | ✅ PASS |
| `npm run security:no-js-master-string` | ✅ PASS |
| `npm run security:android-autofill-boundary` | ✅ PASS (18 kontrol) |
| `npm run i18n:audit` | ✅ PASS (12 dil, 1161 anahtar) |
| `npm audit --audit-level=high` | ✅ 0 |

### Kalan Artık Riskler

| Konu | Kalan |
|---|---|
| **O-15** | `ensureOpen`'ta kalıcı olmayan VFS'ye sessiz düşüş — Aşama 2 #39 ile birlikte |
| **Y-14** | `getVaultItems` okuma sırasında 15 günlük çöp temizliği yapıyor ve bu işlem senkronize değil → Aşama 2 |
| **K-1 derleme borcu** | Kotlin derlemesi alınamadı → yayın öncesi `npm run android:build:apk` |

---

## 1.9 Y-13 Kapatma Raporu - Geri Yüklenemeyen Depo Terfi İşaretini Siliyor (Güncelleme: 26.09.2026, 21:35)

### Yeniden Doğrulama (bulgu teyit edildi ve **rapordan ağır**)

Bulgu doğrulandı. Ancak etki zinciri raporda anlatılandan **daha kötü**: işaretin silinmesi tek başına kasa kaybı değil, ondan sonra gelen adım kalıcı kayıp üretiyor.

Zincir (`vaultStorageProvider.ts:101-132`):

1. `restorePersistedActiveVaultStorageBackend()` → `hydrate()` geçici olarak başarısız (WASM/indexedDB 500, `QuotaExceededError`, sekme-restore yarışı).
2. `catch` → **`clearPersistedActiveVaultStorageBackend()`** → `false`.
3. `restoreOrActivateDefaultVaultStorageBackend` `hasLegacyData` kontrolü yapar → terfi yapılmış cihazda OPFS boş olduğu için `false`, `isDesktopRuntime()` de yanlış.
4. **Satır 114'e düşer**: `createActiveWaSqliteRepository` ile **marka yeni boş bir veritabanı** açar, `hydrate()` başarılı olur, `persistWaSqliteDefaultActiveBackend` **işareti yeni bir terfi kaydıyla ezdirir**, aktif depoyu değiştirir.
5. Dönüş: `'activated-wa-sqlite-default'` — **başarı gibi görünen bir durum**.

Sonuç: kullanıcının gerçek verisi eski veritabanında sağlam duruyor ama uygulamada hiçbir yerden erişilemez referansı kalmamış; ekranda boş bir kasa var, hata yok, `console` temiz. Bu, rapordaki "kullanıcının kasası UI'dan kayboluyor"un en kötü hali — kaybolmakla kalmıyor, yerine **sahte bir boş kasa** konuyor.

### Önemli Tespit: `catch`'teki temizleme hiçbir zaman meşru değildi

Düzeltme tasarımı bu gözleme dayanıyor. `restorePersistedActiveVaultStorageBackend`'e ulaştığınızda işaret **zaten** `isPersistedActiveVaultStorageBackend` doğrulamasından geçmiştir. Gerçekten uyumsuz olan işaretler (yanlış sürüm, yanlış VFS adı, desteklenmeyen storage scope) **okuma sırasında** `readPersistedActiveVaultStorageBackend` tarafından zaten siliniyor ve `null` dönüyor.

Yani `catch`'e ulaşan iki hata da geçicidir:

| Hata | Neden geçici |
|---|---|
| `assertWaSqlitePersistenceReadyForActiveBackend` | Yalnızca IndexedDB **şu anda** kullanılamıyorsa atar. İşaret geçerli, ortam bozuk. |
| `hydrate()` | WASM/indexedDB 500, origin kotası dolu, sekme-restore yarışı |

`clearPersistedActiveVaultStorageBackend()` satırının kaldırılması bir temizlik değil, **geri alınamaz bir adımın kaldırılması**dır.

### Kapatma - 1. Sözleşme (`vaultStorageProvider.ts`)

`Promise<boolean>` yerine ayrıştırılmış sonuç:

| Durum | Anlamı |
|---|---|
| `restored` | Depo açıldı ve aktif edildi |
| `absent` | Terfi işareti yok. Yeni bir arka uç kurmak meşru. |
| `unavailable` | İşaret var, veritabanı **şu anda** açılamıyor. Veritabanı sağlam, işaret korunuyor. |

`catch` artık işareti **silmiyor**; `unavailable` dönüyor.

### Kapatma - 2. Fail-closed (`vaultStorageProvider.ts`)

`restoreOrActivateDefaultVaultStorageBackend` artık `unavailable` durumunda **erken dönüyor** ve aktivasyon dalına düşmüyor. Yeni durum: `'wa-sqlite-unavailable'`.

Bu, bulgunun asıl güvenlik adımı — boş yedek kasa üretme yolunu fiziksel olarak kapatıyor.

### Kapatma - 3. Yüzeye çıkarma (`storage.ts` + `App.tsx`)

`initializeStorage` artık `VaultStorageUnavailableError` fırlatıyor ve `App.tsx` bunu yakalayıp **ayrı bir yeniden deneme ekranı** gösteriyor.

Bu adım zorunluydu: `App.tsx:32` hatayı yalnızca `console.error` ile yutup normal kilit ekranını render ediyordu. Bu durumda kullanıcı **başarısız olabilecek bir parola formunun** önünde durur ve depolama hatasını "yanlış şifre" sanar. `isVaultStorageUnreadableError` **kasıtlı olarak** kullanılmadı: K-4'ün anlık görüntü kurtarma akışı yanlış olur — veritabanı bozuk değil, sağlam; doğru eylem "anlık görüntü geri yükle" değil **"tekrar dene"**.

Ayrı bir hata tipi kullanıldı çünkü semantikler ters:
- kasa bozuk **değil**, sağlam;
- doğru eylem "tekrar dene";
- kaba kuvvet sayacı artmamalı, form sarsılmamalı.

12 locale'e 3 yeni anahtar eklendi (`1161 → 1164`, %100 parity korundu).

### Yeni Testler (10 adet)

`vaultStorageProvider.test.ts` (Y-13 bloğu, 4 yeni + 2 yeniden yazılan):

| Test | Kanıtladığı |
|---|---|
| `reports unavailable instead of activating an empty replacement vault` | **Asıl regresyon.** Yedek depo **hiç kurulmuyor**, işaret korunuyor |
| `does not clear the marker when the persisted database is unavailable` | İşaret silinmiyor |
| `PRESERVES the persisted marker when persisted restore hydration fails` | `hydrate()` hatasında koruma |
| `keeps a valid marker readable so a later attempt can retry` | **Kurtarılabilirlik:** ikinci deneme kasayı buluyor |
| `still creates a default wa-sqlite vault for a genuine first run` | Aşırı düzeltme yok — ilk çalıştırma yolu değişmedi |
| `clears invalid persisted active backend markers...` | Uyumsuz işaret **hâlâ** siliniyor (okuyucu, doğru yer) |

`storageSession.test.ts` (3 yeni): `initializeStorage` hatayı fırlatıyor, tip `unreadable` **değil**, mevcut arka uç için fırlatmıyor.

`App.test.tsx` (**yeni dosya**, 4 test): depolama ekranı kilit ekranı yerine geçiyor, "tekrar dene" sayfayı yeniden yüklüyor, alakasız hata bu ekranı **göstermiyor**, temiz başlangıçta göstermiyor.

### Mutasyon Kanıtı

| Mutasyon | Sonuç |
|---|---|
| `catch`'e `clearPersistedActiveVaultStorageBackend()` geri kondu | `vaultStorageProvider.test.ts`'te **4 test kırıldı** |
| `App.tsx`'te ekran `if (false && ...)` ile devre dışı bırakıldı | `App.test.tsx`'te **2 test kırıldı** |

### Bu turda gerçekleşen iki düzeltme

1. **Test varsayımı düzeltildi.** "Profil hazır değil" senaryosu için yazdığım test gerçekte ulaşılamaz bir yoldu (işaret `markWaSqlite...` ile yazıldığı için `activeBackendReady: true` taşıyor). Ulaşılamaz bir senaryoyu test etmek yanıltıcıydı; kaldırılıp yerine kurtarılabilirlik testi kondu.
2. **Mock referans tuzağı.** `deriveEncryptionKey` mock'u üretim kodunun `fill(0)` çağrısını aynı dizi referansında alıyordu; beklenti dizisi sıfırlanıp test yanlışlıkla kırılıyordu. Beklenti, üretim kodunun sıfırladığı diziden bağımsız olarak her seferinde taze üretilecek şekilde düzeltildi.

### Doğrulama

| Kontrol | Sonuç |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ **0 hata, 23 uyarı** (taban korundu) |
| `npm run test:unit` | ✅ **2001 / 2001** (1990 → 2001, **+11**, 235 → 236 dosya) |
| `npm run build` | ✅ |
| `npm run test:fuzz` | ✅ 37 |
| `npm run security:csp` | ✅ PASS |
| `npm run security:session-gates` | ✅ PASS |
| `npm run security:no-js-master-string` | ✅ PASS |
| `npm run security:android-autofill-boundary` | ✅ PASS (18 kontrol) |
| `npm run i18n:audit` | ✅ PASS (12 dil, **1164** anahtar) |
| `npm audit --audit-level=high` | ✅ 0 |

### Kalan Artık Riskler

| Konu | Kalan |
|---|---|
| **O-15** | `ensureOpen`'ta kalıcı olmayan VFS'ye sessiz düşüş — Aşama 2 #39 |
| **Y-14** | `getVaultItems` okuma sırasında 15 günlük çöp temizliği yapıyor ve bu işlem senkronize değil → Aşama 2 |
| **Kilit ekranı entegrasyonu** | Yeni hata `App` seviyesinde yakalanıyor. Kilit ekranı bu hatayı hiç görmüyor (olması da gerekmiyor — kullanıcı oraya ulaşamıyor), ancak `LockScreen`'in `verifyMasterPassword` yolu K-4'ün kurtarma panelini gösteriyor; iki hata tipinin UI'da ayrışması bir regresyon testiyle sabitlendi |
| **K-1 derleme borcu** | Kotlin derlemesi alınamadı → yayın öncesi `npm run android:build:apk` |

---

## 1.10 Y-14 Kapatma Raporu - Okuma Fonksiyonu Geri Alınamaz Çöp Temizliği Yapıyor (Güncelleme: 26.09.2026, 21:45)

### Yeniden Doğrulama (bulgu teyit edildi)

Rapor `storage.ts:607-632, 660-687` diyordu; gerçek kod `storage.ts:819-844` (satırlar K-4/K-7/Y-12/Y-13 düzeltmeleriyle kaydı).

```ts
export async function getVaultItems(): Promise<VaultItem[]> {
  return withSessionVaultKey([], async (vaultKey) => {
    const rawItems = await getVaultStorageRepository().getVaultItemsWithKey!(vaultKey);
    // ...
    if (hasChanges) {
      return getVaultStorageRepository().deletePermanentlyBatchWithKey!(expiredIds, vaultKey);
    }
    return cleanItems;
  });
}
```

Bulgu doğrulandı ve blast radius ölçüldü: **11 çağrı noktası.** Bunların en kötü olanları:

| Çağrı noktası | Kullanıcı ne yapıyordu? |
|---|---|
| `snapshots.ts:97` `createVaultSnapshot` | **Yedek al** → çöp temizleniyor |
| `snapshots.ts:262` `restoreVaultSnapshot` | **Yedek geri yükle** → çöp temizleniyor |
| `useSettingsSync.ts:190` | **WebDAV/S3'e senkronize et** → çöp temizleniyor |
| `useSettingsPasskey.ts:114,150` | **Bir passkey işlemi** → çöp temizleniyor |
| `useSettingsBackupImport.ts` (3 çağrı) | **Yedek içe aktar** → çöp temizleniyor |
| `useSettingsVaultItems.ts`, `useVaultData.ts` | Normal listeleme → çöp temizleniyor |

Yani sadece kasayı açmak değil, **bir yedek almak**, **yedek geri yüklemek**, **uzak sunucuya senkronize olmak** veya **passkey işlemi yapmak** — hepsi çöpdeki verileri geri alınamaz biçimde, onaysız, anlık görüntüsüz ve **günlük kaydı olmadan** siliyordu. "Çöp" kullanıcının silmek istediği ama henüz vazgeçebileceği veridir; 15 günlük pencere bu yüzden var.

Ek olarak tasarım hatası da doğrulandı: fonksiyon "temiz öğeleri getir" anlamında adlandırılmış ama **15 günden eski çöpleri filtreleyip silmek** geri getirme değil, bir çöp yönetimi sorumluluğudur. İki sorumluluk tek bir okuma fonksiyonuna konmuş.

### Kapatma

**1. Okuma saflaştırıldı.** `getVaultItems()` artık yalnızca okur; hiçbir yazma çağrısı yapmaz.

**2. Temizlik ayrı, açık ve günlüklü bir işlem oldu:**

```ts
export async function purgeExpiredTrashItems(): Promise<{ items: VaultItem[]; purgedCount: number }>
```

- `TRASH_RETENTION_DAYS` artık adlandırılmış bir sabit (sihirli `15` değeri dağınıkta değil).
- Her geri alınamaz silme `storage.trashRetention.purged` güvenlik olayı kaydediyor (`warning` seviyesi) — yıkıcı toplu silme artık **asla sessiz değil**.
- `deletedAt` ayrıştırılamıyorsa (`NaN`) o öğe **silinmiyor**; aksi halde karşılaştırma tahmin edilemez biçimde ya siler ya da tutardı.

**3. Tek otomatik çağrı noktası `useVaultData.refreshDatabase`.** Snapshot, senkronizasyon, passkey ve içe aktarma yollarına **hiç dokunulmadı** — bu yollar artık yapısal olarak temizliğe ulaşamaz. Refresh'te temizlik başarısız olursa düz okumaya düşülüyor; çöp zaten süresi dolmuş olduğu için onu kaybetmek, boş bir kasa göstermekten daha güvenli.

### Neden ayrı bir fonksiyon, neden sadece bir çağrı noktası

Alternatif "okuma sırasında temizle ama onay iste" olurdu. Seçilmedi: 11 çağrı noktasından her biri kullanıcı niyetinden bağımsız bir yıkım tetikleyicisi. Temizliği yalnızca kullanıcı kasanın gerçekten açık olduğu, çöpün gerçekten görüntülendiği tek yola bağlamak, hatayı tek bir noktada tutar ve yedekleme/senkronizasyon yollarını kalıcı olarak temiz yollar.

### Yeni Testler (16 adet)

`storageSession.test.ts` — Y-14 bloğu (6 yeni) + 2 mevcut test dönüştürüldü:

| Test | Kanıtladığı |
|---|---|
| `getVaultItems does NOT delete expired trash` | **Asıl regresyon.** Süresi geçmiş çöp okumada duruyor |
| `getVaultItems is a pure read with no write calls at all` | Hiçbir yazma yolu çağrılmıyor |
| `purgeExpiredTrashItems deletes only items past the retention window` | Açık temizlik yalnızca süresi dolmuşları siliyor |
| `purgeExpiredTrashItems writes nothing when nothing has expired` | Gereksiz yazma yok |
| `purgeExpiredTrashItems ignores items with an unparsable deletedAt` | `NaN` karşılaştırması tuzağı kapalı |
| `purgeExpiredTrashItems is a no-op without an active session` | Oturum yoksa hiçbir şey yapılmıyor |
| `treats trash items at the exact retention boundary as expired` | Sınır artık açık temizlikte uygulanıyor |

`snapshots.test.ts` (2 yeni): yedek alma ve otomatik yedek yolları `purgeExpiredTrashItems`'e **ulaşamıyor**.

`useVaultData.test.tsx` (7 yeni + düzeltilmiş varsayılan mock): refresh tam olarak bir kez açıkça temizlik yapıyor, temizlik hatasında düz okumaya düşüyor, temizlenmemiş çöpleri gösteriyor; oturum kapalıyken `saveItem`/`saveItems`/`toggleFavorite` listeyi boşaltmıyor, oturum açıkken boş sonuç meşru olarak uygulanıyor.

### İkinci yarı: Otomatik kilitleme listeyi boşaltıyordu

Rapordaki üçüncü iddia ayrı bir gerçek hata olarak doğrulandı ve kapatıldı. `withSessionVaultKey` oturum kapalıyken `[]` fallback'ini döndürüyor; `saveItem`/`saveItems`/`toggleFavorite` ise sonucu koşulsuz `setItems` ile uyguluyordu. Otomatik kilitleme bir kaydın ortasında tetiklenirse hiçbir şey yazılmıyor ama liste boşalıyor — kullanıcıya "kaydettim, sonra kasa kayboldu" gibi görünüyor.

`applyWriteResult` yardımcısı yalnızca `hasActiveMasterPassword()` doğruysa UI'ye yazıyor. Aşırı düzeltmeye karşı ayrı bir test eklendi: oturum **açıkken** gelen boş sonuç (son öğe silinmiş olabilir) hâlâ uygulanıyor.

### Mutasyon Kanıtı

| Mutasyon | Sonuç |
|---|---|
| `getVaultItems` içine yıkıcı dal geri kondu | `storageSession.test.ts`'te **2 test kırıldı** |
| `applyWriteResult`'ın oturum kontrolü `if (false && …)` yapıldı | `useVaultData.test.tsx`'te **3 test kırıldı** |

**Bir testin güçlendirilmesi gerekti:** İlk yazımda "saf okuma" testi süresi geçmiş çöp içermiyordu, bu yüzden mutasyonu **kaçırıyordu** — hata ayıklarken fark edildi ve süresi geçmiş çöp eklendi. Bu tür testler "yeşil olduğu için yeterli" diye bırakılırsa tam olarak hiçbir şey kanıtlamaz.

### Doğrulama

| Kontrol | Sonuç |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ **0 hata, 23 uyarı** (taban korundu) |
| `npm run test:unit` | ✅ **2015 / 2015** (2001 → 2015, **+14**) |
| `npm run build` | ✅ |
| `npm run test:fuzz` | ✅ 37 |
| `npm run security:csp` | ✅ PASS |
| `npm run security:session-gates` | ✅ PASS |
| `npm run security:no-js-master-string` | ✅ PASS |
| `npm run security:android-autofill-boundary` | ✅ PASS (18 kontrol) |
| `npm run i18n:audit` | ✅ PASS (12 dil, 1164 anahtar) |
| `npm audit --audit-level=high` | ✅ 0 |

### Kalan Artık Riskler

| Konu | Kalan |
|---|---|
| **Çöp işlemleri senkronize değil** | `moveToTrash` / `restoreFromTrash` hâlâ tüm tabloyu okuyup tek satır yazıyor. Aynı satır üzerinde eşzamanlı yazma sessizce son yazanın kazanmasına açık → **Y-15** (sekmeler arası koordinasyon, Aşama 2 #37) || **Kullanıcıya bildirim yok** | Temizlik artık güvenlik olayına kaydediliyor, ancak kullanıcıya bir "N öğe kalıcı olarak silindi" bildirimi gösterilmiyor. Yıkımın denetlenebilir olması önemli ama görünür olması daha iyidir |
| **O-15** | `ensureOpen`'ta kalıcı olmayan VFS'ye sessiz düşüş → Aşama 2 #39 |
| **K-1 derleme borcu** | Kotlin derlemesi alınamadı → yayın öncesi `npm run android:build:apk` |

---

## 1.11 Y-15 Kapatma Raporu - Sekmeler Arası Koordinasyon Yok (Güncelleme: 26.09.2026, 22:00)

### Yeniden Doğrulama

Rapor Y-5/K-3 düzeltmelerinden **önce** yazılmıştı, dört iddiası da tek tek yeniden incelendi:

| İddia | Durum |
|---|---|
| `navigator.locks` / `BroadcastChannel` sıfır kullanım | ✅ Teyit — `src/` taramasında **sıfır** eşleşme |
| `saveToPersistentStorage` tüm blob'u yeniden yazıyor | ✅ Teyit |
| `versionCounter` modül-global (`let lastObservedVersionCounter = 0`) | ✅ Teyit |
| `setLastObservedVersionCounter` **yalnızca** testlerden çağrılıyor | ✅ Teşit edildi, tek üretim çağrısı `resetAll` içinde **sıfırlama** yapıyor |
| Rollback tespiti üretimde ölü kod | ✅ Teyit ve **açıklandı** |

### Neden rollback tespiti ölü koddu (asıl bulgu)

Y-5, `vaultIntegrityLedger` içinde kalıcı bir `highestVersionCounter` eklemişti ve **yazma** yolu bunu kullanıyordu (`readIntegrityExpectations`, `sqlite_opfs.ts:79-85` — ledger ile oturum sayacının maksimumunu alıyor).

**Yükleme** yolu ise yalnızca modül-globaline bakıyordu:

```ts
if (lastObservedVersionCounter > 0 && state.versionCounter < lastObservedVersionCounter) {
```

Taze sayfa yüklemesinde bu değişken `0` olduğu için `> 0` koruması **hiç tetiklenmiyordu**. Yani:

- `vaultRollbackDetected` üretimde hiç set edilmiyordu → `useVaultRollbackAlert` **ölü kod**;
- geri alınmış bir kasanın tek belirtisi, kullanıcının bir sonraki kaydında aldığı açıksız `vault-database-integrity-rolled-backed` hatasıydı.

Mevcut test bunu gizliyordu: `sqliteOpfsModules.test.ts:367` geri alınma testi `setLastObservedVersionCounter(5)` ile çalışıyordu, yani tam olarak üretimde çalışmayan yolu test ediyordu.

### Kapatma 1 — Tespit ve kapı aynı işaret üzerinden konuşuyor

`sqliteOpfsPersistence.ts` içinde `readDurableHighWaterMark()` eklendi; hem kalıcı ledger'ı hem oturum sayacını dikkate alıyor. Artık **tespit** ve **yazma kapısı** aynı yüksek su işaretini kullanıyor — biri diğerinden ayrı düşünülemediği için birinin "rollback yok" demesi diğerini çürütemiyor.

### Kapatma 2 — Kayıp güncelleme için yeni koordinasyon modülü

`src/lib/vaultWriteCoordination.ts` (yeni).

**Tasarım kararı ve gerekçesi:** Raporda önerilen "`navigator.locks` ile her yazma için kilit" tek başına **yeterli değil**. Kilit yazmaların iç içe geçmesini engeller, ama bayt B hâlâ bayt 10'daki bellek kopyasından **tüm blob'u yeniden yazar**. Yani kilit, tazeliği satın almaz. Bu yüzden iki bağımsız parça var:

1. **Serileştirme** — `withVaultWriteLock`: varsa `navigator.locks` (sekmeler arası gerçekten çalışan tek mekanizma), yoksa süreç içi promise zinciri. Süreç içi zincir sekmeler arasında yardımcı olmaz; bu yüzden 2. madde opsiyonel değil.
2. **Tazelik tespiti** — `assertFreshWriteBaseline(baselineVersion)`: kalıcı yüksek su işareti bizim yükleme sürümümüzden yüksekse `VaultWriteConflictError` fırlatır.

Bu ikinci parça veri kaybını **fiilen** engelleyen kısım. Kritik gözlem: başka bir sekmenin meşru yazması **geçerli bir HMAC** üretir, bu yüzden K-3/Y-5 bütünlük kapısı bunu göremez — o kapı eşzamanlılık değil, değiştirilme tespiti içindir. Yalnızca taban karşılaştırması yakalayabilir.

3. **Duyuru** — `announceVaultCommit` / `subscribeVaultCommits`: başarılı commit'ten sonra `BroadcastChannel('aegis-vault')` üzerinden `{versionCounter}`. Yüksek su işaretini yükseltmek ve duyurmak **tek adım** yapıldı; böylece yazmak üzere olan bayt yeni işareti görüp reddedebiliyor.

### Reddedilen yazmanın kullanıcıya ne hissettirdiği

Bu noktada dürüst olmak gerekiyor: `VaultWriteConflictError` şu an **yukarı doğru fırlatılıyor** ve bu bir davranış değişikliğidir — iki sekme açıkken ikinci bir kayıt artık reddedilecek. Bu, sessiz veri kaybından kesinlikle iyidir ama kullanıcıya bu sırada ne olduğunu söyleyen bir UI mesajı henüz yok. Bu, bilinen ve kasıtlı olarak bırakılmış bir boşluk olarak aşağıda kayıtlıdır; yarım çalışan bir yüzey mesajı eklemektense açıkça işaretlemek daha doğru.

Aşırı düzeltmeye karşı korumalar: ledger yoksa ilk yazma serbest; sekme yeniden yüklendikten sonra baseline güncel olduğu için yazma devam eder (`vaultCrossTabLostUpdate.test.ts` bunu sabitler). Aksi halde "sonsuza kadar reddet" kendi başına bir hizmet engeli olurdu.

### Yeni Testler (28 adet, 3 dosya)

`vaultWriteCoordination.test.ts` (**yeni**, 18): taban tazelik kontrolü (eşit, ileri, bayat, ilk yazma, ledger yok, `NaN`/`Infinity`), kilit serileştirme (sıralı yürütme, `navigator.locks` kullanımı, reddedilen önceki yazının zinciri zehirlememesi), commit duyuruları ve zarif düşüş.

`vaultCrossTabLostUpdate.test.ts` (**yeni**, 6): iki bayt senaryosu doğrudan modelleniyor — A 11'e yazıyor, B 10'dan yazmayı deniyor ve **reddediliyor**. Yeniden yüklenen sekmenin devam edebildiği ve makine-okunur hata kodu da sabitlendi.

`sqliteOpfsModules.test.ts` (4): yükleme yolunun **kalıcı ledger** ile rollback tespit ettiği, eşit ve daha yeni sürümleri yanlış alarm üretmediği ve iki işaretten yükseğinin kullanıldığı. `vaultIntegrityLedger` bu dosyada mock'lanmadığı için testler gerçek ledger'ı kullanıyor.

### Mutasyon Kanıtı

| Mutasyon | Sonuç |
|---|---|
| `readDurableHighWaterMark` ledger'ı yok sayıp yalnızca modül-globaline döndü | `sqliteOpfsModules.test.ts`'te **1 test kırıldı** (`Y-15: detects rollback from the durable ledger with no in-session counter`) |

### Bu turda fark edilen bir test tuzağı

Mevcut rollback testi `setLastObservedVersionCounter(5)` çağırıyordu — yani test, **üretimde çalışmayan** yolu doğruluyordu ve yeşildi. Yeni testler bilerek `setLastObservedVersionCounter(0)` ile başlayıp yalnızca kalıcı ledger'a güveniyor. Bu, yeşil bir testin neden tek başına kanıt olmadığının ikinci örneği (§1.10'daki ilk örnekle aynı sınıf).

### Doğrulama

| Kontrol | Sonuç |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ **0 hata, 23 uyarı** (taban korundu) |
| `npm run test:unit` | ✅ **2043 / 2043** (2015 → 2043, **+28**, 236 → 238 dosya) |
| `npm run build` | ✅ |
| `npm run test:fuzz` | ✅ 37 |
| `npm run security:csp` | ✅ PASS |
| `npm run security:session-gates` | ✅ PASS |
| `npm run security:no-js-master-string` | ✅ PASS |
| `npm run security:android-autofill-boundary` | ✅ PASS (18 kontrol) |
| `npm run i18n:audit` | ✅ PASS (12 dil, 1164 anahtar) |
| `npm audit --audit-level=high` | ✅ 0 |

### Kalan Artık Riskler

| Konu | Kalan |
|---|---|
| **Çakışma UI'ı yok** | `VaultWriteConflictError` fırlatılıyor ama kullanıcıya "başka bir sekmede kaydedildi, yenileyin" mesajı gösterilmiyor. Şu an hata `saveItem` çağırısından yükseliyor. Aşama 2 #37 |
| **Yeniden yükleme davranışı yok** | `subscribeVaultCommits` var ama hiçbir UI tüketicisi yok. Başka bir sekmede kayıt olduğunda liste kendiliğinden tazelenmiyor |
| **Çöp işlemleri hâlâ tablo-geneli okuma** | `moveToTrash`/`restoreFromTrash` (Y-14'ün kalan yarısı) tek satır hedefli atomik `setItemFlags` yerine tüm tabloyu okuyor → Aşama 2 #37 |
| **K-1 derleme borcu** | Kotlin derlemesi alınamadı → yayın öncesi `npm run android:build:apk` |

---

## 1.12 Y-15 ve Y-16 Kapatma Raporu (Güncelleme: 26.09.2026, 22:40)

Bu iki bulgu tek oturumda kapatıldı. Y-15'in §1.11'de kalan üç parçası ve Y-16'nın tamamı.

---

### Y-15 Kalan Parça 1 — Çakışma Artık Kullanıcıya Ulaşıyor

§1.11'de dürüstçe kaydedilen boşluk: `VaultWriteConflictError` yukarı fırlatılıyordu ama kullanıcıya hiçbir şey söylenmiyordu.

**`useVaultData`** artık yazmaları `runWrite` sarmalayıcısından geçiriyor. Çakışma `writeConflict` state'i olarak kaydediliyor ve liste **korunuyor** — çünkü depolama katmanının hata için döndürdüğü `[]` fallback'i listeye yazılırsa kullanıcı boş bir kasa görür ve veri kaybı sanar. Diğer hatalar (ör. disk dolu) çakışma sayılmadan yukarı fırlatılıyor.

**`useVaultWriteConflict`** iki kaynağı birleştiriyor: başka sekmeden gelen commit duyurusu ve reddedilen yazma. İkincisi daha güçlü bir sinyal ve kullanıcının kendi eylemiyle tetiklendiği için hemen bildiriliyor.

**`VaultStaleBanner`** (yeni bileşen) kalıcı sinyali taşıyor ve "Şimdi yenile" ile listeyi gerçekten yeniden okuyor.

**Tasarım kararı — bildirim neden bir kez?** Bildirim bir kez gösteriliyor, banner kalıcı. Çünkü kullanıcının ekranda bir süre kalacağı ve her render'da tekrar tekrar toast görmek gürültü. Daha önemlisi: bildirim bayrağı temizleseydi, kullanıcının tam okuması gereken mesaj ekranda hiç görünmezdi. Banner yalnızca **liste gerçekten yeniden okunduğunda** kapanıyor.

**Bu turda bulunan gerçek bir wiring hatası:** İlk yazımda `markStale`, "zaten bayrak kalkmışsa geri dön" kontrolünü `staleSinceRef` üzerinden yapıyordu. `clearStale` çağrıldığında `writeConflict` prop'u hâlâ set olduğu için banner **anında geri geliyordu** — yani `UnlockedApp`'deki kapatma butonu hiç çalışmıyordu. Ref, "hangi sürüm yükseltildi" bilgisini tutacak şekilde değiştirildi: bir sürüm yalnızca bir kez yükseltilir, kapatmak onu geri almaz, yalnızca **daha yeni** bir sürüm tekrar yükseltir.

**Bir testin zayıf olduğu fark edildi:** İlk `clearStale` testi, hook'un statik bir `writeConflict` prop'u ile render edildiği için yukarıdaki hata yüzünden kırıldı — bu yüzden hata ancak test yazarken göründü. Test, "aynı sürüm tekrar yükseltmez / daha yeni sürüm yükseltir" ayrımını açıkça doğruluyor.

### Y-15 Kalan Parça 2 — `moveToTrash` / `restoreFromTrash` hedefli yazıyor

Y-14'ün kalan yarısı. Depo arayüzüne opsiyonel `setItemTrashedWithKey(id, trashed, key)` eklendi.

Eski yol: **tüm kasa** okunuyor, bellekteki bir öğe değiştiriliyor, o öğe geri yazılıyor. İki sorun: tek bayt değişimi için her şeyin çözülmesi, ve yazma kaynağının bir anlık görüntü olması — okuma ile yazma arasında değişen **herhangi bir alan** sessizce geri alınıyordu.

Yeni yol yalnızca hedef satırın `deleted` / `deleted_at` alanlarını yazar. Satır şeması SQLite biçiminde (`deleted: number`, `deleted_at: string | null`) olduğu için buna uyuldu. Arayüz opsiyonel olduğu için uygulamayan depo için geri okuma-değiştir-yaz **fallback olarak korundu**.

### Y-15 Kalan Parça 3 — Otomatik yeniden yükleme tüketicisi

`useVaultWriteConflict` artık `subscribeVaultCommits`'in gerçek tüketicisidir; daha önce hiç tüketicisi yoktu.

### Y-15 Yeni Testler (21 adet)

`useVaultWriteConflict.test.tsx` (**yeni**, 14): çakışmanın kaydedilmesi, listenin boşalmaması, sıradan hatanın çakışma sayılmaması, temizleme, toplu kayıt/favori yolları, commit ile bayrak, sürüm başına tek bildirim, kapatma sonrası geri gelmeme, kilitliyken sessizlik, banner görünürlüğü ve eylemleri.

**Bu test dosyası `subscribeVaultCommits`'in mock'unu değil, gerçek fonksiyonu kullanıyor** — jsdom'da `BroadcastChannel` olmadığı için sahte bir global enjekte edildi. Kısmi mock (`importOriginal`) denendi ama lint tabanını 23→24'e çıkarıyordu; sahte taşıma hem daha iyi bir entegrasyon testi hem de tabanı korudu.

`sqlite_opfs.test.ts` (4): yalnızca hedef satır değişiyor, hedef öğenin diğer alanları korunuyor, geri alma her iki bayrağı da temizliyor, var olmayan öğe için yazma yapılmıyor.

`storageSession.test.ts` (3 + 2 yeniden yazılan): hedefli yolun kullanıldığı, öğenin yeniden yazılmadığı, opsiyonel metot yoksa fallback'in çalıştığı.

**Bir test kaldırıldı:** "kalıcılık başarısız olursa geri al" testini jsdom'da gerçekten yazma hatası üretmeden yazmaya çalıştım. Zorlamak yerine kaldırdım — çalışmayan bir test kanıttan değer çıkarmaz, yalnızca yeşil görünür.

### Y-15 Mutasyon Kanıtı

| Mutasyon | Sonuç |
|---|---|
| `markStale`'deki "sürüm başına bir kez" koruması kaldırıldı | `useVaultWriteConflict.test.tsx`'te **2 test kırıldı** |

---

### Y-16 — IPC'den Gelen Argon2id Parametrelerinde Üst Sınır Yok (DoS)

#### Yeniden Doğrulama

`credential_handler.rs:18-26`:

```rust
let mem = self.memory_kib.unwrap_or(32 * 1024).max(8192);
let time = self.iterations.unwrap_or(3).max(3);
let lanes = self.parallelism.unwrap_or(1).max(1);
let key_len = self.hash_length.unwrap_or(32).max(32);
```

Teyit edildi: **yalnızca taban var, tavan yok.** Bu parametreler webview'dan IPC ile geliyor. `get_params` tüm IPC giriş noktalarının (`derive_argon2id_key`, `create_argon2id_hash`, `rotate_rust_session`) tek darboğazı, dolayısıyla sınırlamak doğru yer.

**Etki:** ele geçirilmiş bir renderer `memoryKiB: 4_000_000_000` isteyebilir; süreç tahsis yaparak abort eder. Masaüstünde bu, tüm uygulamayı düşürür. `iterations: 4_000_000_000` ise pratikte sonsuza dek döner.

#### Kapatma — Taban ve tavan, **reddederek**

| Parametre | Taban | Tavan |
|---|---|---|
| `memoryKiB` | 8 MiB | **1 GiB** |
| `iterations` | 3 | **20** |
| `parallelism` | 1 | **16** |
| `hashLength` | 32 | **64** |

**Neden reddetme, neden sessiz kırpma?** Sessiz kırpma dört milyar iterasyon isteğini yiritize indirip çağırana "başarılı" derdi — çağıran istediğini sandığı halde **başka bir anahtar** elde ederdi. Bu, açık bir hatadan daha sinsi ve ayıklaması daha zor bir hatadır. Uygulamanın kullandığı tüm profiller (32–64 MiB, 3–4 iterasyon) tavanların çok altında, dolayısıyla meşru hiçbir istek reddedilmiyor.

Ayrıca zayıf değerler için eski `.max()` sessiz yükseltmesi de kaldırıldı: çağıran 1 iterasyon isteyip 3 alıyordu, kendi bilgisi olmadan.

#### En Önemli Tespit: `argon2` crate'i bu işi **tek başına yapmıyor`

Mutasyon kanıtı sırasında beklenmedik bir sonuç çıktı: tavan kontrolü devre dışı bırakıldığında `y16_derivation_rejects_before_allocating` testi **hâlâ geçiyordu**. Yani `argon2::Params::new` kendi başına bazı değerleri reddediyor.

Bu "zaten korunuyor" gibi görünebilirdi. Değil. Argon2 **spesifikasyon** sınırlarına karşı doğrulama yapıyor, ve bunlar masaüstü süreci için güvenli bir tahsis sınırından çok uzakta. Bunu teste sabitledim:

```rust
assert!(argon2::Params::new(2_000_000, 3, 1, Some(32)).is_ok());   // ~2 GiB — crate kabul ediyor
assert!(get_params(opts(Some(2_000_000), Some(3), Some(1), Some(32))).is_err()); // biz reddediyoruz
```

~2 GiB istek crate için tamamen meşru ve **denenecekti**. Tehlike, crate'in reddettiği değil, **kabul ettiği** bölgede. `y16_ceiling_covers_the_range_the_argon2_crate_itself_accepts` testi bu gerekçeyi gelecekte birinin tavanı "gereksiz" sanıp kaldırmasına karşı belgeliyor.

#### Y-16 Testleri (11 adet, `cargo test` ile doğrulandı)

Sevk edilen profiller kabul ediliyor; ~4 TB bellek, 4 milyar iterasyon, 4 milyar lane ve 1 milyon bayt çıktı reddediliyor; zayıf değerler sessizce yükseltilmek yerine reddediliyor; sınırların **tam üstündeki** değerler kabul ediliyor, **bir tane fazlası** reddediliyor; uçtan uca türetme sınır dışında tahsis yapmadan başarısız oluyor ve sınır içinde çalışıyor.

### Y-16 Mutasyon Kanıtı

`clamp_or_reject` içindeki tvan kontrolü `if false &&` ile devre dışı bırakıldığında **6 test kırıldı** (`y16_rejects_absurd_memory_requests`, `..._iterations_...`, `..._parallelism`, `..._oversized_output_lengths`, `y16_rejects_values_just_past_the_boundaries`, `y16_rejects_weak_values_instead_of_silently_raising_them`). `y16_derivation_rejects_before_allocating` **geçti** — bu da yukarıdaki tespiti doğruluyor: o test tek başına bulguyu kanıtlamıyordu, diğerleri kanıtlıyor.

### Rust Doğrulaması

| Kontrol | Sonuç |
|---|---|
| `cargo test` | ✅ **30 / 30** (11 yeni) |
| `cargo build` | ✅ |
| `npm run rust:fmt:check` | ✅ (biçimlendirme uygulandı) |
| `npm run rust:test:native` | ✅ |

### Tam Doğrulama

| Kontrol | Sonuç |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ **0 hata, 23 uyarı** (taban korundu) |
| `npm run test:unit` | ✅ **2065 / 2065** (2043 → 2065, **+22**, 238 → 239 dosya) |
| `npm run build` | ✅ |
| `npm run test:fuzz` | ✅ 37 |
| `npm run security:csp` | ✅ PASS |
| `npm run security:session-gates` | ✅ PASS |
| `npm run security:no-js-master-string` | ✅ PASS |
| `npm run security:android-autofill-boundary` | ✅ PASS (18 kontrol) |
| `npm run i18n:audit` | ✅ PASS (12 dil, **1168** anahtar) |
| `npm audit --audit-level=high` | ✅ 0 |

### Kalan Artık Riskler

| Konu | Kalan |
|---|---|
| **JS tarafında tavan yok** | `argon2id.ts:73` yalnızca `Math.max(MIN, …)` kullanıyor. Rust tarafı artık sınırı zorladığı için **IPC üzerinden** kapatıldı, ancak saf WASM yolunda üst sınır hâlâ yok → Aşama 2 #51 (O-6/O-7) |
| **K-1 derleme borcu** | Kotlin derlemesi alınamadı → yayın öncesi `npm run android:build:apk` |
| **Aşama 2 #42** | Rust tarafındaki yerel IPC komutlarına oturum kapısı; Y-16'yı kapatmak komut yüzeyini daraltmadı, yalnızca maliyet parametrelerini sınırladı |

---

## 1.13 Y-18, #42 Kalan ve Y-19 Kapatma Raporu (Güncelleme: 26.09.2026, 23:20)

Üç kalem bu turda kapatıldı. Y-19 için bulgunun bir kısmının **eskimiş** olduğu ortaya çıktı.

---

### Y-18 — Loopback IPC'de Zaman Aşımı ve Sınırsız İş Parçacığı

#### Doğrulama

Teyit edildi: `set_read_timeout` eşleşmesi sıfırdı, `handle_client` içinde `read_exact` kalıcı olarak bloklanıyordu ve `start_tcp_server` bağlantı başına sınırsız `thread::spawn` yapıyordu. Hız sınırlayıcı yalnızca *yeni bağlantı sayısını* sınırlıyordu, **eşzamanlı olarak yaşayan** bağlantı sayısını değil.

#### Kapatma 1 — Soket zaman aşımı

`accept` sonrası hemen `set_read_timeout(30s)` ve `set_write_timeout(15s)` uygulanıyor. Platform bunu reddederse **bağlantı reddediliyor** — sınırsız hizmet vermektense reddetmek doğru seçim.

#### Kapatma 2 — Sınırlı eşzamanlılık

`ConnectionGate` (bağımlılıksız, `Mutex<usize>` tabanlı) eklendi. Tavan **32**.

**Kritik tasarım kararı — bloklamak değil reddetmek.** Semaphore *bekletirse*, tek bir saldırgan tüm accept döngüsünü herkes için kilitler; yani sınırın varlık sebebi olan DoS'un kendisi geri gelir. Bu yüzden `try_acquire` bloklamaz, `None` döner ve bağlantı `SERVER_BUSY` ile reddedilir.

Slot, handler'ın ömrü boyunca yaşar ve `Drop` ile serbest bırakılır — böylece okumada bloklanmış bir handler bile slotunu tutar, ki sınır tam olarak o senaryo içindir. `Drop` sayesinde handler panik verse bile slot sızmaz.

#### Testler (11 adet, `cargo test`)

Kapasiteye kadar izin, dolulukta reddetme (bloklamama), handler dönünce kapasite geri gelmesi, **panikte slot sızıntısı olmaması**, 64 iş parçacığı yarışında tavanın aşılmaması, gerçek sokette zaman aşımının uygulanması, **hiçbir şey göndermeyen bir bağlantının düşürülmesi** (uçtan uca), `SERVER_BUSY` yanıtının `RATE_LIMIT_EXCEEDED`/`OK`/`UNAUTHORIZED`'dan ayrışması, sınır üstündeki değerler.

#### Bu turda düzeltilen **yanlış** bir test

Eşzamanlılık testi ilk yazımda *toplam başarılı edinim* sayısını sınırlıyordu. Bu yanlıştı: slotlar handler'lar bitince geri döndüğü için uzun koşan bir testte kapasitenin çok üstünde başarılı edinim normaldir. Test zamanlamaya bağlı olarak kararsızdı ve **yanlış şeyi** ölçüyordu. Artık zirve eşzamanlılığı ölçülüyor. 5 ardışık `cargo test` ile kararlılığı doğrulandı.

#### Mutasyon Kanıtı

`try_acquire`'daki tavan kontrolü `if false &&` ile devre dışı bırakıldığında **4 test kırıldı**.

---

### #42 Kalan — Yerel IPC Komutlarına Oturum Kapısı

#### Uygulama sırasında keşfedilen gerçek bir kısıt

İlk denemede `read_vault_database`, `write_vault_database` ve `reset_vault_database` komutlarını da kapıya bağladım. **Bu uygulamayı tamamen kırar di.** İşaretlemeden önce çağrı sırasını doğruladım:

`verifyMasterPassword` → `initializeStorage()` → `read_vault_database` (tuz ve Argon2 hash'i okumak için) → **sonra** `open_rust_session` (Rust oturumunun doğduğu yer).

Yani oturumu besleyen okuma, oturumdan **önce** gerçekleşiyor. Bu komutları kapıya bağlamak kilidi hiç açmayan bir uygulama demek. Üçünü de geri aldım ve gerekçeyi kod yorumuna yazdım.

#### Kapatma

Asıl yetki gerektiren komutlar kapıya bağlandı:

| Komut | Neden |
|---|---|
| `sync_extension_credentials` | Kilitli renderer'ın, loopback IPC üzerinden dağıtılacak kimlik bilgisi önbelleğini doldurmasını engeller |
| `clear_extension_credentials` | Simetri: kapıdan kaçış yolu bırakmamak için |
| `rotate_pairing_token` | Kilitli renderer'ın eklenti köprüsü için yeni token üretmesini engeller |

`CredentialSession::require_active_session()` fail-closed'dur: mutex zehirlenirse **reddeder** (uçucu sayım bilinmediği için belirsizlik reddedilmeli), çünkü `panic = "abort"` ile zarif bozulma da yoktur.

**Kasıtlı olarak kapıya bağlanmayanlar:** Argon2id komutları ve varlık bütünlüğü ankası. Bunlar oturum **oluşturmak** için çalışıyor; kapıya bağlansalardı kilit hiç açılamazdı. Bunu engellemek için `y42_argon2id_commands_do_not_require_a_session` testi yazıldı.

#### Testler (6 adet)

Kilitliyken reddetme, credential tutulunca izin, yalnızca vault key tutulunca izin, **kilitleme kapıyı geri alıyor** (aksi halde kontrol tiyatro olur), hata metninin ayrışabilirliği, ve Argon2id komutlarının oturum gerektirmemesi.

#### Mutasyon Kanıtı

`require_active_session` her zaman `Ok` dönecek şekilde değiştirildiğinde **3 test kırıldı**.

---

### Y-19 — Yayın İmzalama

#### Yeniden Doğrulama: Bulgunun Bir Kısmı **Eskimiş**

Rapor, `desktop:release:signing:report` kapısının "hiç çağrılmadığını" iddia ediyordu. **Bu doğru değil.** Kapı üç masaüstü işinde de `--require-signed` ile çağrılıyor (`.github/workflows/release-desktop.yml:99, 176, 245`) ve adı bile "(Y-19)" içeriyor — yani önceki bir oturumda bağlanmış.

Bunu uygulamadan önce doğrulamak, daha sonra raporu düzeltmekten çok daha iyidir.

Raporun kalan iddiaları teyit edildi:

- `APPLE_SIGNING_IDENTITY: "-"` → macOS **ad-hoc** imzalı. Ad-hoc imza `spctl --assess`'ten geçemez, yani kapı doğru şekilde kırmızıydı: iş yayınlanamaz bir derleme üretiyordu.
- Windows'te **hiç** imzalama adımı yoktu (sertifika importu, `signCommand` yok).

Ayrıca raporun kendi **N-4** kaydı bunun kasıtlı bir fail-closed trade-off olduğunu, #32 olarak **operasyonel** (kodla kapatılamaz) saydığını söylüyor. Bu doğru bir konumlandırma: gerçek imzalama sertifika gerektirir, sertifika ise kodla üretilemez.

#### Kapatma — Mekanik yarı

Sertifika gerektiren kısım değiştirilemez, ama **mekanik** yarı kapatılabilir: secret'lar mevcut olduğunda imzalama otomatik gerçekleşsin.

**macOS:** Developer ID sertifikası geçici bir keychain'e import ediliyor (`trap` ile temizleniyor), kimlik `security find-identity` ile çözülüp `GITHUB_ENV`'e yazılıyor, build `APPLE_SIGNING_IDENTITY` ile onu kullanıyor, ardından `notarytool submit` + `stapler staple` + `stapler validate` çalışıyor. Süreç, notarization kimlik bilgileri eksikse `::error::` ile duruyor.

**Windows:** `.pfx` içe aktarılıp **build sonrası** `signtool sign /tr <timestamp> /td sha256 /fd sha256` ile `.exe`/`.msi` imzalanıyor. Zaman damgası, imza sertifika süresi dolarsa da geçerli kalsın diye zorunlu. `.pfx` import sonrası siliniyor.

**Tasarım kararı — fail-closed korundu.** İmzalama adımları `if: ${{ env.<SECRET> != '' }}` ile koşullu. Secret yoksa adım atlanır ve **mevcut `--require-signed` kapısı işi düşürür**. Yani imzasız bir genel yayın hâlâ imkânsız; bu bilinçli olarak değiştirilmedi.

#### Yeni Statik Kapı — `security:release-signing`

`scripts/security-release-signing-gate.cjs` (yeni) + `npm run security:release-signing` + `ci.yml`'a bağlandı.

Mevcut `--require-signed` kapısı **sonucu** doğruluyor. Bu yeni kapı ise **mekaniği** doğruluyor; yoksa silinmiş, derlemeden önce çalışan veya yanlış secret'lara bağlanmış bir imzalama adımı ancak yayın gününde kırmızı çıkardı:

- üç masaüstü işinin de bloklayıcı kapıyı koruması,
- macOS'un ad-hoc'a sabitlenmemiş olması, notarytool + staple,
- Windows'un `Import-PfxCertificate` + `signtool sign` + zaman damgası kullanması,
- **imzalamanın derlemeden sonra** çalışması,
- her imzalama adımının secret'a koşullu olması,
- sertifika/keychain temizliği,
- işin kullandığı **her imzalama secret'ının** dokümante edilmiş olması.

Bu kapı ilk çalıştırmasında **iki gerçek bulgu** verdi: `TAURI_SIGNING_PRIVATE_KEY` dokümante değilmemişti (dokümana eklendi) ve kontrol regex'im yorum satırındaki metne takılıp yanlış alarm üretiyordu (daraltıldı — *ağlayan kapı yok sayılır*).

#### Mutasyon Kanıtı

`APPLE_SIGNING_IDENTITY` yeniden `"-"` yapıldığında kapı doğru şekilde **FAIL** verdi.

---

### Doğrulama

| Kontrol | Sonuç |
|---|---|
| `cargo test --lib` | ✅ **47 / 47** (11 Y-18 + 6 oturum kapısı + 11 Y-16 + 19 mevcut) |
| `cargo build` | ✅ |
| `npm run rust:fmt:check` | ✅ |
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ **0 hata, 23 uyarı** (taban korundu) |
| `npm run test:unit` | ✅ **2065 / 2065** |
| `npm run build` | ✅ |
| `npm run test:fuzz` | ✅ 37 |
| `npm run security:csp` | ✅ PASS |
| `npm run security:session-gates` | ✅ PASS |
| `npm run security:no-js-master-string` | ✅ PASS |
| `npm run security:android-autofill-boundary` | ✅ PASS (18 kontrol) |
| `npm run security:release-signing` | ✅ PASS (**yeni**) |
| `npm run i18n:audit` | ✅ PASS (12 dil, 1168 anahtar) |
| `npm audit --audit-level=high` | ✅ 0 |
| YAML ayrıştırma (3 workflow) | ✅ |

### Kalan Artık Riskler

| Konu | Kalan |
|---|---|
| **Y-19 operasyonel olarak açık** | Gerçek imzalama sertifika gerektirir. `APPLE_*` ve `WINDOWS_SIGNING_*` secret'ları eklenene kadar genel masaüstü yayını **bloke** kalır. Bu kasıtlı ve doğru; #32 olarak operasyonel kalıyor |
| **Windows'ta taşınabilir imzalama** | İlk sürüm Windows Authenticode, sonraki sürümler için de geçerli. Yeniden imzalama (dual-sign) kapsam dışı |
| **`open_import_file` boyut kontrolü** | #42'nin son kalemi hâlâ açık: içe aktarma dosyası boyut sınırı yok |
| **JS tarafında Argon2id tavanı** | Rust tarafı IPC üzerinden zorluyor; saf WASM yolunda üst sınır yok → Aşama 2 #51 |
| **K-1 derleme borcu** | ✅ **Kapandı** — `compileArmDebugKotlin`, `compileUniversalDebugKotlin` ve `lintArmDebug` BUILD SUCCESSFUL; lint artık CI'da (bkz. §1.16) |

---

## 1.14 #42 Kalan, O-20 ve O-21 Kapatma Raporu (Güncelleme: 26.09.2026, 23:55)

---

### #42 Kalan — `open_import_file` Sınırsız Dosya Okuması

`fs::read_to_string(path)` kullanıcı seçtiği dosyanın tamamını belleğe alıyordu; boyut kontrolü yoktu.

**Kapatma.** `read_text_file_bounded` iki bağımsız sınır uygular:

1. `stat` ön kontrolü — bariz büyük dosya ucuz reddedilir.
2. **Akış sınırı** — `Read::take(max + 1)`.

İkincisi şart: `stat` kontrolü tek başına bir TOCTOU deliğidir, çünkü dosya okuma arasında büyüyebilir ya da özel bir dosya küçük uzunluk bildirebilir. Tavan, kasa dosyasıyla aynı (`MAX_IMPORT_FILE_BYTES = MAX_VAULT_FILE_BYTES = 25 MB`), böylece meşru bir yedek her zaman içe aktarılabilir.

#### Bu turda düzeltilen **sahte güvence**

İlk yazımda TOCTOU'yu test etmeyi denedim ve test **mutasyonla kırılmadı**. Nedeni: gerçek bir dosyayla stream sınırı test edilemez, çünkü `stat` ön kontrolü büyük dosyayı zaten reddediyor — stream sınırını kaldırsanız bile tüm dosya testleri yeşil kalıyor. Test bir güvence vermiyordu, sadece yeşildi.

Çözüm: stream sınırı `read_stream_bounded` olarak ayrı bir fonksiyona çıkarıldı ve **sentetik bir okuyucuyla** test edildi — uzunluğunu bildirmeyen ama sınırdan çok fazla veri üreten bir `Read`. Aynı ders: bir test yeşil olduğu için kanıtladığını sanmayın.

#### Testler (7 adet, `cargo test`)

Sınır içi kabul, sınır dışı reddi, **sınırda tam olarak** kabul, geçersiz UTF-8, eksik dosya, limitin kasa limitiyle eşleşmesi, ve sentetik okuyucuyla stream sınırı.

#### Mutasyon Kanıtı

`read_stream_bounded` içindeki sınır `if false &&` ile devre dışı bırakıldı → `stream_bound_refuses_a_reader_that_yields_more_than_the_cap` **kırıldı**.

---

### O-20 — Sınırsız Uzak Senkronizasyon Yükü

`downloadVault()` her iki sağlayıcıda da `res.text()` ile sınırsız okuma yapıyordu. Depodaki her güvenilmeyen girdi yolunun sınırı vardı (`MAX_BACKUP_FILE_SIZE`, `MAX_ANDROID_PAYLOAD_BYTES`, `MAX_ATTACHMENT_SIZE`); uzak partinin kontrolündeki tek yolun yoktu.

**Kapatma.** `readResponseTextBounded` (`MAX_SYNC_PAYLOAD_BYTES = 32 MB`):

- `Content-Length` ön kontrolü,
- **akış sınırı** — `getReader()` ile parça parça okunur, sınır aşılır okuma **hemen** durdurulur ve `reader.cancel()` çağrılır.

Yine `Content-Length` kontrolü tek başına yeterli değil: **başlık saldırgan tarafından kontrol ediliyor.** Testler bunu açıkça doğruluyor — "beyan edilen uzunluk yalan söylüyor" senaryosu stream sınırı olmadan geçer.

Chunk birleştirme de doğru yapıldı: parça başına ayrı `TextDecoder` kullanılsa sınırı geçen çok baytlı karakterler bozulurdu; test bunu sabitliyor.

---

### O-21 — Uzak Metadata Doğrulaması Yok (veri kaybı)

Bu, rapordaki en keskin bulguydu ve **Y-11'in üzerine oturuyor**:

- `updatedAt` ayrıştırılamazsa `NaN` olur,
- `NaN > x` her zaman `false`'tur,
- `performSync` "uzak daha yeni değil" sonucuna varır, **indirmeyi atlar**,
- ve yerel kasayı uzakkinin üzerine yazar.

Yani **~60 baytlık** bir `metadata.json` ile sağlam bir uzak yedek yıkıcı biçimde ezilebiliyordu. `deviceId`, `vaultVersion`, `checksum`, `itemCount` hiç doğrulanmıyordu.

**Kapatma — iki katmanlı savunma.**

1. `validateRemoteSyncMetadata` her iki sağlayıcıda çağrılıyor; başarısız olursa sonuç `unreadable` (Y-11'in "yazma" yasağına düşüyor).
2. **Aynı doğrulama `syncEngine` içinde de yapılıyor.**

İkinci katman bir testin sonucuyla eklendi: motor testi, sağlayıcıyı atlayıp doğrulanmamış `ok` metadata verdiğinde `uploadVault`'un çağrıldığını gösterdi. Gerekçe doğru: **`NaN`'ın oluştuğu ve yıkıcı kararın verildiği yer motordur.** Değişmez orada tutulmalı, çağıranlara bırakılmamalı.

`checksum` artık 64 haneli hex olarak doğrulanıyor (bütünlük doğrulamasını besleyen alan) ve `itemCount` non-negative integer olmalı — ileride karşılaştırma yapılsa bile string beslenmesin.

#### Mutasyon Kanıtı

| Mutasyon | Sonuç |
|---|---|
| Motordaki doğrulama devre dışı | `O-21: refuses to overwrite a remote whose metadata timestamp is unparsable` **kırıldı** |
| Stream sınırı devre dışı | **2 test kırıldı** — "beyan edilen uzunluk yalan söylüyor" ve "uzunluk bildirmiyor" |

---

### O-21 (ikinci yarı) — Hava Boşluğu İzin Listesi Sızıntısı

`dispose()` **mevcuttu ve doğruydu** — ama hiçbir yerde çağrılmıyordu. Somut sızıntı:

`handleSyncTest` ("Test connection" düğmesi) bir sağlayıcı kuruyor — kurucu origin'i izin listesine ekliyor — ve **asla dispose etmiyordu**. `handleSyncNow` da aynı şekilde.

Kullanıcı 20 farklı sunucuya "bağlantıyı test et" dediğinde **20 kalıcı ağ muafiyeti** birikiyordu ve senkronizasyon yapılandırması silinse bile geri alınmıyordu. `syncAllowedOrigins` bir `Set` olduğu için çıplak add/remove "hâlâ kullanımda" ile "eklenip hiç geri alınmadık" ayrımını yapamıyor.

**Kapatma — referans sayımı.** `acquireSyncOriginLease(origin)` bir lease alır ve **idempotent** bir serbest bırakma döndürür. İzin listesi yalnızca son lease bırakıldığında temizlenir. İki sağlayıcı ve `useSettingsSync`'in üç yolu buna bağlandı (`finally` bloklarında, başarı/hata/erken-dönüş yollarının hepsinde).

İdempotenslik şart: çift `dispose()` başka bir canlı sağlayıcının muafiyetini sessizce kesmemeli.

#### Testler (16 adet)

Lease'ın whitelist'e eklemesi, son lease bırakılınca geri alması, **eşzamanlı lease'lar birbirini iptal etmemesi**, tekrar serbest bırakmanın yok sayılması, origin normalizasyonu, bozuk origin, şema denetiminin lease yolundan da geçerli olması, tekrar eden döngülerde birikme olmaması ve **"20 farklı test hedefi kalıcı olarak whitelist'te kalmaz"** uçtan uca senaryosu.

`useSettingsSync.test.tsx`'e 4 test: başarılı test, **başarısız** test, "Sync now" ve senkronizasyon hatası — hepsi dispose'un çağrıldığını doğruluyor. Başarısız testin ayrıca eklenmesi önemli: sızıntı en kolay hatada gözden kaçar.

#### Mutasyon Kanıtı

`acquireSyncOriginLease` içindeki "son lease mı?" kontrolü `|| true` ile devre dışı bırakıldı → **6 test kırıldı**.

---

### Doğrulama

| Kontrol | Sonuç |
|---|---|
| `cargo test --lib` | ✅ **57 / 57** |
| `cargo fmt --check` | ✅ |
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ **0 hata, 23 uyarı** (taban korundu) |
| `npm run test:unit` | ✅ **2100 / 2100** (2065 → 2100, **+35**, 239 → 241 dosya) |
| `npm run build` | ✅ |
| `npm run test:fuzz` | ✅ 37 |
| 7 güvenlik kapısı | ✅ hepsi PASS |
| `npm audit --audit-level=high` | ✅ 0 |

---

## 1.15 O-6/O-7 ve O-8 Çalışma Raporu (Güncelleme: 27.09.2026, 00:10)

---

### O-6/O-7 — Argon2id Üst Sınırları (JS tarafı)

Y-16'da Rust IPC sınırına taban **ve** tavan konmuştu; JS/WASM yolunda yalnızca taban vardı. Yani bir ithal yedekten veya hazırlanmış bir kasa dosyasından gelen KDF parametreleri sınırsız bellek veya iterasyon isteyebiliyordu.

**Kapatma.** `argon2id.ts` artık aynı tavanları kullanıyor ve **reddediyor**. Reddetme, Rust tarafıyla aynı gerekçeyle: dört milyar iterasyon isteğini sessizce yiritize indirip "başarılı" demek, çağırana istediği parametrelerle değil başkasıyla türetilmiş bir anahtar vermek demektir.

**Önemli ayrım — taban mı tavan mı?** Zayıf bir parametre *saldırı değil, hata*dır. `hashLength: 16` isteyen bir çağıran sessizce 32'ye yükseltilmeye devam ediyor; yalnızca **tavanı aşan** değerler reddediliyor. Bu ayrım testlerde açıkça sabitlendi.

#### Bu turda bulunan iki uç uyumsuzluğu

1. **JS'te `hashLength: 16` doğrudan geçiriliyordu**, Rust ise 32'ye yükseltiyordu. Aynı isteğin iki ucu farklı sonuç veriyordu — ve bunu sabitleyen mevcut bir test vardı. Test, JS'in eski davranışını doğruluyordu; Rust ile hizalanacak şekilde güncellendi.
2. **`MIN_ARGON2ID_PARALLELISM` ve `MIN_ARGON2ID_HASH_LENGTH` hiç tanımlı değildi** — tabanlar gömülü sayılardan geliyordu. Bu, politikayı iki yerde ayrı ayrı yazmak demek; ikisi de adlandırılmış sabit yapıldı.

#### Yeni Statik Kapı — `security:argon2-bounds`

İki uç **aynı politikanın iki uygulaması**. Ayrışırlar masaüstü tarafının reddettiği bir parametreyi WASM yolu yine de uygulayabilir — Y-16'nın durdurduğu DoS sessizce geri döner. Test paketinin hiçbir yeri bunu yakalamazdı.

Kapı 8 sınır sabitini, hata ön ekini ve iki sevk edilen profili karşılaştırıyor. Mutasyonla doğrulandı: JS tarafındaki `MAX_ARGON2ID_ITERATIONS` 20 → 2000 yapıldığında kapı doğru şekilde ayrışmayı bildirdi.

---

### O-8 — Yüksek Su İşaretinin Cihaz Kaybında Korunması

**Bu bulgu koda dönüştürülmedi, ve bu bilinçli bir karar.** Gerekçeyi kayda geçirmek, sahte bir düzeltmeyi tercih etmekten daha doğru.

Ledger origin kapsamlı istemci depolamasında yaşıyor (`getIndexedDbItemSync` → localStorage + bellek önbelleği). Yani **kullanıcı site verisini sildiğinde tam olarak o an kayboluyor** — ki bu, saldırganın eski bir kasa dosyasını geri oynatmak isteyeceği an da. İstemci tarafında hiçbir işaret bunu atlatamaz; atlatacağını iddia eden ya kasası dosyasının içindedir (dosyayı düzenlemek yeniden yeterli olur) ya da sunucu/platform anahtar deposu gerektirir.

**Fail-closed burada düşünüldü ve reddedildi.** Site verisini bilerek temizleyip kendi şifreli yedeğini geri yükleyen bir kullanıcı, **parola yöneticisinden kilitlenirdi**. Çalışan bir kasayı kullanılamaz hale getirmek, kontrol edemeyeceği (ve kendisinin de neden olmuş olabileceği) bir senaryoya karşı savunmak için ödediğimiz zarardan daha ağırdır.

**Bunun yerine durum görünür kılındı.** `detectLostIntegrityLedger` mühürlü bir kasanın ledger'ının kaybolduğunu saptar ve yükleme anında `warning` seviyesinde bir güvenlik olayı kaydeder. Gerekçe kodun içinde yazılıdır; bu, "sinyal kaybı" noktasının bakımcıya görünür olması ve gerçek bir çözümün (platform anahtar deposu veya sunucu tarafı attestation) bütçelenmesi için karar noktası oluşturur.

Testler "kasayı kilitlememeyi" de bir özellik olarak sabitliyor: tespit bilgilendirici, fırlatmıyor ve hiçbir şeyi geri tutmuyor.

#### Testler (7 adet)

Mühürsüz kasa (sinyal değil), ledger sağlam, ledger kayıp, ledger **bozuk** (okunamayan ledger da aynı risk), sürüm bilgisi yok, ve "bilerek bloklamıyor" davranışı.

---

### Doğrulama

| Kontrol | Sonuç |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ **0 hata, 23 uyarı** (taban korundu) |
| `npm run test:unit` | ✅ **2121 / 2121** (2100 → 2121, **+21**, 242 → 243 dosya) |
| `npm run build` | ✅ |
| `npm run test:fuzz` | ✅ 37 |
| `cargo test --lib` | ✅ 57 / 57 |
| 8 güvenlik kapısı | ✅ hepsi PASS (`security:argon2-bounds` **yeni**) |

---

## 1.16 K-1 Derleme Borcu, O-16/O-17 ve O-13 Kapatma Raporu (Güncelleme: 27.09.2026, 00:40)

---

### K-1 — Android Kotlin Derleme Borcu KAPANDI

Bu oturumdan önce rapor "yayın öncesi bir Android derlemesi alınmalıdır" diyordu. **Alındı.**

Önceki denemeler zaman aşımına uğramıştı; asıl neden iki yapılandırma eksiğiydi:

1. `local.properties` yoktu → `sdk.dir` çözülemedi.
2. Yazıldığında ters eğik çizgiliydi → Gradle `java.io.IOException` verdi. Doğru biçim **kaçışlı sürücü harfi** ister: `sdk.dir=C\:/Users/...`.

Görev adı da belirsizdi (`compileDebugKotlin`), çünkü ABI varyantları ayrı görevler üretiyor. Doğrusu `:app:compileArmDebugKotlin`.

**Sonuç:** `compileArmDebugKotlin` ve `compileUniversalDebugKotlin` **BUILD SUCCESSFUL**. K-1'in üç yeni Kotlin dosyası (`LauncherActivity`, `AutofillRequestRegistry`, `AutofillSecurityLog`) gerçekten derlendi — artık "statik kapı + elle inceleme" değil, gerçek derleyici kanıtı var.

#### Derlemenin ortaya çıkardığı ek hata: Android lint hiç çalışmıyordu

Kotlin derlenince `:app:lintArmDebug` de çalıştırdım ve **7 hata** buldu. Bunlar daha önce hiç görülmemişti, çünkü lint CI'a bağlı değildi.

| Hata | Durum |
|---|---|
| `local.properties` `PropertyEscape` | **Benim yarattığım** hata — düzeltildi |
| `MissingTvBanner` | Önceden vardı (Leanback filtresi `MainActivity`'deydi), TV karosu boştu |
| `ImpliedTouchscreenHardware` | Önceden vardı — dokunmatik opsiyonel ilan edilmemişti, Play Store uygulamayı TV'den filtreliyordu |
| `NewApi` ×4 | **3'ü K-1'in eklediği yollardan** (API 26+ tip, minSdk 24) |

**`NewApi` bulgusunu dürüstçe inceledim ve önce yanlış sonuca vardım.** `AegisAutofillService` API 26+ bir tipi genişletiyor ve `MainActivity.captureAutofillIntent` her açılışta onun statiklerine başvuruyor — bu yüzden ilk düşüncem "API 24/25'te her açılışta çöker" oldu. İncelediğimde bunların hepsinin `const val` olduğunu gördüm: Kotlin derleyicisi bunları çağrı yerine sabit olarak gömer, dolayısıyla çalışma zamanında sınıfa referans kalmaz. Yani pratikte çökme yok, lint muhafazakâr.

Yine de sessiz bırakmadım: gerekçeyi kodun içine yazdım (`@Suppress("NewApi")` + açıklama), çünkü bu yol her açılışta çalışıyor ve bir gün `const val` olmaktan çıkarsa gerçekten çöker.

**Düzeltmeler:**
- `tools:targetApi="o"` ile servis API 26 gereksinimini **ilan ediyor** — minSdk'yı yükseltmeden, kontrolü susturmadan.
- `android.hardware.touchscreen required="false"` + `android:banner` → TV karosu artık boş değil. Banner **yer tutucu** olarak üretildi (marka zemini + vurgu şeridi); tasarım ekibi tarafından değiştirilmesi gerektiği rapora yazıldı.
- `lintArmDebug` **BUILD SUCCESSFUL**.

#### Asıl ders: lint'i CI'a bağladım

`npm run android:lint` + `ci.yml`'a adım + K-1 statik kapısına **"lint bağlı mı" kontrolü**. Bu olmadan yedi hata tekrar sessizce birikir. Kapı, banner'ı silerek mutasyonla doğrulandı (doğru şekilde BLOCKED verdi).

---

### O-16/O-17 — Snapshot Geri Yükleme Atomikliği

#### Doğrulama

Geri yükleme `deleteVaultItem` × N + `saveVaultItems` yapıyordu. Kasa **tüm blob olarak** yeniden yazıldığı için bu, **silinen her öğe için bir tam kalıcılık yazımı** + ek bir tane demekti. Ve 2. adım başarısız olursa (disk dolu, çökme, sekme kapanması) kasa **yarı silinmiş** kalıyordu — rollback yok.

#### Kapatma

1. **Atomik değiştirme ilkeli:** Depo arayüzüne opsiyonel `replaceAllVaultItemsWithKey`. Uygulama satır kümesini tek adımda değiştirir, **bir kez** kalıcılık yazımı yapar ve hata halinde tamamen geri alır. Hayatta kalan öğeler için mevcut satırlar yeniden kullanılır (alan kaybı yok), placeholder öğeler gerçek şifreli veriyi ezmez.
2. `replaceVaultItems` bu yolu tercih eder; desteklemeyen depolar için eski artımlı yol fallback olarak durur (geriye uyumlu).
3. **Boş değiştirme reddi:** Dolu bir kasada `items: []` ile gelen bir geri yükleme reddedilir. Boş bir snapshot'ın kasayı sessizce silmesi bir kazara olmamalı; açık yol `resetAll`. Zaten boş bir kasada ise zararsız bir no-op.

#### O-17 — Bütçeler

- `validateBackupPayload` **zaten** `fileSizeBytes` bütçesini destekliyordu, ama `restoreVaultSnapshot` bu değeri **hiç geçirmiyordu** — sınır kâğıt üzerinde mevcuttu. Artık çözülmüş bayt boyutu geçiriliyor.
- Bayt bütçesi tek başına yetmez: çok sayıda küçük öğe sınırın altında kalır ama öğe başına bir anahtar türetme ve şifreleme zorlar. `MAX_RESTORE_ITEM_COUNT = 50.000` eklendi — gerçek bir kasanın çok üzerinde, meşru hiçbir içe aktarımı reddetmiyor.

#### Testler (9 adet) ve mutasyon

`snapshots.test.ts` (4): tek atomik değiştirme ve **hiç** artımlı silme, bayt bütçesi reddi, öğe sayısı reddi, sınırda tam kabul.

`sqlite_opfs.test.ts` (5): tek kalıcılık yazımı (eski yola geri alınınca **kırıldı**), boş değiştirme reddi, tüm alanların korunması, çöp bayraklarının korunması.

**Bir testim var olmayan bir davranışı varsayıyordu:** "depo boş değiştirmeyi reddeder" dedim ama o davranışı hiç kurmamıştım. Kurarken kararı netleştirmek zorunda kaldım — yukarıdaki boş değiştirme reddi tam da bu testten doğdu.

---

### O-13 — `hydrate` Memoizasyonu

Her public metot `await this.hydrate()` ile başlıyordu (6 çağrı yolu) ve `hydrate` her seferinde `engine.initialize()` çalıştırıyordu. Bir kilit açma bu depoyu onlarca kez dokunuyor → veritabanı onlarca kez yeniden açılıyordu, ve maliyet **her okumada** tekrar ödeniyordu.

**Kapatma.** Uçuş halindeki promise önbelleğe alınıyor (boolean bayrak değil — eşzamanlı çağıranlar tek bir başlatma paylaşsın diye). **Reddedilme önbelleğe alınmıyor:** başarısız bir açılış çoğunlukla geçicidir (origin kotası, WASM fetch takılması) ve hatayı önbelleklemek depoyu oturum boyunca kilitlerdi. `resetAll` memo'yu temizler, çünkü sildiği şema metadata'sı artık geçerli değil.

#### Testler (4 adet)

Tek başlatma, eşzamanlı çağıranların paylaşımı, **başarısızlığın önbelleğe alınmaması** (2 deneme), reset sonrası yeniden açma.

---

### O-14 — Okuma Filtresi ve Sınırlı Eşzamanlılık (KAPANDI)

Bulgu iki ayrı şeyi birleştiriyordu: "`readVaultItemRows` filtresi, toplu şifreleme". İkisi de aynı dosyada ama farklı türden.

#### 1. Filtre JavaScript'te değil SQLite'ta olmalı

Satır geçerliliği kontrolü (`typeof id === 'string' && id.length > 0`) bir JS `.filter` idi. Bu, **bozuk satırların tam olarak reddetmek için önce köprüyü geçmesi** demek: her biri seçilip çözülüyor, sonra atılıyor. Yüksek seviyede şifreli sütunlar da taşınıyor.

Tahmin: boş `id`'li satırlar nadirdir, kazanç sınırlı. Yanlış — `enc_metadata` her satırda **şifreli JSON**; bir 5.000 öğelik kasada bozuk satırların taşıdığı şey sayı değil, tam metin. Filtre `typeof(id) = 'text' AND length(id) > 0` olarak SQL'e itildi, **JS guard'ı da bırakıldı** (motor `WHERE`'i yok sayan bir stub veya alternatif implementasyon için emniyet). `typeof` koşulu önemli: sadece `length(id) > 0` yeterli olmazdı, çünkü sayısal `id` 0 değilse `length`'a girer.

#### 2. Toplu şifreleme sıralıydı — ama `Promise.all` da doğru cevap değildi

Dosyanın **kendisi tutarsızdı.** `reseedDemo` (§439) ve iki rekey yolu (§204, §263) `Promise.all` kullanıyordu; okuma yolu (§298) ve `saveVaultItemsWithKey` (§351) ise satır başına `await` eden sıralı döngülerdi. 5.000 öğeli bir kasada 5.000 tur bekleniyor.

Ama `Promise.all` ile değiştirmek **kendimize DoS** olurdu. Bunu O-17 ile birleştirdiğimde fark ettim: snapshot geri yükleme 50.000 öğe kabul ediyor, dolayısıyla 50.000 eşzamanlı canlı öğe anahtarı + şifre metni = sekme büyüklüğünde bir tahsis. Hangi hesap yapılırsa yapılsın, uygulanacak olan zaman kazanımı ile hafıza patlaması arasındaki seçimdi.

Çözüm: `mapWithConcurrency`, sınır **16**. WebCrypto işini zaten ana iş parçacığı dışında yürütüyor, dolayısıyla birkaç eşzamanlı istek bedava duvar-saati kazancı. Sınır, tüm WebCrypto yuvalarını meşgul tutarken büyük ama meşru bir içe aktarımı bellek patlamasına çevirmiyor. Sıra korunuyor.

Bu kararın gerekçesini **kodun içine** yazdım, çünkü sınır belki de bugünün en büyük performans sorunu değil ve altı ay sonra "neden 16?" sorusu gelecek.

**`onProgress` kasıtlı olarak yerinde bırakıldı.** Şifreleme fazına da sayaç eklemeyi denedim — bu, her öğe için iki kez sayma anlamına geliyordu ve ilerleme çubuğu gerçek işin ötesine geçecekti. `onProgress` kalıcı yazımları bildiriyor, öyle kalmalı.

#### Testler (5) ve mutasyon

Mutasyonlarla doğrulandı, üçü de doğru testi kırdı:

| Mutasyon | Kırılan test |
|---|---|
| Sınırı `MAX_SAFE_INTEGER` yap | eşzamanlılık testi ✅ |
| Çıktı sırasını ters çevir | sıra testi (2 test) ✅ |
| SQL guard'ını sil | SQL filtresi testi ✅ |

Test yazarken **iki tuzak vardı:**

- **Boş `enc_metadata` hiç decrypt çağırmıyor.** İlk denemem elle yazılmış satırlarla ölçüm yapıyordu; decrypt yoluna hiç girmiyordu, tepe eşzamanlılığı 0 çıkıyordu ve test **anlamsız biçimde geçiyordu.** Gerçek şifreleme yolundan geçerek tohumladım.
- **Testler birbirini zehirledi.** `vi.clearAllMocks()` yalnızca çağrı geçmişini siler, **implementasyonları silmez.** Kendi şifreleme implementasyonumu kuran testim, sonraki altı alakasız round-trip testini kırmızıya döndürdü. `beforeEach` içindeki `clearAllMocks` → `resetAllMocks` (Vitest 4 fabrika implementasyonunu geri yükler) düzeltmesi bir kusur düzeltmesi değil, **dosyada zaten var olan bir tuzağı kapatıyordu.**

---

### O-3 — Sadece "dolu depo" değil, "öksüz kalan" ana şifre de temizleniyor (KAPANDI)

O-2 ile aynı satırda raporlanmıştı ama O-2 çok büyük (bkz. aşağıdaki "Açık bırakılan karar"), O-3 ise dar ve hemen kapatılabilir bir bulguydu.

#### Asıl bulgu bir boyut asimetrisi

Temizlik `aegis_master_password` ve `aegis_vault_items` **ikisi de** kaldığında ve depo doluyken çalışıyordu. Bu koşul doğruymuş gibi görünüyor ama tersi: iki anahtarın boyutu tamamen farklı.

- `aegis_master_password` = birkaç on bayt base64
- `aegis_vault_items` = kasanın tamamı, megabayt olabilir

**Tarayıcı kota baskısı altında büyük anahtarı siler, küçüğü tutar.** Yani terfi sonrası asla hayatta kalmaması gereken anahtar, hayatta kalma ihtimali en yüksek olan anahtar. Öğeler gittiğinde göç edilecek bir şey kalmıyor, şifre hiçbir şeyi açamıyor — ama base64 hâlinde sonsuza kadar duruyor. Üstelik `aegis_is_setup` da 'true' kaldığı için kullanıcı uygulamayı "kurulmuş" görüyor.

Kodu okurken "bu koşul muhtemelen bir güvenlik önlemi" diye varsaymak kolay, ve bu tuzaktı: **asıl güvenlik koşulu "şifre verinin tek kopyası değil" idi; öğelerin yokluğu bunu, deponun dolu olması kadar sağlıyor.** Yani `aegis_vault_items` varlığına bağlamak koruma değil, kusurun kendisiydi.

#### Kapatma

1. **Öksüz şifre dalı:** şifre var, öğe yok, depo boş → şifre silinir, `storage.legacy.purged` olayı yazılır.
2. **İkinci bir kapı kapatıldı:** `aegis_sqlite_fallback` aynasından yüklenen durumda fonksiyon `return` ile erken çıkıyordu, yani temizlik **hiç** çalışmıyordu. Aynı öksüz şifreye ikinci bir yoldan erişim mümkündü. İki çıkış da artık aynı temizliği kullanıyor.

**Geri alma güvenliği değişmedi:** öğe blob'u varken depo boşsa şifre **korunur** — bu, göç edilmemiş bir kasa ve düz metin kaynaklar tek kopyadır.

#### Testler (3) ve mutasyon

| Mutasyon | Kırılan test |
|---|---|
| Öksüz şifre dalı kaldırıldı | 2 test ✅ |
| Ayna erken çıkışındaki temizlik kaldırıldı | 1 test ✅ |
| **Genişletildi** (öğe varken de sil) | 2 test ✅ |

Üçüncü mutasyon kasıtlı olarak **aşırı düzeltmeyi** denedi: bulguyu "daha çok temizleme" diye okuyan biri tam olarak bunu yazardı. Yakalandı — çünkü geri alma güvenliğini ayrıca sabitleyen bir test yazmıştım.

---

### Açık bırakılan karar — O-2 (`localStorage` aynası) kaldırılmadı

Aynı rapor satırındaki ikinci yarı, bilinçli olarak açık bırakıldı ve gerekçesi kayda geçti.

`aegis_sqlite_fallback` kasanın **şifreli** tamamını `localStorage`'a yazıyor. Bunu kaldırmak cazip ama:

- **Hareketli hedef değil, yük taşıyıcı.** `sqliteOpfsMigration.ts:46`, `storage.ts:170` ve `vaultStorageProvider.ts:243` bu anahtardan okuyor; mevcut kullanıcıların göç yolu buna dayanıyor. Kaldırmak, göçü tamamlanmamış kullanıcıların verisini taşınabilir hâle getirir.
- **Asıl bulgu "düz metin sızıntısı" değil, "sessiz bayatlama".** Kota hatası `catch {}` ile yutuluyor, dolayısıyla "kurtarma aynası" sessizce eskiyebiliyor. Bayat bir aynayı kurtarma seçeneği olarak sunmak, kullanıcıya verisinin yedeği sanılan eski veriyi vermektir.
- Şifreli olması, `localStorage`'ın XSS hedefi olması gerçeğini küçümsemiyor; ama ayna kaldırıldığında kazanılan güvenlik, **kaybedilecek göç verisinin** riskine göre tartılmalı.

Önerilen sonraki adım, silmek değil: **bayatlığı görünür kılmak** — aynanın yazıldığı tarihi tutmak ve yükleme sırasında OPFS kopyasından eskiyse uyarı göstermek. Bu, sessiz veri kaybını kapatırken göç yolunu bozmaz.

---

### Doğrulama

| Kontrol | Sonuç |
|---|---|
| `:app:compileArmDebugKotlin` | ✅ **BUILD SUCCESSFUL** |
| `:app:compileUniversalDebugKotlin` | ✅ **BUILD SUCCESSFUL** |
| `:app:lintArmDebug` | ✅ **BUILD SUCCESSFUL** (7 hata → 0) |
| `cargo test --lib` | ✅ 57 / 57 |
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ **0 hata, 23 uyarı** (taban korundu) |
| `npm run test:unit` | ✅ **2141 / 2141** (2121 → 2141, **+20**) |
| `npm run build` | ✅ |
| `npm run test:fuzz` | ✅ 37 |
| 8 güvenlik kapısı | ✅ hepsi PASS (K-1 kapısı 18 → **20** kontrol) |

---

## 1.17 #43 Kapatma Raporu — `revoke` Jenerasyon Sayacı (Güncelleme: 27.09.2026)

---

### Asıl bulgu: iptal, geleceğe dair bir işlemdi

`revoke` döngüsel IPC eylemi token'ı döndürüyor, kimlik bilgisi kirasını siliyor ve **kim onu istediyse o bağlantıyı kapatıyor.** Dokümantasyon ise "tüm önceden verilmiş oturum anahtarlarını geçersiz kılar" diyordu.

Token döndürmek yalnızca **gelecekteki el sıkışmaları** geçersiz kılar. `handle_client` `session_data_key`'i bağlantı anında **bir kez** türetiyor; ondan sonra anahtarı bellekte taşıyor. Yani:

- A eklentisi `revoke` gönderdi → A'nın bağlantısı kapanır, A'nın kirası silinir.
- B eklentisi hâlâ açık. Hâlâ **eskiden türetilmiş** anahtarını sunuyor.
- Sunucu o anahtarı tanıyor, çünkü karşılaştırdığı şey token'ın kendisi değil, türetilmiş anahtar.

B, işlem ömrü boyunca `get_credentials` çağırabilmeye devam ediyor. Kullanıcı "bağlantıyı kes" dediğinde olan şey, "yalnızca kendi bağlantısını kes" oldu.

Aynı kusurun ikinci bir kapısı daha vardı ve raporda ondan söz edilmiyordu: **`rotate_pairing_token` komutu da aynı şeyi yapıyordu.** Kullanıcı ayarlardan eşleştirme token'ını döndürdüğünde, döngüsel IPC'de hâlâ açık olan oturumlar da yaşamaya devam ediyordu. Yani bulgu "revoke düğmesi eksik" değil, **"token döndürme hiçbir koşulda canlı oturumları sonlandırmıyor"** idi. `revoke`'u düzeltip `rotate_pairing_token`'ı kendi halinde bırakmak, bulgunun yarısını düzeltmek olurdu.

### Çözüm: paylaşılan bir jenerasyon sayacı

`RevokeGeneration(Arc<AtomicU64>)` — kabul edilen her bağlantı, kendisiyle birlikte gelen token'ın **yanında** jenerasyonu da kaydeder, ve çerçeve okuyucu, jenerasyon ilerlemişse isteği hiç döndürmez.

Token'ın kendisi değil, bir sayaç kullanmanın gerekçesi: token gizli malzeme ve her istekte bir mutex altında yeniden okunmak zorunda kalırdı. Sayaç, bir işleyicinin gerçekten sorduğu tek soruyu yanıtlıyor — "oturumum hâlâ yaşayan oturum mu?"

#### Kontrolün `read_authenticated_frame`'in **içine** konması

İlk yazımımda kontrolü mesaj döngüsüne, `serde_json::from_slice`'ten hemen önce koydum. Sonra kendi testimi gerçekten sınadığımda gördüm ki **o satırı silmek hiçbir testi kırmıyordu.** `handle_client` bir `tauri::AppHandle` istiyor, dolayısıyla test onu çağıramıyor ve o çağrı noktası testlerle hiçbir şekilde bağlanmıyordu. Yani elimde bulgu kapatmış gibi görünen, ama aslında kendi haline bırakılsa sessizce geri gelen bir düzeltme vardı.

Bunun yerine kontrolü **tek geçtiği noktaya**, yani çerçeve okuyucuya taşıdım. Artık atlanmasının tek yolu okuyucuyu kullanmamaktır. Yan fayda: işleyici günlüğü artık iptali bozulmadan ayırt edebiliyor (`ConnectionAborted` kendi koluna düşüyor, "AEAD frame decryption failed" değil) — çünkü `handle_client` içinde yine de test edilemeyen bir satır duruyor, bu sefer yalnızca bir log ayrımı.

#### Kontrolün okumadan **sonra** olması

Kontrolü önce fonksiyonun başına, sonra sonuna koymuştum. Nedeni: okuma `IPC_READ_TIMEOUT` boyunca bloklar, yani yalnızca başta kontrol edilirse, o süre içinde gerçekleşen bir iptal hiçbir şeyi durdurmaz — eldeki kare sunulur ve bağlantı devam eder. Son kontrol yetkili olan.

Ama bu iki kontrollü tasarım **kara kutu testiyle ayırt edilemiyordu.** İlk mutasyonumda sonraki kontrolü sildim ve "blokeli okuma sırasında iptal" testim yine de geçti. Sebep: testimin "okuyucu başladı" sinyali fonksiyon **çağrılmadan önce** gönderiliyordu, yani baş kontrolü iptali yakalıyordu ve testin iddia ettiği şeyi kanıtlamıyordu.

Burada tasarımı değiştirdim: **baştaki kontrolü kaldırdım.** O kontrol yalnızca bir optimizasyondu (sessizce duran iptal edilmiş bir bağlantıyı 30 saniye boyunca blokeli okumada tutmamak). Kaldırınca sonraki kontrol tek kontrole dönüşüyor, okuyucu hâlâ tek geçiş noktası kalıyor ve test gerçekten bir şey kanıtlıyor. Testin kendi yorumu da düzeltildi: artık "zamanlama tahminine değil, yapıya dayanarak" izole ediyor.

**Bu, O-3'te işe yarayan aşırı düzeltme disiplininin ters yönde işe yaramış hâli:** önce "daha çok kontrol koy" dedim, test bunu kanıtlamadı, sonra **eksiltmeye** giderek hem daha az kod hem daha çok kanıtlanabilir davranış bıraktım.

#### Düzeltme çağrı yerine değil, döndüren fonksiyonun içinde

İki bağımsız token döndürme yolu var (`revoke` eylemi ve `rotate_pairing_token` komutu). Jenerasyon artışını çağrılara bırakırsam **unutulacak iki yer** olur. Bu yüzden artış `rotate_pairing_token_now`'un **içinde**:

```rust
session_generation.revoke();              // önce, hiçbir şey başarısız olamadan önce
let new_token = generate_token();
write_pairing_token_file(&path, &new_token)?;   // sonra — başarısız olabilir
```

Sıralama kasıtlı ve ayrı bir testle sabitlendi. "Önce yaz, sonra bağlantıları kes" daha derli toplu görünüyor, ama **fail-open** yönü: kullanıcı bağlantıyı kesmeyi istedi, disk yazımı başarısız oldu ve tüm bağlı eklentiler hiçbir şey olmamış gibi kimlik bilgilerini okumaya devam etti.

#### İstemci tarafı neden sayacı paylaşamıyor

`run_host` (native messaging host) **ayrı bir süreç.** Sayacı sunucunun adres alanında, bu yüzden paylaşılamaz — ve bu bir sorun değil: yetkili sunucudur, iptal edilmiş bir oturumu çerçeve okuyucuda reddeder, host bir hata alıp döngüden düşer. Yerelde sıfırdan farklı bir sayaç yalnızca **ulaşılamaz** bir gerçeğin ikinci kopyası olurdu; bu yüzden `run_host` bilinçli olarak sıfırda bırakıldı ve gerekçesi koda yazıldı.

### Testler (11 adet) ve 9 mutasyon

Yeni testler (`native_messaging.rs`), 57 → 68:

| Test | Ne sabitliyor |
|---|---|
| `a_fresh_generation_admits_its_own_sessions` | `new()` ve `default()` bağımsız kurulur; ayrışırlarsa yakalanır |
| `revoke_invalidates_a_session_admitted_under_the_previous_generation` | Çekirdek bulgu + `ConnectionAborted` hata türü |
| `a_session_admitted_after_a_revoke_is_still_served` | **Aşırı düzeltme koruması** (aşağıda) |
| `every_revoke_retires_all_earlier_generations` | Sayaç ileri gider, sıfırlanmaz; ara jenerasyon da emekli kalır |
| `a_cloned_generation_observes_the_revoke` | `ExtensionState` ile kabul döngüsü **aynı** sayacı görüyor |
| `rotating_the_pairing_token_retires_the_live_sessions` | Düzeltmenin kendisi: sayaç ilerler, eski anahtar ölür, disk de güncellenir |
| `revoking_wipes_the_credential_lease_as_well_as_the_sessions` | `revoke` iki şeyi de yapıyor |
| `a_failed_persist_still_retires_every_session` | Yukarıdaki sıralama kararı |
| `the_frame_reader_admits_a_request_for_a_live_session` | Kontrolün sağlıklı oturuma maliyeti yok |
| `the_frame_reader_refuses_a_revoked_session` | Bulgu, uygulandığı yerde |
| `a_revoke_that_lands_during_a_blocked_read_is_still_caught` | **Sonra** konumlandırmanın gerekçesi (aşağıda) |

**Dokuz mutasyonun tamamı yakalandı** — üçü kasıtlı olarak **aşırı düzeltme**, yani bulguyu "daha çok temizleme" diye okuyan birinin yazacağı kod:

| # | Mutasyon | Kıran test |
|---|---|---|
| M1 | Çerçeve okuyucudaki kontrol silindi | 2 ✅ |
| M2 | Döndürme fonksiyonundaki `revoke()` silindi (**düzeltmeyi geri al**) | 3 ✅ |
| **M3** | **Aşırı düzeltme:** *her* oturumu, jenerasyon fark etmeksizin iptal edilmiş say | 4 ✅ |
| **M4** | **Aşırı düzeltme:** sayacı ilerletmek yerine **sıfırla** ("temiz bir çağ") | 8 ✅ |
| **M5** | **Aşırı düzeltme:** önce diske yaz, yalnızca başarı olursa oturumları emekliye ayır | 1 ✅ |
| M6 | `new()` sıfırdan farklı bir değerle başlıyor | 1 ✅ |
| M7 | `Clone` bağımsız bir sayaç üretiyor (sessiz kablolama kusuru) | 2 ✅ |
| M8 | Token diske yazılmıyor, yalnızca bellekte | 2 ✅ |
| M9 | Kimlik bilgisi kirası silinmiyor | 1 ✅ |

M3 ve M4'ün birlikte öğrettiği şey şu: "daha çok temizleme" burada **iki ayrı tuzağa** düşüyor. M3, yeni token'la yeniden el sıkışmış meşru bir oturumu da öldürüyor (kullanıcıyı eklentisinden koparan bir hizmet reddi). M4, geri alınmış bir oturumu **yeniden canlandırıyor** — sayaç sıfırlandığı için, tam da iptal edildiği andaki değere geri dönüyor. Üçüncüsü (M5) ise kodun en dürüst görünen, "sırayı düzelt" yazımı.

#### Bu turda iki test hatası

Bunları yazmadım çünkü testler ilk denemede kırmızıydı, ama kayda değer:

1. **Yanlış varsayım:** aynada okunan token ile bellekteki token'ın *farklı* olmasını bekledim. Elbette aynı — ikisi de yeni token. Doğru olan kontrol, *emekliye ayrılan* token'dan farklı olmalarıydı. Test, uygulamayla değil kafamdaki senaryoyla yazılmıştı.
2. **Yanlış "yazılamaz" yol seçtim:** bir dizinin *içine* yazmayı reddedeceğini sandım; ama `write_pairing_token_file` üst dizinleri oluşturuyor, dolayısıyla yazma **başarılı** oldu. Doğru yol: üst öğesi sıfır **dosya** olan bir yol.

### Kapanmayan veya kapsam dışı bırakılan kısım

Dürüstlük için: `handle_client`'ın kendisi hâlâ test edilemiyor (`tauri::AppHandle` gerektiriyor). Kontrol oraya değil, test edilebilir olan `read_authenticated_frame`'e taşındığı için **güvenlik davranışının tamamı** test kapsamında; kapsam dışı kalan tek şey, o kontrolün mesaj döngüsünde *çağrıldığı* satır. Onu da kapatmanın yolu bir statik kapı eklemek (`security:session-gates` bunun için zaten var) — bu turda kapsam dışı bırakıldı, çünkü sekiz güvenlik kapısının sayısını değiştirir.

`rotate_pairing_token` komutunun oturum kapısı (#42) korundu ve `security:session-gates` geçiyor.

---

### Doğrulama

| Kontrol | Sonuç |
|---|---|
| `cargo test --lib` | ✅ 68 / 68 (57 → 68, **+11**) |
| `cargo clippy --lib --all-targets` | ✅ 4 uyarı — **taban korundu** (yeni uyarı yok) |
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ **0 hata, 23 uyarı** (taban korundu) |
| `npm run test:unit` | ✅ **2141 / 2141** (değişmedi) |
| `npm run build` | ✅ |
| `npm run test:fuzz` | ✅ 37 |
| 8 güvenlik kapısı | ✅ hepsi PASS |

---

## 1.18 #44 Kapatma Raporu — `index.html` Bütünlük Manifesti (Y-20) (Güncelleme: 27.09.2026)

---

### Dışlama gerekçesi bu proje için doğru değildi

`index.html` manifestten **bilinçli** olarak çıkarılmıştı ve kodda gerekçesi yazılıydı:

> Tauri yapılandırılmış CSP'yi `index.html`'e çalışma zamanında enjekte eder. WebView tarafındaki doğrulamanın yanlış pozitif vermemesi için yalnızca statik yükleri hashle.

Bu, Tauri v2 için doğru değil — ve tahmin etmeyi reddettim, **ölçtüm**:

1. `tauri.conf.json`'daki `security.csp` ile derlenmiş `dist/index.html` içindeki CSP `<meta>` etiketi **farklı stringler.** `tauri.conf.json`'daki policy `update.aegisvault.xyz`, `github.com` ve `objects.githubusercontent.com` izinleri içeriyor; `<meta>` etiketi ise `data:`/`blob:` içeriyor ve o üçünü içermiyor.
2. `dist/index.html` içindeki `<meta>` CSP, **kaynak `index.html` şablonundakiyle bayt bayt aynı.**

Yani Tauri v2 kendi CSP'sini `tauri://` protokolü üzerinde **yanıt başlığı** olarak uyguluyor ve dosyayı diskte yeniden yazmıyor. Hash'lenen baytlar, WebView'in yüklediği baytlar. Dışlama gerekçesiz değildi, **yanlıştı** — ve rapor §4.2'de bu gerekçeyle ele alınmış olması, bulgunun "niçin yapıldı" sorusunu cevaplamadan geçilmesinin sonucuydu.

Düzeltilmiş `dist/index.html` üzerinde karşı kontrolü de çalıştırdım: 6 yerel referansın **tamamı** manifestte, `UNLISTED: []`. Yani üretimde yanlış pozitif yok.

### İki yarım düzeltmeyi de kapatmak

Bulgu iki şeyi içeriyordu; ilkini yapmak ikincisini açık bırakırdı:

1. `index.html` manifestte **değil** → diskteki `dist/index.html`'e `<script src="evil.js">` ekleniyor, kök hash'i hâlâ eşleşiyor, kontrol `{status:'verified'}` döndürüyor ve **çözülmüş kasayla keyfi JS çalışıyor.**
2. `verifyRuntimeAssetIntegrity` yalnızca `manifest.assets` üzerinde geziyor; manifestte **olmayan** bir isteği reddedecek karşı kontrollü **yok.**

İkincisi olmadan birincisini kapatmak, tek bir saldırı yolunu kapatmak olurdu. İkincisi olmadan birincisini kapatmak ise yalnızca `index.html` hash'ini korur — hangi yeterli olmadığı, sonraki rotada başka bir belgenin aynı role girmesiyle anlaşılır.

Karşı kontrol (`findUnlistedAssetReferences`) saf bir fonksiyon olarak yazıldı ve DOM'dan ayrı tutuldu, böylece DOM olmadan test edilebiliyor. `collectDocumentAssetReferences` **canlı `document`'i okumuyor**, çünkü `document.documentElement.outerHTML` ayrıştırılmış DOM'un yeniden serileştirilmiş hâlidir ve orijinal baytlarla **asla** aynı hash'i vermez; bunun yerine az önce doğruladığımız baytları ayrıştırıyor.

#### Canlı `document`'i okumamak yerine baytları çözmekle ilgili tuzak

Sayfadaki `script`/`link` referanslarını okumanın en doğal yolu `document.querySelectorAll` idi. Bu, `index.html`'in bütünlüğunu doğrulamak için **yanlış** olurdu: DOM serileştirmesi orijinal dosyadan farklıdır, dolayısıyla ne bir `<meta>` CSP yeniden yazımı ne de nitelik sırası hash'i kurtaramaz. Doğru girdi zaten elimizdeydi — `fetch` ile indirip hash'ini doğruladığımız baytlar.

### Test ortamı, güvenlik açısından bir sinyal verdi

`collectDocumentAssetReferences` `DOMParser` kullanıyor ve mevcut test dosyası **node** ortamında çalışıyor — `DOMParser` yok, testler kırmızı.

İlk refleksim dosyayı bölmek oldu ("counter-check jsdom'da, doğrulama node'da"). Bu refleksi sorgulamaya değerdi, çünkü **güvenlik açısından yanlış bir yönde bölme** olurdu: yeni kontrolün uçtan uca testi, kontrolün gerçekten çalıştığı ortamdan ayrı düşerdi.

Önce ölçtüm: bu depodaki jsdom hem `DOMParser` **hem** çalışan `crypto.subtle` sağlıyor. Yani bölme gereksizdi; dosyaya tek bir `@vitest-environment jsdom` satırı yeter. Böylece `verifyRuntimeAssetIntegrity`'nin karşı kontrollü yolu **aynı testte, aynı ortamda** kapsanıyor.

### Var olan bir test gerçekten değişti

`verifies the manifest root and every packaged asset` testi `index.html`'i manifestte olmayan bir varlıkla kuruyordu ve `{status:'verified', assetCount: 1}` bekliyordu. Artık `{status:'verified', assetCount: 2}` bekliyor ve `index.html`'i de içeriyor. Bu bir test düzeltmesi değil, **beklenen davranışın değişmesi** — ve tesadüfen, `index-html-unlisted` kapısının kapandığının da kanıtı.

### Testler (8 yeni) ve 6 mutasyon

| Test | Ne sabitliyor |
|---|---|
| `generates and validates ... without self-hashing` *(güncellendi)* | `index.html` manifestte; iki varlık |
| `catches a script injected into index.html` | **Asıl saldırı** — diğer her şey sağlamken |
| `still excludes the manifest itself and source maps` | Filtre hâlâ manifest'i ve `.map`'leri dışlıyor |
| `verifies the manifest root and every packaged asset` *(güncellendi)* | Mutlu yol `index.html`'i de doğruluyor |
| `fails closed when index.html is not covered by the manifest` | Varlık kapısı, tek varlık fetch edilmeden önce |
| `fails closed when the verified document references an unlisted script` | Karşı kontrol; manifest/anchor/hash'ler **tutarlı** |
| `flags a local reference the manifest does not cover` | Çekirdek davranış |
| `accepts the site-absolute and relative forms` | `/assets/x.js` ≡ `assets/x.js` — üretimde yanlış pozitif olmamasının şartı |
| `leaves non-local references alone` | **Aşırı düzeltme koruması** (`blob:`, `data:`, `https:`) |
| `does not normalise a traversal attempt` | **Aşırı düzeltme koruması** (`/assets/../../evil.js`) |
| `collects the asset URLs a document asks to load` | DOMParser bağlantısı, satır içi script hariç |
| `finds nothing unlisted in the real built document` | Gerçek `dist/index.html` biçimi (modülpreload, splash CSS) |

**Altı mutasyonun tamamı yakalandı** — üçü aşırı düzeltme:

| # | Mutasyon | Kıran test |
|---|---|---|
| M1 | `index.html` dışlaması geri konuldu (**düzeltmeyi geri al**) | 3 ✅ |
| M2 | Karşı kontrolün çağrısı kaldırıldı (**düzeltmeyi geri al**) | 1 ✅ |
| **M3** | **Aşırı düzeltme:** manifesttekileri de dâhil **her** referansı reddet | 1 ✅ |
| **M4** | **Aşırı düzeltme:** `../`'yi çözümleyip sonra bak (dist'ten kaçışı meşruya çevirir) | 1 ✅ |
| M5 | `index.html` varlık kapısı kaldırıldı | 1 ✅ |
| **M6** | **Aşırı düzeltme:** "her şeyi dahil et" — `.map` dosyaları da manifestte | 1 ✅ |

M3'ün kırıldığı test `verifies the manifest root and every packaged asset` — yani **aşırı düzeltme, meşru yapıyı reddeden bir regresyon olarak** yakalandı, "daha güvenli görünüyor" diye geçmedi. M4 ise sessiz bir açık kapıyı kapatıyor: `../` çözümlemesi, dist'ten kaçan bir referansı listede bulunabilecek bir şeye dönüştürürdü.

### Not

`index.html`'i hash'lemek, `security:asset-integrity` kapısını yalnızca **derleme sonrası** doğruluyor; çalışma zamanı karşı kontrolü manifesti okuyarak aynı dosyayı tekrar doğruluyor. İkisi birbirini tamamlıyor: ilki üretim çıktısının doğru üretildiğini, ikincisi kurulu çıktının değiştirilmediğini söylüyor.

---

### Doğrulama

| Kontrol | Sonuç |
|---|---|
| `npm run test:unit` | ✅ **2151 / 2151** (2141 → 2151, **+10**) |
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ **0 hata, 23 uyarı** (taban korundu) |
| `npm run build` | ✅ manifest **15 → 16 varlık** (`index.html` eklendi) |
| `npm run test:fuzz` | ✅ 37 |
| `cargo test --lib` | ✅ 68 / 68 (değişmedi) |
| 8 güvenlik kapısı | ✅ hepsi PASS |
| Gerçek `dist/index.html` karşı kontrolü | ✅ `UNLISTED: []` (6 referansın 6'sı kapsamda) |

---

## 2. Mimari Özeti

```
main.tsx
 ├─ installAirgapNetworkPolicy()        (PROD; fetch/XHR/WS/beacon/WebRTC patch)
 └─ <StrictMode><LanguageProvider><ThemeProvider><App/>
        │
        └─ App.tsx                        ← oturum durumunun TEK sahibi
             ├─ <LockScreen/>  (kilit ekranı — hata sınırı DIŞINDA)
             └─ unlocked → React.lazy(<UnlockedApp/>)
                    │                     (529 satır, 30+ hook, %0 test kapsamı)
                    └─ useVaultData / useVaultQueries / useVaultFilters
                       useRuntimeSecurity / useSensitiveReveal
                       <ErrorBoundary> ← sadece burada

Katmanlar:
  src/lib/         Saf mantık katmanı — kripto, depolama, importer, sync
  src/hooks/       React mantık — oturum, veri, filtreler
  src/components/  Sunum — modaller, kilit ekranı, workspace
  src-tauri/src/   Rust — Argon2id, native messaging (XChaCha20), dosya yazma
  src-tauri/gen/android/  Kotlin — AutofillService, Keystore, JS bridge
  src-extension/   Eklenti — background, content, popup, PSL eTLD+1
  scripts/         ~50 build/release/signing scripti
```

**Güçlü taraflar (bunlara dokunmayın):**
- `src/lib/random.ts` — `crypto.getRandomValues` yoksa **sert hata** verir; kriptografik yolda `Math.random()` yedeği yok.
- `src/lib/webcrypto.ts` — AES-256-GCM, 96-bit rastgele IV, 128-bit etiket, **çözme öncesi etiket doğrulaması**. "Çöz, sonra kullan" yolu yok.
- `src-tauri/src/native_messaging.rs` — kare başına 24 bayt `getrandom` nonce, katı uzunluk/versiyon doğrulama, başarısızlıkta fail-closed.
- `src-tauri/src/native_messaging.rs`, `credential_handler.rs` — `subtle::ConstantTimeEq` ile gizli karşılaştırma.
- `src/lib/sync/syncConfigStorage.ts` — güvenilmeyen KDF parametreleri için **doğru desen** (her boyutta clamp). O-6'daki kodun karşıt örneği.
- `src/lib/argon2id.ts` — `SessionState` hem `Zeroize` hem `ZeroizeOnDrop`.
- `src/components/ui/Modal.tsx` — gerçek focus trap, Escape, scroll lock.

---

## 3. Kritik Bulgular (7)

### K-1 · Android: Dışa açık `MainActivity` sahte autofill intent'lerini kabul edip seçilen kimlik bilgisini çağırana geri döndürüyor

> **Durum: ✅ KAPANDI (K-1 Kapalı — 26.09.2026).** Çözüm ve kanıt için **§1.3**'e bakınız. Aşağıdaki metin, açığın inceleme anındaki halini belgeler.

**Dosya:** `src-tauri/gen/android/app/src/main/AndroidManifest.xml:19-27`, `MainActivity.kt:300-312`, `bridges/AndroidAutofillBridge.kt:152-176`

```xml
<activity android:name=".MainActivity" android:launchMode="singleTask" android:exported="true">
```
```kotlin
if (intent?.action != AegisAutofillService.ACTION_AUTOFILL_AUTHENTICATE) return
pendingAutofillRequest = AutofillLaunchRequest(
  requestId = ..., appPackage = intent.getStringExtra(EXTRA_AUTOFILL_APP_PACKAGE),
  webDomain  = intent.getStringExtra(EXTRA_AUTOFILL_WEB_DOMAIN), ...)
```

`ACTION_AUTOFILL_AUTHENTICATE` sadece bir string sabiti. Cihazdaki **herhangi bir uygulama** şunu yapabilir:

```kotlin
startActivityForResult(
  Intent("com.hafgit99.aegisvault7.action.AUTOFILL_AUTHENTICATE")
    .putExtra(EXTRA_AUTOFILL_WEB_DOMAIN, "github.com")
    .putExtra(EXTRA_AUTOFILL_PASSWORD_IDS, kendiAutofillId), 1)
```

Uygulama saldırganın verdiği alan adıyla doldurma arayüzünü gösterir; seçim yapıldığında `setResult(RESULT_OK, EXTRA_AUTHENTICATION_RESULT)` çağrılır ve `Dataset` içindeki `AutofillValue.forText(password)` düz bir Parcelable olarak **saldırganın `onActivityResult`'ine** düşer. `getCallingPackage()` kontrolü, gerçek `FillRequest`'e karşı `webDomain` doğrulaması veya sistem-üretilmiş oturuma bağlama **yok**. `isFresh()` 2 dakikalık penceresi ve `requestId` eşitliği de saldırgan tarafından seçilen değerlerle karşılanır.

Aynı kök neden `ACTION_AUTOFILL_SAVE` yolunda kasa zehirleme (vault poisoning) ve gerçek bir kaydın `singleTask` + `onNewIntent` ile **değiştirilmesine** yol açıyor (`MainActivity.kt:284-296`).

**Öneri:** Kimlik bilgilerini Intent'ten okumayı bırakın. Bekleyen isteği süreç-geneli bir registry'de `requestId` ile tutun; bu registry'yi **yalnızca** `AegisAutofillService.onFillRequest`/`onSaveRequest` doldursun. Activity `requestId` ile registry'ye baksın, bilinmeyen istekleri reddedin. `webDomain` doğrulamasını servis içinde `AssistStructure`'dan alın. `android:exported="false"` yapıp LAUNCHER'ı küçük bir trampoline activity'ye taşıyın. `EXTRA_AUTOFILL_SAVE_PASSWORD` (deprecated, düz metin şifre kabul eden yol) tamamen silinmeli — geriye dönük uyum için tutulan "canlı" bir kod yolu, saldırı yüzeyidir.

---

### K-2 · Paylaşım bağlantıları HKDF (hızlı KDF) ve 4 karakterlik minimum şifre kullanıyor; şifreli metin URL'de taşınıyor

**Dosya:** `src/lib/share.ts:26,60-75,113-131` *(doğrulandı)*

```ts
export const MIN_SHARE_PASSWORD_LENGTH = 4;

async function deriveShareKey(password: string, salt: Uint8Array) {
  const ikm = await crypto.subtle.importKey('raw', passwordBytes, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode('aegis-share-key-v7') }, ikm, 256));
}
return `${baseUrl}#share=${d}&s=${s}`;   // şifreli metin URL fragment'inde
```

Paylaşım bağlantısının **tüm güvenlik modeli** paylaşım şifresidir (anahtar kasıtlı olarak URL'de değil). HKDF bir *çıkarım* fonksiyonudur, şifre sertleştirme fonksiyonu değil: bir tahmin = bir HMAC-SHA256 extract + bir HMAC-SHA256. Modern bir GPU saniyede ~10⁹–10¹⁰ aday dener. 4 karakterlik ASCII alan uzayı ≈ 8×10⁷ — **satın alınabilir donanımda bir saniyenin altında** tükenir.

Şifreli metin ise URL *fragment*'inde, yani ekran görüntüsü, omuz sörü, tarayıcı senkronizasyonu ve paylaşım sekmesinden gidilen her sayfanın `Referer`'i üzerinden sızan kısımda.

Üstelik `decryptShareUrl` (`share.ts:171`) `expiresAt` kontrolünü **sadece başarılı çözme sonrasında, istemci tarafında** yapıyor. Fragment'i gören herkes çözebilir ve süreyi yok sayabilir. `useShareReceive.ts:65-78`'de deneme sayacı, gecikme veya kilitleme yok.

**Öneri:**
1. HKDF'i `deriveArgon2idKey` ile değiştirin (depoda zaten kullanılıyor) — `memoryKiB: 64*1024, iterations: 3`.
2. `MIN_SHARE_PASSWORD_LENGTH` ≥ 12 yapın ve zxcvbn skorlamasından geçirin (`security.ts:413`'teki `validateMasterPassword` deseni).
3. `useShareReceive`'de artan deneme sayacı + gecikme ekleyin.
4. `s=` parametresini AEAD içine AAD olarak bağlayın.
5. UI'da "süre sonu yalnızca tavsiye niteliğindedir, uygulanamaz" ifadesini açıkça belirtin.

---

### K-3 · Kasa veritabanı bütünlük HMAC'i başarısızlıkta yutuluyor → boş kasa gösteriliyor, sonraki yazma ile tahsis kalıcı olarak meşrulaştırılıyor

**Dosya:** `src/lib/sqlite_opfs.ts:490-502` (throw) ve `:548-551` (yutuyor) *(doğrulandı)*

```ts
490: if (this.state.integrityHmac && !shouldMigrateStaticSalt && !shouldMigrateKdf) {
492:   const isIntegrityValid = await verifyStateIntegrityHmac(this.state, hmacKey);
493:   if (!isIntegrityValid) {
500:     throw new Error('vault-database-integrity-corrupted');
501:   }
502: }
...
548: } catch {
549:   this.logQuery(queryStr, 'ERROR', 0);
550:   return [];                                    // ← bütünlük hatası burada ölüyor
551: }
```

Bu, kasa için **tek** müdahale algılama yoludur. Zincir şöyle işliyor:

1. Saldırgan (ya da bit rotası / kısmi yazma) `enc_metadata`'yı değiştirir veya satır siler.
2. Kullanıcı kilidi açar → `getVaultItems` → HMAC uyuşmazlığı → `throw` → **hemen 548. satırda yakalanır**.
3. `storage.getVaultItems()` (`storage.ts:607`) `[]` döner. `useVaultData.refreshDatabase` (`useVaultData.ts:37`) `setItems([])` çağırır. **Kullanıcı hatasız, uyarısız boş bir kasa görür.** Doğal tepkisi: bilgilerini yeniden girmek.
4. Daha kötüsü: bir sonraki kayıt tahsis kalıcı olarak aklar. `saveToPersistentStorage` (`:213-230`) `integrityHmac`'i **koşulsuz** yeniden hesaplar:

```ts
218:   const hmacKey = await deriveVaultHmacKey(key);
219:   this.state.integrityHmac = await computeStateIntegrityHmac(this.state, hmacKey);
```

**Öneri:** Bütünlük hatalarını genel `catch`'e hiç bırakmayın. Etiketli bir hata fırlatıp açıkça ele alın; `return []` yerine `vault-database-read-failed` fırlatın. `saveToPersistentStorage` içinde HMAC girdisine `sealedAtVersionCounter` koyun ve tekdüzelik (monotonluk) zorunlu kılın. Kullanıcıya "kasa bütünlük doğrulaması başarısız — anlık görüntüden geri yükleme yapın" diyen bir kurtarma ekranı gösterin.

---

### K-4 · Masaüstü/OPFS okuma hatası sessizce bayat IndexedDB aynasına düşüyor; sonraki kayıt gerçek kasayı eziyor

**Dosya:** `src/lib/sqliteOpfsPersistence.ts:105-120`, `src/lib/sqlite_opfs.ts:177-208`

```ts
107: try { desktopPayload = await readDesktopVaultDatabase(); }
109: catch (err) { logSecurityEvent(... 'trying local fallback.', 'warning', ...); }
116: return { kind: 'unavailable' };
120: const state = parseVaultDatabaseState(desktopPayload);   // JSON.parse — THROW edebilir, korumasız
```
```ts
203: if (result.kind === 'unavailable') {
205:   await this.migrateLegacyLocalStorage();     // bayat aynayı yetkili durum yüklüyor
```

Veri kaybına yol açan üç somut senaryo:

- **Boyut eşiği.** `src-tauri/src/lib.rs:320` okumada 25 MB üstünü reddediyor ama **yazmada kontrol yok** (`:334`). Kullanıcı 25 MB'yi geçer → sonraki kayıt *başarılı olur* → her sonraki açılış okumayı hata ile reddeder → `kind: 'unavailable'` → uygulama günler önceki aynayı gösterir → kullanıcı bir şifre düzenler → `persistVaultDatabase` 25 MB+ dosyayı bayat durumla **ezer**. Geri dönüşü yok.
- **Truncated / geçersiz UTF-8 dosya.** `fs::read_to_string` (`lib.rs:328`) geçersiz UTF-8'de başarısız olur → aynı zincir.
- **Bozuk JSON.** `parseVaultDatabaseState` çıplak `JSON.parse` (`vaultDatabaseFormat.ts:100`), `try/catch` yok → `sqlite_opfs.ts:177`'deki `.catch` yakalıyor → aynı zincir.

**Öneri:** `PersistedLoadResult` tipine `{ kind: 'unreadable'; reason: string }` ekleyin. `parseVaultDatabaseState` ile OPFS `file.text()` çevresine `try/catch` koyun, `unreadable` dönün ve bunu **sert başlangıç hatası** olarak ele alın — kilidi engelleyin, anlık görüntüden geri yüklemeyi önerin. `write_vault_database`'a da `MAX_VAULT_FILE_BYTES` kontrolü koyun (bkz. Y-17).

---

### K-5 · `persistVaultDatabase` hiçbir şey yazılmasa da başarı döndürüyor

**Dosya:** `src/lib/sqliteOpfsPersistence.ts:164-195, 201-226`

```ts
174:  if ('createWritable' in fileHandle) {          // ← ELSE YOK
175:    const writable = await fileHandle.createWritable();
176:    await writable.write(payloadStr);
177:    await writable.close();
178:  }
...
187: } catch (err) {
188:   logSecurityEvent(..., 'critical', ...);
194: }                                                 // yutuluyor, resolve ediyor
...
226: return true;                                      // ← koşulsuz
```

Üç ayrı gerçek kusur:

- **`else` dalı yok.** `createWritable` desteklemeyen her motorde (Safari <17, bazı WebKitGTK/WebView sürümleri) IIFE hiçbir şey yazmadan resolve olur ve `true` döner. **Her kayıt sessiz bir no-op**, UI başarı diyor.
- **Tüm OPFS hataları ve 1000 ms zaman aşımı yutuluyor** (`:187-194`). Masaüstü yazması da `false` döndürdüyse fonksiyon yine `true` dönüyor.
- **Masaüstünde OPFS ayna yazması "fire-and-forget"** (`:224 void ...`).

`saveVaultItemWithKey` (`sqlite_opfs.ts:619-622`) `persisted === true` gördüğü için geri alma yapmıyor; bellekteki durum kalıcı olarak diskten ayrılıyor.

**Öneri:** OPFS yolunu hata fırlatacak şekilde yazın (`'createWritable' in h` yoksa `throw`; `catch` içinde `writable.abort()` çağırıp `throw`). `persistVaultDatabase` her iki yazma da başarısız olduğunda `false` döndürsün. OPFS yazmalarını bir promise zinciriyle serileştirin (bkz. O-24 kilit sızıntısı).

---

### K-6 · wa-sqlite deposunda işlem serileştirmesi yok; eşzamanlı yazmalar birbirinin geri alınmasına yol açıyor

**Dosya:** `src/lib/waSqliteVaultStorageRepository.ts:422-432` — *dosyanın hiçbir yerinde mutex/kuyruk yok*

```ts
private async runTransaction(op: () => Promise<void>) {
  await this.executeRequired('BEGIN IMMEDIATE;');
  try { await op(); await this.executeRequired('COMMIT;'); }
  catch (error) { await this.engine.execute('ROLLBACK;'); throw error; }
}
```

`waSqliteEngine.ts` tek bir `db` tutamacı paylaşıyor. İki örtüşen `saveVaultItemWithKey`:

- A: `BEGIN IMMEDIATE` → satır yazdı → `await` (verir).
- B: `BEGIN IMMEDIATE` → *"cannot start a transaction within a transaction"* → B'nin `catch`'i **`ROLLBACK;` çalıştırır** → **A'nın commit edilmemiş işi silinir**.
- A: `COMMIT;` → *"cannot commit - no transaction is active"* → çağıran (`storage.ts:638`) sahte bir hata görür.
- **Net:** kullanıcının kaydı kaybolur ve nedeni gerçek nedenle ilgisiz gösterilir.

Ayrıca `WA_SQLITE_BOOTSTRAP_SCHEMA` içinde **tek PRAGMA** var: `foreign_keys = ON`. `busy_timeout` ve `journal_mode` yok — iki sekme aynı `IDBMinimalVFS` veritabanına yazarsa bekleme yerine anında `SQLITE_BUSY` alır.

**Öneri:** Tüm motor erişimini bir promise zinciriyle serileştirin:

```ts
let queue: Promise<unknown> = Promise.resolve();
function withDb<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn); queue = run.catch(() => {}); return run;
}
```

`ensureOpen`, `execute`, `executeReadOnly`, `close` sarmalayın; şemaya `PRAGMA busy_timeout = 5000;` ve `PRAGMA journal_mode = WAL;` ekleyin.

---

### K-7 · Otomatik yedekleme tamamen ölü kod — kasa hiçbir zaman otomatik yedeklenmiyor

**Dosya:** `src/hooks/useVaultSnapshots.ts:20` *(doğrulandı)*, `src/lib/snapshots.ts:444`

```ts
// useVaultSnapshots.ts:11-24
  checkAndTriggerAutoSnapshot,   // ← 20. satırda import edilmiş, HİÇ KULLANILMIYOR
```

Tüm depoda arama sonucu:

| Konum | Ne? |
|---|---|
| `useVaultSnapshots.ts:20` | import (kullanılmıyor) |
| `snapshots.ts:444` | tanım |
| `snapshots.test.ts:285, 294` | testler |

**Production'da tek bir çağıran yok.** `createVaultSnapshot('auto', ...)` hiçbir yerden çağrılmıyor; tek production çağrısı `useVaultSnapshots.ts:87` → `createVaultSnapshot('manual', label)`.

Bu, ESLint'in bildirdiği tek **hata**nın arkasındaki gerçek sorun ve veri kurtarma riskidir.

**Etki:** `SettingsSnapshotHistoryCard.tsx` tam çalışır görünen bir kontrol yüzeyi sunuyor — `autoEnabled` anahtarı, `on_lock | daily | weekly` frekans seçici, `maxSnapshots` saklama ayarı — hepsi `localStorage`'a yazılıyor, **hiçbirinin etkisi yok**. "Son otomatik yedekleme" rozeti `settings.lastAutoSnapshotTime`'ı okuyor, o da yalnızca `checkAndTriggerAutoSnapshot` içinde yazıldığı için kalıcı olarak *"Henüz otomatik yedekleme yok"* gösterir. Kullanıcı bu ekrana güveniyorsa **sıfır otomatik kurtarma noktası** vardır.

**Öneri:** `useVaultLock` içindeki `lock` fonksiyonunda, çözülmüş durumun yok edilmesinden **önce** çağırın:

```ts
const lock = useCallback(() => {
  void checkAndTriggerAutoSnapshot('lock');   // kendi hatalarını yutar
  closeVaultSession(); …
}, […]);
```

`daily`/`weekly` için `UnlockedApp` içine `setInterval` ekleyin. `autoEnabled: true` ile kilitlemenin `'auto'` kaydı ürettiğini doğrulayan bir regresyon testi ekleyin. Özellik tasarımı geri çekilecekse, sessiz işlevsiz UI yerine UI'ı da kaldırın.

---

## 4. Yüksek Öncelikli Bulgular (24)

### 4.1 Güvenlik / Kriptografi

**Y-1 · Biometrik kilidi açma, kaba kuvvet kilitlemesini tamamen atlıyor**
`src/components/LockScreen.tsx:161-188` vs `:232-263` *(doğrulandı)*

```tsx
// parola yolu — kilitleme UYGULANIYOR
232: const remainingMs = getLockoutRemainingMs();
233: if (remainingMs > 0) { triggerShake(); setError(getRateLimitMessage(remainingMs)); return; }
259:   const lockout = recordFailedUnlockAttempt();

// biometrik yolu — kilitleme YOK, sayacı ARTIRMIYOR
176: if (await verifyMasterPassword(decryptedMaster, effectiveSecretKey)) { onUnlock(); }
```

WebAuthn-v4 kaydında kısıtlayıcı faktör `userVerification: 'required'`. **Authenticator'lar assertion'a deneme sayacı koymaz** — parmak basılı tutulur, istekler sınırsız üretilir. Telefona kısa süreli fiziksel erişimi olan bir saldırgan, biometrik yol üzerinden **sıfır hız sınırıyla** sınırsız ana şifre adayı gönderir. Kilit ekranındaki üstel geri çekilme bu yolda tamamen alakasız.

**Öneri:** Korumayı bir yardımcıya taşıyıp **her iki yolda da** `verifyMasterPassword`'tan önce uygulayın; biometrik başarısızlığında `recordFailedUnlockAttempt()` çağırın. Otomatik prompt'u kilitleme aktifken devre dışı bırakın.

**Y-2 · Kurtarma modalı kapatıldıktan sonra çözülmüş düz metin ana şifre React state'inde kalıcı olarak tutuluyor**
`src/components/lock/LockScreenRecoveryModal.tsx:44,67` + `LockScreen.tsx:738-743`

`useState` hook'ları `if (!isOpen) return null;`'den **önce** çalışıyor; modal kapanmak bileşeni **unmount etmiyor**, dolayısıyla state sıfırlanmıyor. Kullanıcı 24 kelimeyle ana şifresini kurtardıktan sonra vazgeçerse, çözülmüş ana şifre kilitli `LockScreen`'in kalan ömrü boyunca React fiber'ında değişmez bir JS string'i olarak duruyor. Aynı şekilde `recoveryInputWords` ve `recoveryNewPassword` için de geçerli. `useSensitiveReveal` tam olarak bu disiplini uygulamak için var; modal onu atıyor. Deponun kendi tasarım ilkesi (`vaultSession.ts:330-338`: *"oturum sırları yalnızca sıfırlanabilir bayt klonları olarak, JavaScript string'i olarak asla"*) burada ihlal ediliyor.

**Öneri:** `isOpen === false` branch'inde erken dönüşten **önce** üç alanı da sıfırlayın; daha iyisi `recoveredMasterPassword`'ı bir `useRef<Uint8Array>`'da tutup kapanışta sıfırlayın.

**Y-3 · Kurtarma anahtarı, ana şifre değişiminden sonra geçersizleştirilmiyor veya döndürülmüyor**
`src/lib/recoveryKey.ts` (tüm dosya) + `src/lib/storage.ts:411-536`

`disableRecoveryKey()` yalnızca ayarlar arayüzünden, kullanıcı tetiklemesiyle çağrılıyor (grep ile doğrulandı). **`changeMasterPassword` kurtarma paketine hiç dokunmuyor.**

Kurtarma paketi, ana şifrenin Argon2id(24 kelime, 256-bit entropi) altında mühürlenmiş yerel bir emanet kopyasıdır. Ana şifre ele geçirildiyse ve kullanıcı belgelenen "kurtar + yeni şifre belirle" düzeltmesini uygularsa, saldırganın elindeki 24 kelime **hâlâ eski ana şifreyi çözer** ve `isRecoveryKeySetup()` hâlâ `true` döner, yani UI çalışan bir kurtarma yolu olduğunu vaat etmeye devam eder. Kullanma işareti, anahtar döndürme adımı, `createdAt` güncellemesi yoktur.

**Öneri:** `changeMasterPassword` içinde başarılı rotasyondan sonra `disableRecoveryKey()` (veya daha iyisi `rotateRecoveryBundle`) çağırın. `RecoveryKeyBundle` içine `usedAt`/`rotatedAt` alanı ekleyin. Savunma derinliği olarak, `bundle.masterHash` artık `user_secrets[0].argon_hash` ile eşleşmiyorsa `recoverWithRecoveryKey`'yi başarısız yapın — böylece bayat paket dosya hayatta kalsa bile fail-closed olur.

**Y-4 · Bütünlük HMAC'i `kdfParams` alanını kapsamıyor → KDF gücü sessizce düşürülebiliyor**
`src/lib/vaultDatabaseFormat.ts:111-117` *(kısmi doğrulandı)*

```ts
return JSON.stringify({
  appId, schemaVersion, encryption_salt, versionCounter,
  user_secrets: sortedSecrets.map(...),
  vault_items: sortedItems.map(...),
});
// kdfParams YOK
```

`kdfParams` tam olarak `sqlite_opfs.ts:417-420`'de her ana türetmeden önce `enforceMinimumKdfFloor`'a beslenen alan. `aegis_sqlite.db`'ye yazma erişimi olan herkes tek bir alanı düzenleyebilir:

```json
"kdfParams": { "memoryKiB": 8192, "iterations": 3, ... }
```

`computeCanonicalStateString` bayt bayt aynı kalır, `verifyStateIntegrityHmac` `true` döner, bütünlük sistemi "temiz" der — ama sonraki her kilit açma 64 MiB yerine 8 MiB Argon2id ile türetir. **4–8× kaba kuvvet maliyeti düşüşü, bütünlük kontrolü aktifken.** `MIN_ARGON2ID_MEMORY_KIB = 8192` (`argon2id.ts:48`) olduğu için 8192 sessizce geçiyor.

**Öneri:** `kdfParams` ve `migratedFrom` alanlarını kanonik stringe ekleyin (HMAC `info` etiketini `v2` yapın, böylece eski durumlar ilk başarılı kilitte yeniden imzalanır, yanlışlıkla reddedilmez).

**Y-5 · Bütünlük doğrulaması, saldırganın kontrolündeki alanlara bağlı koşullu — alan silerek atlanıyor**
`src/lib/sqlite_opfs.ts:490` + `sqliteOpfsMigration.ts:74` + `vaultDatabaseFormat.ts:86-96`

```ts
if (this.state.integrityHmac && !shouldMigrateStaticSalt && !shouldMigrateKdf) { ... doğrula ... }
```

HMAC anahtarı kasadan türetir, dosyadan değil — iyi tasarım. Ama koruma **saldırganın tamamen kontrolündeki alanlara bağlı**. `normalizeVaultDatabaseState` `integrityHmac`'i herhangi bir string olarak kabul ediyor, yani `"integrityHmac": ""` atamak kontrolü falsy yapıp tamamen atlatıyor.

Daha temiz bir atlatma yolu var: `shouldMigrateKdf = !state.kdfParams`, `shouldMigrateStaticSalt = !state.encryption_salt` (`sqlite_opfs.ts:447-448`). Saldırgan JSON'dan **`kdfParams` ve `encryption_salt` alanlarını silerse** iki bayrak da `true` olur, tüm `if` koşulu `false` olur, **bütünlük doğrulaması atlanır** — ve uygulama "yardımlı olmak için" yeni rastgele tuz üretip veritabanının tamamını yeniden şifreleyip kaydeder. Değiştirilmiş durum, taze imzalı bir duruma aklanır. Satır silme, satır yeniden sıralama, `argon_hash` değiştirme ve `versionCounter` şişirme — hepsi iki JSON anahtarı silindiği sürece algılanamaz.

**Öneri:** `user_secrets.length > 0` için `integrityHmac` varlığını **zorunlu** kılın:

```ts
if (this.state.user_secrets.length > 0 && !this.state.integrityHmac) {
  throw new Error('vault-database-integrity-missing');
}
```

HMAC'i göç bayrakları değerlendirilmeden **önce** doğrulayın. `versionCounter` geri alma tespitini kasa dosyası dışında kalıcı tutun.

**Y-6 · Otomatik kilitleme, arka plana alınmış pencere öne döndüğünde uygulanmıyor**
`src/hooks/useRuntimeSecurity.ts:87-94` + `src/App.tsx:17,20-26`

```ts
const handleVisibilityChange = () => {
  if (document.hidden) { shieldAndScheduleLock(); }
  else { clearLockTimer(); setPrivacyShieldVisible(false); }   // ← son tarih kontrolü YOK
};
```

`useAutoLock` bunu **doğru** yapıyor: `visibilitychange`'de açıkça `Date.now() >= deadline` kontrol ediyor (`useAutoLock.ts:60-72`). `useRuntimeSecurity` — hangisi *arka plan* kilit zamanlayıcısına sahip — tam tersini yapıyor: öne dönerken **koşulsuz** `clearLockTimer()` çağırıyor. Tarayıcı zamanlayıcıyı kısarken veya askıya alırken bekleyen kilit sessizce iptal ediliyor ve kasa açık kalıyor.

İkinci sorun: `MIN_BACKGROUND_LOCK_DELAY_MS = 60_000`, yani "15 saniye" veya "30 saniye" seçen kullanıcı bile arka plan için **60 saniye** açık kasa elde ediyor. Bir güvenlik ayarı UI'ın söylediğini yapmıyor.

**Öneri:** `backgroundDeadline` değişkeni tutup öne dönerken `Date.now() >= backgroundDeadline` ise kilitleyin. `MIN_BACKGROUND_LOCK_DELAY_MS`'ı 0'a (veya yapılandırılan süreye) indirin.

**Y-7 · Ham kasa anahtarına koşulsuz geri düşüş, satır çözümlemesinde sessiz bir downgrade ve çözme oracle'ı yaratıyor**
`src/lib/sqliteOpfsRowDecryptor.ts:105-137`

```ts
try { decryptedJson = await webCryptoAesGcmDecrypt(encryptedPayload, itemKey); }
catch {
  // Pre-HKDF satırlar ham derived key ile şifrelenmişti. Geri düşüş satır başına bir kez
  // izinlidir: satır hemen aşağıda per-item key ile yeniden şifrelenir.
  decryptedJson = await webCryptoAesGcmDecrypt(encryptedPayload, derivedKey);
  usedLegacyMasterKeyFallback = true;
}
```

Her satır `HKDF(vaultKey, salt=row.id)` ile mühürlenmeli, böylece tek bir satır anahtarının ele geçirilmesi kasa anahtarını ele geçirmez. Bu catch-all **ham `derivedKey` yolunu süresiz, sürüm kapısı olmadan, "bu gerçek bir legacy satır mı" ayrımını gösteren kalıcı bir işaret olmadan** yeniden açıyor.

Veritabanına yazma erişimi olan saldırgan, bir satırın `enc_metadata`'sını ham kasa anahtarıyla şifrelenmiş bir blob ile değiştirir; uygulama bunu kabul eder, **sessizce per-item key'e yeniden anahtarlar** ve diske yazar — kimliksiz bir downgrade'u "geçerli" bir satıra aklar. Ayrıca bir çözme oracle'ıdır: yanlış `derivedKey` ilk denemede GCM etiket hatası, ikinci denemede tıpatıp aynı hata üretir (ayırt edilebilir sinyal yok), ama iki denemeli yapı zamanlama üzerinden dışarıdan gözlenebilir.

**Öneri:** Geri düşüşü göçün kendisinin yazdığı değişmez, satır bazlı bir sürüm alanına bağlayın (`enc_kdf === 'legacy-raw-master-key'`). Tüm satırların HKDF'ye taşındığını söyleyen bir su isareti (`state.rowMigrationEpoch`) geldikten sonra **daldı tamamen silin**. En azından, `id`'si göç öncesi anlık görüntüde bulunmayan satırlar için geri düşüşü reddedin.

**Y-8 · Android biometrik sarmalama sırrı, donanım kimlik doğrulamasına bağlanmadan saklanıyor (ana şifre emaneti)**
`src/lib/biometric.ts:544-550, 600-639`

```ts
if (isBiometricAndroidBridgeAvailable()) {
  const handle = await wrapAndroidBiometricSecret(wrappingSecret);   // auth-bound ✔
} else {
  await authenticateNativeBiometric();
  setSecureStorageItem(biometricWrappingSecret, bytesToBase64(wrappingSecret)); // ham base64
}
```

`registerBiometric`, **ana şifreyi** (ve hesap sır anahtarını) `bundle` içine mühürler. Bundle'ın AES anahtarı `PBKDF2(wrappingSecret, salt, 600_000)`. Legacy yolda `wrappingSecret`, genel (auth-bound olmayan) AndroidKeyStore anahtarıyla korunan **ham base64** olarak yazılır. Sonuç: biometrik paketi tamamen çevrimdışı çözülebilir bir **ana şifre emanetidir**; saldırgan uygulamanın özel depolamasına ve auth-bound olmayan Keystore anahtarını çağırma yetkisine sahipse **hiçbir biometrik istemi olmadan** ana şifreyi geri alır. `isBiometricHardwareBound()` (`:338-346`) bu durum için doğru şekilde `false` dönüyor ve `hydrateBiometric` (`:224-228`) güvensiz v2 kayıtlarını zaten düşürüyor — ama "v3 ve bridge yok" kabul ediliyor. `RUST-O5` tembel rotasyonu (`:584-592`) yalnızca **başarılı kilit açmadan sonra** tetiklendiği için, yeni yolda hiç açılmamış bir kasa zayıf depolamada kalır.

**Öneri:** `!isBiometricAndroidBridgeAvailable()` iken yerel biometrik kaydını **reddedin** (fail-closed — `registerNativeBiometric` zaten `!isSecureStorageAvailable()` için bunu yapıyor). Legacy destek kalacaksa rotasyonu ilk başarılı kilit yerine ilk uygulama açılışında zorunlu kılın ve `isBiometricHardwareBound() === false` durumunu UI'da belirgin gösterin.

**Y-9 · Rust tarafındaki oturum, JS kalıcılıktan **önce** döndürülüyor → sınır ötesi oturum ayrışması**
`src-tauri/src/credential_handler.rs:264-285` + `src/lib/storage.ts:424-480`

`rotate_rust_session` yeni kimlik bilgisi + yeni kasa anahtarını Rust oturumuna anında işler ve döner. **Ancak bundan sonra** JS eklentileri yeniden şifreler (`:447`), yeni argon hash / tuz / yeniden sarılmış satırları kalıcılaştırır (`:459-460`) ve `openVaultSession` çağırır (`:476`). JS kuyruğundaki herhangi bir hata, **Rust** oturumunda yeni, **JS** oturumunda ve diskte eski değerlerle bir split-brain bırakır: `has_rust_session`/`rotate_rust_session` yeni şifreyi kabul eder, diskteki kasa yalnızca eski anahtarla açılabilir. Başarısız rotasyon atomik değildir. JS tarafı eklenti geri alımını deniyor (`:467-470`) ama Rust tarafında karşılığı yok.

**Öneri:** Rotasyonu iki fazlı yapın: `rotate_rust_session` `state`'i **değiştirmeden** yeni materyali hesaplayıp döndürsün, JS kalıcılığı başarılı olduktan sonra ayrı bir `commit_rust_rotation` komutu uygulasın. En azından JS kuyruğunu `close_rust_session()` çağıran bir `try/catch` ile sarın.

### 4.2 Veri Bütünlüğü / Senkronizasyon

**Y-10 · Senkronizasyon aynı günkü tüm uzak düzenlemeleri sessizce atıyor, sonra uzağın üzerine yazıyor**
`src/lib/sync/syncEngine.ts:183-189` + `sqlite_opfs.ts:382,389` (tarih-yalnızca zaman damgaları)

```ts
const latestLocalTs = localItems.reduce((max, i) => Math.max(max, new Date(i.updatedAt ?? i.createdAt).getTime()), 0);
const remoteTs = new Date(remoteMetadata.updatedAt).getTime();
if (remoteTs > latestLocalTs || localItems.length === 0) { /* indir */ }
```
```ts
// sqlite_opfs.ts:382 — zaman damgası çözünürlüğü 24 SAAT
updatedAt: new Date().toISOString().split('T')[0] ?? '',
```

Zaman damgası çözünürlüğü 24 saat ama indirme kapısı katı `>` kullanıyor:

1. Cihaz A ve B'de `X` öğesi `updatedAt = "2026-09-26"`.
2. 09:00'da A'da `X.password` düzenlenir.
3. 15:00'te B'de `X.notes` düzenlenir.
4. B senkronize eder. `remoteTs` (`"2026-09-26"` → `T00:00:00Z`) `latestLocalTs`'den **`>` değil**. İndirme **tamamen atlanır**.
5. B kendi durumunu yükler. **A'nın 09:00 şifre değişikliği yok edilir** — çakışma yok, uyarı yok, `syncStatus: 'success'`.

`resolveLWWConflicts` içindeki 5 saniyelik sezgisel de yardımcı olmaz: yalnızca `remoteTs > localTs` dalının **içinde** çalışır, yani eşit zaman damgaları hiç bildirilmez.

**Öneri:** (a) `updatedAt` tam hassasiyetli ISO-8601 saklayın (okurken mevcut `YYYY-MM-DD` değerlerini göç edin). (b) Cihaz başına monotonik bir revizyon sayacı tutun. (c) Kapıyı her zaman uzak blob'u indirmeye çevirin, `lastSyncedRemoteChecksum` farklıysa indirin. (d) `remoteTs === localTs` durumunu "sessiz yerel kazanır" değil, **çakışma** olarak ele alın.

**Y-11 · İndirme atlandığında veya meta veri okunamadığında `performSync` koşulsuz yerel durumu yeniden yüklüyor — uzak yedek yok oluyor** — ✅ **KAPANDI (bkz. §1.7)**
`src/lib/sync/syncEngine.ts:179-233`, `webdavProvider.ts:201-206`, `s3Provider.ts:286-290`

```ts
try { return (await res.json()) as SyncMetadata; }
catch { return null; }   // Bozuk meta veri — uzak yok sayılsın
```

`metadata.json` ve `vault.aegis` **iki bağımsız** `PUT`. `getRemoteMetadata()` `null` dönerken `vault.aegis` sağlam ve daha yeni olabilir: meta veri yazımı başarısız olup vault yazımı başarılı olmuşsa; bir üçüncü taraf (Nextcloud istemcisi, `rclone`, S3 lifecycle kuralı) yalnızca `metadata.json`'a dokunmuşsa; `updatedAt` ayrıştırılamayan bir string ise.

Tüm bu durumlarda `mergedItems === localItems`, istemci yerel kasasını uzakkinin üzerine `PUT` eder ve `status: 'success'` raporlar. Kullanıcının cihaz dışı tek yedeği artık bu cihazın ne tuttuğunun bir kopyasıdır ve önceki uzak durum kurtarılamaz. `ETag`/`If-Match` ön koşulu, nesil sayacı, kullanıcı onayı yok.

**Öneri:** (a) Koşullu yazma: okuma sırasında uzak `ETag`'i yakalayın, `PUT`'ta `If-Match` gönderin; değiştiyse iptal edip çakışma bildirin. (b) Uzak durum *bilinmiyorken* asla üzerine yazmayın — `404`'ü (gerçekten boş) ayrıştırılamayan/`500`'den ayırın. (c) Yerelde `lastUploadedChecksum` tutun.

**Çözüldü:** (a) ve (b) uygulandı. `getRemoteMetadata` artık `absent` / `unreadable` / `ok` ayrımı döndürüyor; `unreadable` durumunda `performSync` hiçbir yazma yapmadan `sync.remoteStateUnknown` ile duruyor. Yazma okunan `ETag` ile koşullu (`If-Match`); 412/409 artık `sync.remoteModified` ve hiçbir şey ezilmiyor. (c) olarak `SyncResult.uploadedETag` eklendi. 17 regresyon testi.

**Y-12 · wa-sqlite terfisi sonrası oturum/Rust kasa anahtarı *göç öncesi* anahtar kalıyor, hedefinki değil** — ✅ **KAPANDI (bkz. §1.8)**
`src/lib/storage.ts:565-578`

`runVaultStorageMigration` hedef deposunda `setupMaster(masterPasswordPlain)` çağırıyor ve wa-sqlite uygulaması **marka yeni rastgele bir tuz** üretiyor (`waSqliteVaultStorageRepository.ts:131-137`). Yani hedef `Argon2id(credential, newSalt)` ile şifreli, `existingKey` ise `Argon2id(credential, oldOpfsSalt)`. `if (existingKey)` dalı **her zaman** doğru (göç etkin bir oturum gerektirir), dolayısıyla `updateActiveVaultEncryptionKey` **yanlış** anahtarı Rust oturumuna itiyor.

**Etki:** "terfi edildi" bildiriminin hemen ardından, masaüstünde ilk `changeMasterPassword` `oldVaultKey`'i oturumdan alıp `changeMasterPasswordWithHash` çağırıyor; wa-sqlite deposu her satırı `oldVaultKey` ile çözmeye çalışıyor, başarısız oluyor, `:492` ilk satırda `WA_SQLITE_ROW_DECRYPT_ERROR` fırlatıyor. **Kullanıcı ana şifresini değiştiremiyor** ve her satır okuması bir çözme hatası kaydediyor. `storage.ts:466-474` sonra uyuşmayan anahtarlarla ek rotasyonunu deneyerek durumu kötüleştiriyor.

**Öneri:** Terfiden sonra **her zaman** yeni aktif depodan yeniden türetin: `updateActiveVaultEncryptionKey(await getVaultStorageRepository().deriveEncryptionKey(credential))`. `existingKey` kısayolunu tamamen silin — kısayolun kendisi hatayı yaratıyor.

**Çözüldü:** Öneri birebir uygulandı; kısayol tamamen kaldırıldı. Kısayolun SEC-B3 gerekçesi gerçek değildi — `credential` zaten bu kapsamda çözülmüş ve `else` dalı aynı türetmeyi zaten yapıyordu. Türetme hatası artık yutulmuyor. 5 regresyon testi; 4'ü mutasyonla kırıldığı doğrulandı.

**Y-13 · Depo geri yükleme hatası terfi işaretini siliyor — kurtarılabilir durum kalıcı kasa kaybına dönüşüyor** — ✅ **KAPANDI (bkz. §1.9)**
`src/lib/vaultStorageProvider.ts:161-181`

```ts
try { await repository.hydrate(); replaceActiveVaultStorageRepository(repository, …); return true; }
catch { clearPersistedActiveVaultStorageBackend();   // ← geri alınamaz
        return false; }
```

Geçici bir `hydrate()` hatası (WASM fetch 500, anlık görüntüler origin kotasını doldurduğu için `QuotaExceededError`, sekme geri yüklemesi yarışı) `catch`'e düşüyor. İşaret hem IndexedDB'den hem localStorage'dan siliniyor, fonksiyon `false` dönüyor ve uygulama **boş veya bayat** OPFS deposunu sunuyor. wa-sqlite veritabanı sahipsiz kalıyor ve onu arayan hiçbir kod yolu yok. **Kullanıcının kasası UI'dan kayboluyor, hata gösterilmiyor.**

**Öneri:** `clearPersistedActiveVaultStorageBackend()` yalnızca `incompatible-marker` (şema/sürüm uyuşmazlığı) için çağrılsın. `temporarily-unavailable` durumunda işareti koruyun, "depolama kullanılamıyor — kasa yüklenmedi" hatası gösterin ve yeni kasa kurulmasını engelleyin.

**Çözüldü:** Önerinin tamamı uygulandı ve bir adım öteye gidildi. `catch` içindeki temizlemenin **hiçbir zaman meşru olmadığı** görüldü: uyumsuz işaretler zaten okuma sırasında `readPersistedActiveVaultStorageBackend` tarafından siliniyor, dolayısıyla `catch`'e ulaşan tüm hatalar geçicidir. `unavailable` durumu eklendi, işaret korunuyor, aktivasyon dalına düşülmüyor (boş yedek kasayı üreten yol fiziksel olarak kapalı) ve `VaultStorageUnavailableError` + ayrı bir yeniden deneme ekranı ile yüzeye çıkarıldı. 11 yeni test, 2 ayrı mutasyonla doğrulandı.

**Y-14 · Kasa okuması, geri alınamaz 15 günlük çöp temizliği yapıyor; çöp işlemleri senkronize edilmemiş okuma-değiştir-yaz** — ✅ **KISMEN KAPANDI (bkz. §1.10)**`src/lib/storage.ts:607-632, 660-687`

**Bir okuma fonksiyonu geri alınamaz çok satırlı silme yapıyor.** `getVaultItems()` 15 günden eski çöplü öğeleri kalıcı olarak siliyor. Bu fonksiyon `createVaultSnapshot` (`snapshots.ts:97`), `restoreVaultSnapshot` (`:262`), `moveToTrash`/`restoreFromTrash` (`:662/678`) ve `useVaultData.refreshDatabase` tarafından çağrılıyor — hepsi 15 günlük çöplü öğeleri sessizce ve kalıcı olarak yok edebilir. Anlık görüntü yok, onay yok, kullanıcıya günlük yok.

Ayrıca `moveToTrash`/`restoreFromTrash`/`emptyTrashComplete` "tümünü yükle → birini değiştir → birini kaydet" deseninde. Sekmeler arası koordinasyon olmadığı için (Y-15) iki sekme birbirine karışır ve **kayıp güncelleme** olur; `moveToTrash` ayrıca okuduğu öğenin **tamamını** yeniden kaydediyor, diğer sekmede değişen alanları geri alıyor.

`withSessionVaultKey([], …)` oturum kapalıyken `[]` döndürüyor ve `useVaultData.saveItem` koşulsuz `setItems(updated)` çağırıyor — otomatik kilitlemeden sonra gönderilen bir kayıt **UI listesini boşaltıyor** hiçbir şey yazmadan.

**Çözüldü (ilk iki iddia):**

1. **Yıkıcı okuma kapandı.** `getVaultItems()` artık saf bir okuma. Temizlik ayrı, açık, günlüklü `purgeExpiredTrashItems()` işlemine taşındı ve yalnızca `useVaultData.refreshDatabase` tarafından bir kez çağrılıyor. Snapshot/senkronizasyon/passkey/içe aktarma yolları yapısal olarak temizliğe **ulaşamaz** artık. Her geri alınamaz silme `storage.trashRetention.purged` olayı kaydediyor. 12 test, 1 mutasyonla doğrulandı.
2. **Kilitleme sonrası boşalan liste kapandı.** `useVaultData.saveItem`/`saveItems`/`toggleFavorite` yazma sonucunu yalnızca oturum açıkken UI'ye uyguluyor. 4 test, 1 mutasyonla doğrulandı.

**Kalan (Y-15 kapsamı):** `moveToTrash`/`restoreFromTrash`/`emptyTrashComplete` hâlâ "tümünü yükle → birini değiştir → birini kaydet" deseninde; aynı satır üzerinde eşzamanlı yazma sessizce son yazanın kazanmasına açık → Aşama 2 #37.

**Y-15 · Hiçbir sekmeler arası koordinasyon yok; rollback tespiti üretimde ölü kod** — ✅ **KISMEN KAPANDI (bkz. §1.11)**
`src/lib/sqlite_opfs.ts:1014` (modül singleton'ı), `sqliteOpfsPersistence.ts:65-99`

`navigator.locks`, `BroadcastChannel`, `storage` event dinleyicisi için `src/` taraması **sıfır** eşleşme. Ama: `sqliteOPFSInstance` tüm kasayı bellekte tutan bir modül singleton'ı; arka depo paylaşımlı (`aegis_sqlite.db`, `aegis_setup_db`, `aegis_snapshots_db`, wa-sqlite VFS veritabanı); `saveToPersistentStorage` **tüm** durum blob'unu yeniden yazıyor — kayıt bazlı birleştirme veya `versionCounter` karşılaştırmalı-atomik yazma yok.

İki sekme açık, ikisi de kilitli. Sekme A bir kimlik bilgisi ekliyor; sekme B (bellekteki durumu yükleme anından) ilgisiz bir öğe kaydediyor → `persistVaultDatabase` sekme B'nin **tüm bayat anlık görüntüsünü** yazıyor, **sessizce** sekme A'nın kimlik bilgisini geri alıyor. `versionCounter` bunu yakalayabilirdi ama değer modül-global (`let lastObservedVersionCounter = 0`) ve `setLastObservedVersionCounter` **yalnızca testlerden** çağrılıyor — taze sayfa yüklemesinde `0` olduğu için `:86`'daki koruma (`lastObservedVersionCounter > 0 && …`) hiç tetiklenmiyor. **`useVaultRollbackAlert` asla uyarı göstermiyor. Rollback tespiti üretimde ölü kod.**

**Öneri:** (1) Yüksek su `versionCounter`'ı IndexedDB'de (modül belleğinde değil) saklayın ve her yüklemede karşılaştırın. (2) Her yazmayı `navigator.locks.request('aegis-vault-write', …)` ile koruyun; yoksa `versionCounter` üzerinde karşılaştırmalı-atomik yazma. (3) Başarılı her commit sonrası `BroadcastChannel('aegis-vault')` ile `{versionCounter}` yayınlayın.

**Çözüldü (bulgular ve teknik itiraz):** Dört iddia da teyit edildi. (1) zaten Y-5'te yapılmıştı, ancak **yalnızca yazma yolu** onu kullanıyordu; yükleme yolu modül-globaline bakıyordu ve bu değişken taze sayfa yüklemesinde `0` olduğu için rollback tespiti hiç tetiklenmiyordu — `useVaultRollbackAlert` ölü koddu. Tespit artık aynı kalıcı işareti kullanıyor, dolayısıyla kapıyla uyumlu.

(2) ve (3) için bir teknik itiraz kayda geçti: **raporun önerdiği kilit tek başına yeterli değildi.** `navigator.locks` yazmaların iç içe geçmesini engeller ama bayt B hâlâ bayt 10'daki bellek kopyasından tüm blob'u yeniden yazar; yani kilit tazelik sağlamaz. Bu yüzden `vaultWriteCoordination.ts` iki bağımsız mekanizma içeriyor: serileştirme **ve** taban karşılaştırması. İkincisi veri kaybını fiilen engelleyen kısım; çünkü başka bir sekmenin meşru yazması geçerli bir HMAC üretir ve K-3/Y-5 bütünlük kapısı onu göremez.

28 test, 1 mutasyonla doğrulandı. **Kalan:** çakışma UI'ı ve otomatik yeniden yükleme tüketicisi → Aşama 2 #37.

### 4.3 Mobil / Yerel IPC

**Y-16 · IPC'den gelen Argon2id maliyet parametrelerinde üst sınır yok → süreç abort (DoS)** — ✅ **KAPANDI (bkz. §1.12)**
`src-tauri/src/credential_handler.rs:18-26` (ve `lib.rs:623-645`)

```rust
let mem   = self.memory_kib.unwrap_or(32 * 1024).max(8192);   // sadece ALT sınır
let time  = self.iterations.unwrap_or(3).max(3);
let lanes = self.parallelism.unwrap_or(1).max(1);
let key_len = self.hash_length.unwrap_or(32).max(32);
```

Doğrulandı: `argon2-0.6.0/src/params.rs:55` `MAX_M_COST = u32::MAX` bildiriyor ve 143. satır *"we don't need to check `MAX_M_COST`, since it's `u32::MAX`"* yorumunu taşıyor — yani `Params::new` **hiç** üst sınır doğrulaması yapmıyor.

Webview'da çalışan herhangi bir JS (bir nottaki XSS, kötü niyetli eklenti içerik betiği, ele geçirilmiş `dist/` varlığı) `invoke('derive_argon2id_key', { …, options: { memoryKiB: 4294967295 } })` çağırır. `Params::new` kabul eder; KAT ~4 TiB blok belleği tahsisi dener. Rust'ın tahsis hatası yolu `handle_alloc_error` → **abort** (unwind değil). Release profilinde `panic = "abort"` (`Cargo.toml:57`) olduğundan süreç anında ölür ve **çözülmüş bellekteki kasa kaybolur**. `hashLength: 4294967295` aynı sonucu 4 GiB'lık çıktı tamponuyla veriyor. `derive_argon2id_key` hiçbir `State<'_, CredentialSession>` taşımadığı için **bu komutların hiçbiri oturum açmayı gerektirmiyor**.

**Öneri:** `to_params()` içinde sert tavan uygulayın (`mem.clamp(8*1024, 1024*1024)`, `time.clamp(3,16)`, `lanes.clamp(1,8)`, `key_len.clamp(32,64)`); sessiz clamp yerine aralık dışı değerler hata döndürsün. Her ana türetme komutunu etkin oturumun arkasına alın.

**Y-17 · `write_vault_database` boyut sınırı koymuyor, `read_vault_database` 25 MB'de sınırlıyor → kendi kendine kilitlenme**
`src-tauri/src/lib.rs:10, 320-326, 333-337`

Okuma yolu 25 MB'de sınırlı, **yazma yolu sınırsız**. Bozuk bir içe aktarma, koşan bir autosave döngüsü veya enjekte edilmiş JS 30 MB'lık bir veritabanı yazar. Yazma başarılı olur (atomik, `fsync` ile). Bir sonraki açılışta okuma reddeder ve **kullanıcı kasasını bir daha hiç açamaz** — Rust katmanında hiçbir kırpma, göç veya aşırı-büyük-okuma yedeği yok. 25 MB'a yaklaşan ekleri olan büyük bir kasa için bu varsayımsal değil, gerçekçi.

**Öneri:** `write_vault_database` içinde `contents.len()` için de `MAX_VAULT_FILE_BYTES` kontrolü koyun. Daha iyisi, yalnızca bir göç yolu varsa okuma tavanını yükseltin ve "çok büyük" ile "bozuk" ayrımı için başlangıçta satır sayısını okuyun.

**Y-18 · Loopback IPC sunucusunda okuma zaman aşımı yok ve bağlantı başına sınırsız iş parçacığı → yerel kaynak tükenmesi** — ✅ **KAPANDI (bkz. §1.13)**
`src-tauri/src/native_messaging.rs:315-380, 605-643`

Hız sınırlayıcı **yeni bağlantıları** 5/sn ile sınırlıyor ama **eşzamanlı bağlantı sayısı** ve boşta kalma zaman aşımı yok. Dosyada `set_read_timeout` eşleşmesi **sıfır**. `handle_client` içinde `read_exact` kalıcı olarak bloklanıyor.

Aynı kullanıcı olarak çalışan herhangi bir süreç (veya loopback SSRF yapan yerel bir web sayfası, veya kötü niyetli eklenti) saniyede 5 TCP bağlantısı açıp hiçbir şey göndermeden kapatabiliyor. Her bağlantı sonsuza dek bloklanan bir iş parçacığını sabitliyor; Rust'ın varsayılan iş parçacığı yığını 2 MiB adres alanı ayırıyor. Saatlik 18.000 boşta iş parçacığı önemsiz; el sıkışma token'ı doğrulanmadan **önce** gerçekleştiği için kimlik bile gerekmiyor. `panic = "abort"` ile zarif bozulma da yok.

**Öneri:** `accept` sonrası hemen `stream.set_read_timeout(Some(Duration::from_secs(30)))` ve `set_write_timeout` uygulayın. `thread::spawn` yerine semaphore korumalı sınırlı bir havuz kullanın, havuz doluyken bağlantıyı reddedin. Windows'ta Unix soketi / named pipe'e geçmeyi değerlendirin.

**Y-19 · Yayın işlem kod imzalamıyor ve imza kapısı hiç çalıştırılmıyor** — ⚠️ **KISMEN KAPANDI (bkz. §1.13)** — bulgunun "kapı hiç çalıştırılmıyor" iddiası **eskimişti**: kapı üç işte de `--require-signed` ile bağlıydı. Kalan gerçek sorun imzalamanın kendisiydi.
`.github/workflows/release-desktop.yml:144-148, 213-217` · `scripts/desktop-signing-report.cjs`

```yaml
env:
  APPLE_SIGNING_IDENTITY: "-"      # ad-hoc: kimlik yok, notarization yok
```

Beş workflow'taki her `run:` adımı sayıldı: `npm run desktop:release:signing:report`, `desktop:release:gate` ve `android:release:gate` **hiç** çağrılmıyor. `desktop-signing-report.cjs` gerçek ve iyi kurulmuş bir kapı (`inspectWindowsSignature` `Status === 'Valid'` istiyor; `inspectMacosSignature` hem `codesign --verify --deep --strict` hem `spctl --assess` istiyor — ad-hoc imzalı, notarize edilmemiş derlemeler bunları geçemez) — sadece pipeline'a bağlanmamış.

**Sonuç:** Yayınlanan her Windows `.exe`/`.msi` imzasız (SmartScreen "bilinmeyen yayıncı"), her macOS derlemesi ad-hoc imzalı ve notarize edilmemiş. Tek bütünlük kontrolü Tauri minisign imzası — otomatik güncelleyici doğruluyor, ancak sürümler sayfasından manuel indiren kullanıcı **doğrulamıyor**. `tauri.conf.json` içinde de `bundle.macOS.signingIdentity` ve `signCommand` yok.

**Öneri:** macOS işine `APPLE_CERTIFICATE` + `notarytool` staple, Windows işine Authenticode `signCommand` ekleyin ve her masaüstü işinden **önce** `npm run desktop:release:signing:report -- --require-signed` adımını **bloke edici** olarak koyun. Scriptler zaten var; sadece bağlantı eksik.

**Y-20 · `index.html` varlık bütünlük manifestinden bilinçli olarak dışlanmış** — ✅ **KAPANDI (bkz. §1.18)**
`scripts/generate-asset-integrity-manifest.cjs` · `src/lib/assetIntegrity.ts`

```js
.filter((entry) => entry.path !== MANIFEST_FILENAME && entry.path !== 'index.html' && !entry.path.endsWith('.map'))
```

`verifyRuntimeAssetIntegrity()` yalnızca `manifest.assets` üzerinde geziyor; istenen bir varlığın manifestte **bulunması gerektiği** kontrolü yok. `index.html`, `dist/` içinde bütünlük garantisi olmayan tek dosya — ve her diğer betiği yükleyen belge o.

Kurulu varlık dizinine yazma erişimi olan bir saldırgan (kurulum manipülasyonu, tedarik zinciri yeniden paketlemesi, kötü yapılandırılmış bir kurulumda düşük yetkili yerel süreç, kötü niyetli `.msi` post-install betiği) `dist/index.html`'e `<script src="evil.js"></script>` ekler. `evil.js` de manifestte izlenmiyor, kök hash'i eşleşiyor, kontrol `{status:'verified'}` döndürüyor ve **çözülmüş kasaya tam erişimle keyfi JS çalışıyor.**

Gerekçe de Tauri v2 için doğru değil: Tauri v2, CSP'yi `tauri://`/`asset://` protokolü üzerinde yanıt başlığı olarak uygular, dosyayı diskte yeniden yazmaz.

**Öneri:** `index.html`'i manifeste ekleyin (diskteki baytların değiştirilmediğini ampirik doğrulayın; değilse derleme-zamanı şablonunu hashleyin). `verifyRuntimeAssetIntegrity`'ye **karşı** kontrol ekleyin — manifestte olmayan her script URL'ini reddedin.

**Çözüldü (bkz. §1.18):** Önerinin **ikisi de** uygulandı; biri diğerini tek başına kapatmıyordu. Dışlamanın gerekçesi ölçülerek çürütüldü: `tauri.conf.json`'un CSP'si ile derlenmiş `dist/index.html`'in CSP `<meta>` etiketi farklı stringler, ve `<meta>` etiketi kaynak şablonuyla bayt bayt aynı — yani Tauri v2 dosyayı diskte yeniden yazmıyor ve hash'lenen baytlar WebView'in yüklediği baytlar. Karşı kontrol, doğrulanan `index.html` baytlarından çıkarılan referansları manifestte adı bulunmayanlar için reddediyor; `blob:`/`data:`/mutlak `https:` referansları kapsam dışı, çünkü paketlenmiş dosya değiller. 10 yeni test, 6 mutasyonla doğrulandı (üçü aşırı düzeltme).

### 4.4 React / Kullanıcı Deneyimi — Veri Kaybı Riski

**Y-21 · `VaultFormModal`, `onSave`'i await etmeden çağırıyor → sessiz kayıp, işlenmeyen red, çift gönderim**
`src/components/VaultFormModal.tsx:392-394`

```ts
onSave(itemData);            // void | Promise<void> — await EDİLMİYOR
setIsUploading(false);
onClose();
```

Düğme `disabled={isUploading}` olsa da `setIsUploading(false)` bir sonraki satırda çalışıyor, `onSave` çözülmeden. **Veri kaybı:** kalıcılık reddederse (kota, kripto, OPFS/SQLite hatası) red işlenmemiş kalıyor, modal zaten kapanmış, `errorMessage` hiç ayarlanmıyor ve kullanıcı az önce yazdığı şifreyi sıfır geri bildirimle kaybetti. **Çift gönderim:** yeni öğelerde `id: editingItem?.id || ''` (`''`), dolayısıyla `saveVaultItem` her seferinde yeni id üretiyor → **kasada iki kopya**.

**Öneri:**
```ts
try { setIsUploading(true); await onSave(itemData); onClose(); }
catch (err) { setErrorMessage(err instanceof Error ? err.message : t('vaultForm.saveFailed')); }
finally { setIsUploading(false); }
```

**Y-22 · `ShareModal`, *farklı* bir öğeye ait canlı paylaşım bağlantısı + QR kod gösterebiliyor**
`src/components/ShareModal.tsx:33-42, 46-75`

Sıfırlama efekti yalnızca **kapanışta** çalışıyor, açılışta değil. `generateShareUrl` + `QRCode.toDataURL` iptal edilmiyor. Yandex: A için bağlantı üret → modalı kapat (sıfırlama çalışır) → uçuştan sonra promise çözülür ve `shareUrl`/`qrCodeDataUrl`/`generated` yeniden dolar → B öğesi için aç. **B'nin kimliğiyle A'nın hâlâ geçerli paylaşım bağlantısı ve QR kodu** gösterilir. Kullanıcı A'nın kimlik bilgisinin bağlantısını B'ye ait sanarak kopyalayıp iletebilir. `.catch` yalnızca `console.error` yapıyor — QR üretim hatası hiçbir mesaj bırakmıyor.

**Öneri:** Hem açılışta hem kapanışta sıfırlayın; bir çalıştırma sayacı (run id) ile bayat işi düşürün; hatayı `setPasswordError` ile yüzeye çıkarın.

**Y-23 · Kararsız geri çağım, güvenlik efektini her render'da yeniden çalıştırıyor → sızan Tauri dinleyicileri ve iptal edilen arka plan kilidi**
`src/UnlockedApp.tsx:159-168` + `src/hooks/useRuntimeSecurity.ts:28-51, 114-120`

```tsx
onSensitiveStateClear: () => { resetReveals(); clearCopiedField(); },   // ← HER RENDER'DA YENİ KİMLİK
```

Bu geri çağım iki efektin de bağımlılıklarında. `UnlockedApp` saniyede **bir kez** koşulsuz yeniden render oluyor (`useTotpCountdown`, `UnlockedApp.tsx:89`).

1. **Sızan yerel dinleyiciler.** `listen()` bir IPC gidiş-dönüşü, dolayısıyla `.then` pratik olarak **her zaman** temizlik çalıştıktan *sonra* çözülüyor (`unlistenFn === null`). Unlisten fonksiyonu ölü bir ref'e atanıyor ve **hiç çağrılmıyor**. 1 Hz'de dakikada ~60 yerel olay dinleyicisi sızıyor — hepsi `onLock` closure'ını tutuyor, yani bir ekran yakalama olayı `onLock()`'u onlarca kez tetikler.
2. **Arka plan otomatik kilidi iptal ediliyor ve yeniden kurulmuyor.** Efekt 3'ün temizliği `clearLockTimer()` çağırıyor. Yeni efekt çalışması zamanlayıcıyı yalnızca `visibilitychange → hidden`'da kuruyor. **Pencere gizliyken gerçekleşen her render, bekleyen `onLock()`'u yok ediyor** ve yeniden kurma yolu yok.

**Öneri:** `onLockRef`/`onClearRef` kullanın, native dinleme efektini `[]` bağımlılıklarla bir kez bağlayın. `UnlockedApp`'de geri çağımı `useCallback` ile sarın. `.then` sızıntısını şöyle düzeltin: `let disposed = false; p.then(un => { if (disposed) un(); else unlistenFn = un; })`. Aynı desen `useExtensionCredentialListener.ts:33-37`'de de var.

**Y-24 · Kilit ekranında uçuş-halinde koruma yok: kilit açmada/kurulumda çift gönderim**
`src/components/LockScreen.tsx:201-271, 653-670`

Düğme yalnızca `disabled={isSetup && isLockedOut}`. `isSubmitting` durumu veya `useRef` ile yeniden giriş koruması **yok** — biometrik yolunun doğru kullandığı `isBiometricPendingRef`'in (`:121, 162-163`) aksine. İki eşzamanlı `verifyMasterPassword` Argon2id çalıştırır; biri başarısız olursa `recordFailedUnlockAttempt()` (`:259`) kullanıcıya **kazanmadığı bir hız sınırı kilidine** iter ve yanıltıcı "geçersiz şifre" mesajı gösterir.

Ayrıca `triggerShake` (`:133-136`) saklanmayıp temizlenmeyen bir `setTimeout` oluşturuyor — başarılı kilit açmadan sonra 500 ms sonra `setIsShaking` çağrılıyor, hızlı art arda hatalar zamanlayıcıları yığıyor.

**Öneri:** `const [isSubmitting, setIsSubmitting] = useState(false)` + `disabled={isSubmitting || (isSetup && isLockedOut)}`; titreme zamanlayıcısını bir `useEffect` temizliğiyle bir ref'te tutun.

**Y-25 · Düz metin kasa dışa aktarımı, kullanıcı Ayarlar'dan ayrıldıktan 3 saniye sonra tetikleniyor**
`src/hooks/useSettingsBackupImport.ts:113-114, 154-175`

```ts
holdTimerRef.current = setTimeout(async () => {
  clearInterval(holdIntervalRef.current!);
  setHoldProgress(0);
  await executePlainExport();          // ← ŞİFRESİZ kasa JSON'u diske yazıyor
}, 3000);
```

Bu hook'ta **hiç `useEffect` yok** (grep: sıfır eşleşme). Hiçbir zamanlayıcı unmount'ta temizlenmiyor. Hook `SettingsPanel` içinde yaşıyor; ayarlarda başka bir sekmeye geçmek veya kilitlemek 3 saniyelik zamanlayıcının yine tetiklenmesine izin veriyor: `executePlainExport` (`:187-219`) her öğeyi ve her eki çekiyor, JSON'a çeviriyor ve **şifresiz** zarfı yerel kaydetme iletişim kutusuna veriyor. `setHoldProgress(0)` de unmount olmuş bir bileşene düşüyor.

İkincil hata: `startHoldExport` önceki zamanlayıcıyı temizlemeden `holdTimerRef.current`'ı üzerine yazıyor, ikinci bir basış ilki öksüz bırakıyor; `cancelHoldExport` artık onu durduramıyor ve iki dışa aktarım çalışıyor.

**Öneri:** `useEffect(() => () => { clearTimeout(…); clearInterval(…); }, [])` ekleyin. `startHoldExport` içinde önce `cancelHoldExport()` çağırın.

---

## 5. Orta Öncelikli Bulgular (34)

### 5.1 Güvenlik

| # | Bulgu | Dosya |
|---|---|---|
| O-1 | Eklenti kimlik bilgisi eşleştirmesi **üst alan adında** teklif veriyor — `bank.example.com` kaydı herhangi bir `example.com` alt alanında sunuluyor. Kimlik ifşası veya domain-takeover yolu. (Karşı yön — `example.com` → `login.example.com` — doğru ve güvenli) | `native_messaging.rs:521-530` |
| O-2 | **Tüm şifreli kasa veritabanı `localStorage`'a yansıtılıyor.** `SETUP_STORAGE_KEYS` `aegis_sqlite_fallback`'i içeriyor, `savedToDesktop` her web derlemesinde `false` → her kayıtta tam vault JSON. `catch {}` kota hatasını yutuyor, "kurtarma aynası" sessizce bayatlaşıyor. Ayrıca kayıt yolunda eşzamanlı çok MB'lık `JSON.stringify` → ana iş parçacığı takılması | `indexedDbStorage.ts:178,218-230`, `sqliteOpfsPersistence.ts:50` |
| O-3 | Legacy base64 ana şifre `localStorage`'da **süresiz kalabiliyor.** Temizleme üç koşulun **hepsine** bağlı (`isSetup && legacyPass && legacyItemsStr`); tarayıcı `aegis_vault_items`'ı evict edip küçük `aegis_master_password` anahtarını bırakırsa, `else` de temizlemeyi reddeder | `sqliteOpfsMigration.ts:58-62,143` |
| O-4 | **Passkey assertion'ları hiç doğrulanmıyor.** `crypto.subtle.verify()`, `rpIdHash` karşılaştırması, `clientData.type` kontrolü, sayaç zorlaması — hiçbiri depoda yok. `useSettingsPasskey.ts:92-108` assertion'ı yok sayıp `passkey.authenticate.success` gösteriyor. `userVerification` varsayılanı `'preferred'`. Depolanan `publicKey` alanı hiçbir işe yaramıyor | `passkey.ts:422-500` |
| O-5 | Kasa güvenlik denetimi zxcvbn yerine **elle yazılmış sezgisel** kullanıyor. `password123!` → 70 puan → "zayıf değil"; zxcvbn → 0. `qwertyuiop12` → 70. Aynı şifre öğe detayında **ZAYIF**, denetimde **güvenli** görünüyor. Güvenlik panosu sistematik olarak **fazla** raporluyor — bir denetim bypass'ı | `security.ts:86-124, 288-297` |
| O-6 | Güvenilmeyen yedek zarfı KDF parametrelerinde **üst sınır yok** → `{"memoryKiB": 8192, "parallelism": 1000000}` ile ithal sekmesi çöküyor; `iterations: 2000000000` sonsuza dek asılı kalıyor. `parallelism` hiç doğrulanmadan geçiyor. Ayrıca taban değeri (8 MiB) uygulamanın yazdığı profilden (32 MiB) **düşük** — yani "KDF indirme koruması" işe yaramıyor: saldırgan `memoryKiB`'yi 8192'ye düzenler, şifre çözme hâlâ başarılı, offline saldırı maliyeti 4× düşer | `encryption.ts:120-131,141-144` |
| O-7 | KDF parametre temizleyicisi **1 GiB** Argon2id tahsisine izin veriyor (`Math.min(memoryKiB, 1024*1024)`), kod tabanının ~64 MiB üzerinde "bellek erişimi sınır dışı" ile çöktüğünü belgelediği sınırın 16 katı. `useSettingsSync` mount efektinde, **kullanıcı eylemi olmadan** tetikleniyor | `sync/syncConfigStorage.ts:86-112` |
| O-8 | **Rollback tespiti süreç-yerel ve her yeniden başlatmada sıfırlanıyor.** `let lastObservedVersionCounter = 0` modül kapsamında, kalıcı değil. Gerçekçi senaryo (uygulama **çalışmıyorken** eski anlık görüntü değiştirilir) tespiti tamamen atlar. Yalnızca bilgilendirme amaçlı bir toast; hiçbir okuma/yazma reddedilmiyor. `versionCounter` düz JSON sayısı olduğu için saldırgan şişirip sonraki geri almaları bastırabilir | `sqliteOpfsPersistence.ts:65-99` |
| O-9 | `getRememberedAccountSecretKey()` hâlâ IndexedDB'den **düz metin** sır anahtarı döndürüyor. **Yazma** yolu doğru şekilde fail-closed; **okuma** yolu değil. `setSecureStorageItem` `false` döndüğünde (her Android dışı platformda normal durum) fonksiyon düz metin değeri geri dönüyor ve **asla silmiyor** | `storage.ts:125-138` |
| O-10 | Android autofill/güvenlik tanılama günlükleri **release derlemelerinde** ziyaret edilen siteyi ve uygulama paketini sistem günlüğüne yazıyor. Tauri `Logger`'ı doğru şekilde `BuildConfig.DEBUG` ile korunmuş, ama her birinci taraf `Log.*` çağrısı koşulsuz. Değerler loglanmıyor (bu doğru) ama gezinme/aktivite izi oluşuyor | `AegisAutofillService.kt:41-55,105-109` |
| O-11 | `SecureTempFileStorage` "anahtarın süreçten hiç çıkmadığını" iddia ediyor ama **anahtarı kendisini Intent token'ına koyuyor** (`[version:1][ivLen:1][iv][key:32]`). Sınıf dokümantasyonunun tehdit modeli bu tasarımı reddediyor; pratikte sızan şey şifreden anahtar oluyor. Token ayrıca JS'e kopyalanıyor | `SecureTempFileStorage.kt:30-34,170-173` |
| O-12 | Eklenti `update_draft_credential` origin'e bağlı değıl ve şema kontrolü yok → **çapraz origin kimlik bilgisi enjeksiyonu**. Taslak, terfi sırasında **hedef** sayfanın origin'ini alıyor, kaydeden sayfanınki değil. Otomatik doldurma zehirleme primitifinin temeli. (`set_pending_credential`'de kontrol var, taslak yolunda yok) | `src-extension/background.ts:113,313` |

### 5.2 Veri Bütünlüğü

| # | Bulgu | Dosya |
|---|---|---|
| O-13 | Toplu kaydetme, `changeMasterPasswordWithHash` ve demo reseed'i **ham anahtarı** kullanıyor, per-item anahtar izolasyonunu sessizce düşürüyor. Okuma tarafındaki geri düşüş + ilk okumada yeniden şifreleme yüzünden tek bir 500 öğelik ithal **tüm kasayı** yeniden çözüp yeniden şifreleyip yeniden kaydetmeye yol açıyor | `sqlite_opfs.ts:381,687,979` |
| O-14 | `hydrate()` **her** depolama-meta verisi okumasında tam DDL çalıştırıyor (PRAGMA + 3 tablo + 3 indeks + bir `INSERT OR REPLACE` + `sqlite_master` sayımı); tek bir öğe kaydı şemayı ≥3 kez yürütüyor. `readVaultItemRows` filtrelenmemiş (`idx_vault_items_deleted` var ama kullanılmıyor) ve `getVaultItemsWithKey` **her satırı sıralı** çözüyor — yani **her tek öğe kaydı tüm kasayı çözüyor** | `waSqliteVaultStorageRepository.ts:258-268,290,617-622` |
| O-15 | `ensureOpen()` sessizce **uçucu bellek içi** veritabanına düşebiliyor: `vfs_register` yoksa `registerPersistentVfs` `null` dönüyor, `open_v2` VFS adı **olmadan** çağrılıyor → wa-sqlite yerleşik bellek VFS'ini kullanıyor. Profil yine `persistentVfsReady: true` iddia ediyor, terfi başarıyla tamamlanıyor, kullanıcı "göç tamam" diyor ve **her şey bir sonraki yeniden yüklemede kayboluyor.** Eşzamanlı ilk çağrıda ayrıca handle sızıntısı var | `waSqliteEngine.ts:165-184, 255-274` |
| O-16 | **Anlık görüntü geri yükleme atomik değil** ve eski ekleri sessizce geride bırakıyor. Silme döngüsü + upsert bağımsız işlemler; ortada bir hata kasayı kısmen silinmiş bırakıyor, `resolve()` hiç çağrılmıyor, hata yüzeye çıkmıyor. Ekler yalnızca **ekleniyor**, hiçbir zaman silinmiyor, ama `restoredAttachments` "tamamlandı" diye raporlanıyor. Ayrıca `createVaultSnapshot` saklamayı **sabit 30**'a zorluyor, kullanıcının `maxSnapshots: 50` seçimini anında 30'a kırpıyor (20 yedek, bildirimsiz yok ediliyor) | `snapshots.ts:134-135, 239-290` |
| O-17 | Klasör ve akıllı klasör kitaplıkları **şifrelenmemiş** `localStorage`'da, kasa dışında, bütünlük koruması olmadan, yazma/okuma hataları yutularak saklanıyor; snapshot'a da girmiyor. Klasör adları bir şifre yöneticisinde en tanımlayıcı metad olabilir. `createFolder` `QuotaExceededError`'da "oluşturuldu" diye döndüğü halde yazmıyor. Bozuk JSON `[]` dönüyor → tüm hiyerarşi sessizce sıfırlanıyor | `folders.ts:91-103,299`, `smartFolders.ts:115-122` |
| O-18 | **Geri dönüş/ithal geri alma, evrensel üçüncü taraf ithal yolu için tamamen no-op.** `parseUniversalImport` hiçbir kod yolunda `id` üretmiyor, dolayısıyla Bitwarden/LastPass/Chrome/1Password JSON veya CSV için `importedItemIds === []` → `newlyInsertedIds === []` → rollback `catch` bloğu boş bir dizi üzerinde çalışıyor. `importAttachments` hata verirse kullanıcı **"ithal başarısız"** görüyor ama **her ithal edilen öğe zaten kalıcılaştırılmış** durumda — hata mesajı kasa durumunu **yanlış** temsil ediyor | `useSettingsBackupImport.ts:301-305, 316-320, 421-449` |
| O-19 | `sanitizeNoteText` **ölü kod** — `MAX_NOTE_LENGTH` sözleşmesi hiçbir yazma yolunda uygulanmıyor. 99 MB'lık bir not hücresi (yalnızca 100 MB dosya tavanıyla sınırlı) olduğu gibi saklanıyor, şifreleniyor, SQLite'e yazılıyor. `buildImportedTitle` böyle bir notun ilk satırını öğe başlığı olarak bile kullanıyor. NUL/kontrol karakterleri UI ve panoya filtrelenmeden gidiyor | `notes.ts:9-39`, `importer.ts:85-88` |
| O-20 | ✅ **KAPANDI (bkz. §1.14)** — Uzak senkronizasyon blob'ı **boyut sınırı olmadan** okunuyor (`res.text()`), sonra Argon2id'den geçirilip `JSON.parse` ediliyor. Depodaki her diğer güvenilmeyen girdi yolunun (`MAX_BACKUP_FILE_SIZE` 100 MB, `MAX_ANDROID_PAYLOAD_BYTES` 25 MB, `MAX_ATTACHMENT_SIZE`) sınırı var; **uzak partinin kontrolünde olan tek yolun** sınırı yok. 3–5× bellek büyütmesi mobil WebView'i öldürüyor | `webdavProvider.ts:181`, `s3Provider.ts:266`, `syncEngine.ts:83-89` |
| O-21 | ✅ **KAPANDI (bkz. §1.14)** — `getRemoteMetadata()` sıfır şema doğrulaması yapıyor. `updatedAt` bozuksa `NaN` → `NaN > x` `false` → indirme atlanıyor → O-20 ile birleşip **60 baytlık bir payload ile yıkıcı üzerine yazma** mümkün. `deviceId`, `vaultVersion`, `itemCount` doğrulanmıyor; `itemCount` hiç karşılaştırılmıyor | `webdavProvider.ts:201-206`, `s3Provider.ts:286-290` |
| O-22 | `bindSqlParams` bir **bağlama** değil, metin ikamesi. Değer kaçışı SQLite için doğru, ama ikame leksiksel — SQL string literal'leri **içindeki** `?` placeholder olarak tüketiyor (tüm parametreleri bir kaydırıyor), `/:([a-zA-Z0-9_]+)/` string literal'leri ve `'12:30'` içinde eşleşiyor, `::` cast'leri bozuyor. Salt okunurluk koruması artık ikameciğin doğruluğuna bağlı | `waSqliteEngine.ts:59-90` |
| O-23 | OPFS `FileSystemWritableFileStream` yazma hatasında **kapatılmıyor ve iptal edilmiyor** → dışlayan dosya kilidi sızıyor, sonraki tüm `createWritable()` çağrıları sayfa ömrü boyunca başarısız oluyor. Kod bu hata sınıfının farkında (zaman aşımı mesajı tam olarak `'OPFS write timed out (lock leak suspected)'`) ama nedeniyle hiçbir şey yapmıyor. Ayrıca OPFS yazmaları serileştirilmiyor ve `setTimeout` temizlenmiyor | `sqliteOpfsPersistence.ts:169-194` |
| O-24 | Kuru çalışma aynası **gerçek göç hedefinden farklı** veritabanı dosyasını doğruluyor (varsayılan profil, planın profili değil), `assertWaSqlitePersistenceReadyForActiveBackend` hiç çağrılmıyor, ve seed döngüsü **işlemsiz** — 500 öğeden 400'ünde başarısız olursa üretim veritabanında 400 çöp satır kalıyor, bunlar sessizce **boş `VaultItem`** olarak okunuyor. `DELETE FROM vault_items` + N insert yapılıyor | `vaultStorageProvider.ts:304-315`, `vaultStorageWaSqliteAdapter.ts:231-254` |
| O-25 | Kuru çalışma adaptörü, ithal JSON'dan gelen `item.id` / `createdAt` / `updatedAt` değerlerini elle SQL'e concat ediyor. `'` → `''` kaçışı SQLite için doğru, yani şu an sömürülemez — ama depolama katmanında `bindSqlParams`'ı atlayan tek yer, NUL baytlarını temizlemiyor, işlemsiz bir döngüde çalışıyor ve herhangi bir kaçış eklenmesi hâlinde enjeksiyona dönüşecek tipte bir desen | `vaultStorageWaSqliteAdapter.ts:256-271, 322-324` |

### 5.3 React / Performans / Erişilebilirlik

| # | Bulgu | Dosya |
|---|---|---|
| O-26 | **Kademeli kasa hidrasyonu O(n²)** ve uçuş halindeki bir düzenlemeyi sessizce geri alabiliyor. 10.000 öğede 200 ardışık `setItems`, her biri `runVaultAudit`'i tüm önek üzerinde yeniden çalıştırıyor ve uzantı kimlik bilgisi eşitlemesini tetikliyor (~4 sn). İptal güvenliği yok — bu pencerede yapılan bir kayıt React state'inde eziliyor, DB ile UI ayrışıyor. 60 satırlık sayfalama penceresi (`useVaultPagination`) tam olarak bunun için var, batch döngüsü onu iptal ediyor | `useVaultData.ts:22-38` |
| O-27 | **Hiçbir yerde debounce yok** (`debounce|useDeferredValue|startTransition|throttle` için sıfır eşleşme). Her tuş vuruşu, aktif her öğenin dört alanında (title/username/url/notes) DiceCoeff bulanık skorlaması çalıştırıyor. 10k öğede tuş başına ~40.000 skorlama, ana iş parçacığında | `TopBar.tsx:175`, `useVaultFilters.ts:69`, `useVaultQueries.ts:109-194` |
| O-28 | `memo(VaultWorkspace)` **bozuk** — `filteredItems: filteredItems.map(e => e.item)` her render'da **yeni dizi** üretiyor, öyle ki memo her zaman yeniden render oluyor. Bileşenin kendi yorumu bunun 600+ öğede "kritik" olduğunu iddia ediyor. Sürücü `useTotpCountdown` (1 Hz), yani sürekli. Ayrıca `matchByItemId` her render'da yeni `Map`, `onShiftSelect` satır başına yeni ok, `BulkSelectWrapper` memo değil | `useVaultQueries.ts:222`, `VaultWorkspace.tsx:238,500-508,647` |
| O-29 | **Çöp işlemleri tüm hataları yutuyor**: `void (async () => …)()` ve `catch` yok. `ConfirmModal` `onConfirm()` sonrası hemen kapanıyor. "Çöpü boşalt" veya "kalıcı olarak sil" başarısız olduğunda kullanıcı **hiçbir hata görmüyor** — sessizce gerçekleşmeyen bir veri yıkımı eylemi. `ConfirmModal`'ın `onNotify` kanalı var ama kullanılmıyor | `useTrashActions.ts:32-93`, `ConfirmModal.tsx:102-105` |
| O-30 | Ana şifre rotasyonunda `verifyMasterPassword` `try` bloğunun **dışında** → kripto/depolama hatası işlenmeyen red olarak kaçıyor, form ölü görünüyor. Ayrıca gönderim/disabled durumu **yok** → çift tıklama iki eşzamanlı rotasyon, ikincisi başarısız → kullanıcı **başarılı** rotasyonun ardından "mevcut şifre geçersiz" görüyor ve başarı durumu hiç gösterilmiyor. `setTimeout(...4000)` temizlenmiyor | `useSettingsPassword.ts:28-68` |
| O-31 | Hata sınırı **yalnızca kilidi açık ağacı** sarıyor. `App.tsx:65` `<LockScreen />`'i (760 satır; biometrik, depolama, kurtarma modalları) **sınır dışında** render ediyor → beyaz ekran, oturum hâlâ açık. `unhandledrejection` dinleyicisi `src/` **tamamında yok** — O-18/O-26/O-29/O-30'un ürettiği (yani bu codebase'in *normal* başarısızlık biçimi olan) hataların hiçbiri sınıra ulaşamıyor | `ErrorBoundary.tsx`, `App.tsx:65` |
| O-32 | Başarısız lazy-chunk yüklemesi kullanıcıyı **sonsuz splash**'ta bırakıyor. `import('./App.tsx')` `.catch` **yok** — red, `root.render` çağrılmadan gerçekleşiyor, `index.html:23-33` statik splash sonsuza dek dönüyor. Bu tam olarak `assetIntegrity` özelliğinin yakalaması gereken hata ve kurtarma yeniden yükleme olmadan mümkün değil. `document.getElementById('root')!` de id değişirse belirsiz `TypeError` verir | `main.tsx:46-61` |
| O-33 | Kilit ekranının bütünlük uyarısı ve autofill-pending prop'ları **üretimde erişilemez**. `integrityWarning`'ı **hiçbir** production yolu geçirmiyor, `isAutofillPending` de öyle. `LockScreen.test.tsx:85` banner'ı test ediyor — **uygulamada oluşamayacak** bir kod yolunu. `useAssetIntegrity` `failureReason`'ı döndürüyor, `UnlockedApp.tsx:185-188` **atıyor** → kullanıcı yalnızca kilit açtıktan sonra toast alıyor, kimlik bilgisi girmeden önce uyarı yok | `App.tsx:65`, `LockScreen.tsx:85-91,442-470` |
| O-34 | **`UnlockedApp.tsx` %0 test kapsamına sahip** — `vitest.config.ts` `include` kümesindeki tek 0% dosya. Eşikler (satır 90 / branch 80) toplamda geçtiği için CI yeşilken 529 satırlık orkestratör hiç çalıştırılmıyor. **Y-23 tam olarak bu dosyada yaşıyor** ve tek bir render testi yakalardı. Ayrıca 5 yerde temizlenmeyen `setTimeout` toast zamanlayıcısı var (`useVaultSnapshots.ts:60`, `useSettingsPassword.ts:67`, `useSettingsEmergencyKit.ts:42`, `ShareModal.tsx:81`, `useSettingsExtensionToken.ts:27`) | `UnlockedApp.tsx`, `vitest.config.ts` |

---

## 6. Düşük Öncelikli / Hijyen (30+)

| Bulgu | Dosya |
|---|---|
| `registerOnCloseSession` aboneliği iptal döndürmüyor ve bir **constructor'dan** çağrılıyor → her `new SQLiteOPFS()` kalıcı bir closure ekliyor, depo örneğini sonsuza dek pinliyor. `closeVaultSession()` gitgide büyüyen bir listeyi çalıştırıyor | `vaultSession.ts:57-59`, `sqlite_opfs.ts:77-82` |
| Ana şifre karşılaştırması kısa devre yapan, sabit-zamanlı olmayan bayt döngüsü (`Array.prototype.every` ilk uyuşmazlıkta duruyor, eşleşen önek uzunluğunu sızdırıyor). `areByteArraysEqual` (doğru uygulanmış, akümülatörlü) zaten mevcut | `storage.ts:190-206` |
| Kilitlenme durumu ve boşta kalma son tarihleri **duvar-saati** tabanlı; sistem saati geri alınınca üstel geri çekilme kalıcı olarak sıfırlanıyor. Boşta kalma için `performance.now()` (monotonik) kullanılmalı | `vaultSession.ts:114-125`, `useAutoLock.ts` |
| `withActive*` yardımcıları `result instanceof Promise` kullanıyor; **thenable** (çaprez-realm promise) dönerse klon **sıfırlanmıyor** — dosyanın tüm güvenlik disiplini atlanıyor. `Promise.resolve(result).finally(…)` kullanın | `vaultSession.ts:246-262` |
| `wasmZeroizer` arenası **asla geri kazanılmıyor** — `nextOffset` yalnızca artıyor, ücretsiz listesi yok. 256 KiB'lik arena, `withActive*` her çağrıldığında `createSecureBuffer` çağırdığı için kolayca tükeniyor (32 bayt/anahtar → ~8192 erişim) ve sonra **sessizce** düz heap'e düşüyor. Sertleştirme üretimde fiilen etkisiz, telemetri/uyarı yok | `wasmZeroizer.ts:64-87` |
| `sanitizeAutoLockDuration(0)` 300 sn varsayılanı döndürüyor, yani `settings.autoLock.never` ("Never Lock") **seçilemiyor**; `durationSeconds > 0` ve `autoLockDurationSeconds === 0` dalları erişilemez. Güvenli yönde başarısız ama **UI yalan söylüyor** | `useAutoLockDuration.ts:8-13`, `i18n/locales/en.ts:405` |
| "Otomatik doldurmada biyometrik zorunlu" bayrağı düz metin `localStorage`'da (`aegis_biometric_autofill_require`) — sayfa erişimi olan her şey onu kapatabiliyor | `biometric.ts:711-724` |
| **Arama geçmişi vault sorgularını düz metin `localStorage`'a** yazıyor — kullanıcının `banking`, `iş vpn` gibi indekslenebilir, şifre koruması olmayan bir listesi. Kilitte temizleniyor ama arada diskte duruyor. Profil adı/avatarı da düz metin (`data:` URL olabilir) | `recentSearches.ts:32,69-81`, `useProfileSettings.ts:31-32` |
| `SecurityAudit` her benzersiz **düz metin şifreyi React state'i Map anahtarı** olarak kullanıyor (React DevTools, state serileştirmesi, hata raporlaması sızıntısı) ve iptal edilemeyen N şu ağ isteği başlatıyor (10k kasada 3.000 **sıralı** HIBP isteği, eşzamanlılık limiti veya k-anonimlik toplu işlemesi yok). `runVaultAudit` her render'da memo'suz çağrılıyor | `SecurityAudit.tsx:22,55-78` |
| `useSmartFolders` akıllı klasör sayılarını **her render'da** yeniden hesaplıyor → `O(folders × items)`, `UnlockedApp`'de saniyede bir (O-28) + her tuş vuruşunda (O-27). `useMemo` yok | `useOrganisation.ts:182-190` |
| Shift-seçim **yanlış çapayı** kullanıyor (`allIds.find(id => selectedIds.has(id))` = görünür listedeki **ilk** seçili, son tıklanan değil) ve `setSelectedIds(new Set(slice))` **mevcut seçimi değiştiriyor** (birleştirmiyor) → shift-click hiçbir zaman çoklu seçimi genişletemiyor. Ayrıca tam liste yerine `displayedItems` (60 satırlık sayfalama penceresi) üzerinde çalışıyor, yani ilk sayfa dışında shift-select imkânsız | `VaultWorkspace.tsx:500-508`, `useOrganisation.ts:251-258` |
| Tam kimlik bilgisi listesi, `items` kimliği **her değiştiğinde** (belgelenen "dakikada bir" değil) native messaging'e itiliyor — 10k kasada 200 IPC itişi. Sır periyodisinde sınırlar ötesi taşınan veri | `useExtensionCredentialSync.ts:13-25` |
| `useAssetIntegrity` — **tek** çalışma-zamanı müdahale kontrolünde `.catch` **yok**; reddedilen bütünlük doğrulaması görünmez şekilde "geçti" kabul ediliyor. Fail-open davranışı bir güvenlik özelliğinde | `useAssetIntegrity.ts:17-27` |
| `useShareReceive.submitSharePassword` — `window.location.hash`'ten gelen tamamen saldırgan-kontrollü girdi üzerinde `try/catch` yok → reddedilen decrypt **sonsuza dek takılı** bir istem bırakıyor (`isDecrypting` durumu yok, tekrarlanan gönderimler eşzamanlı Argon2id başlatıyor). `:58`/`:84` `replaceState` sorgu dizesini de siliyor | `useShareReceive.ts:65-78` |
| `PasswordGenerator` `handleGenerate`'i bildiriminden **önce** kullanıyor (gerçek lint uyarısı, `react-hooks/immutability`). Davranış şu an doğru ama kuralın var olma nedeni TDZ'nin ulaşılabilir olması ve `handleGenerate`'i `useCallback` yapamamaya zorlaması (bu yüzden `options`/`dicewareOptions` depolarda nesne olarak) | `PasswordGenerator.tsx:89-91` |
| Üç bağımsız `useSensitiveReveal` örneği; bağlam örneği kalıcı olarak **ölü durum**, `toggleReveal`'ı no-op. `App.tsx:58`'deki `resetReveals` hiçbir şey temizlemiyor. "Kilitlemede tüm açık alanları gizle" güvenlik yolu yalnızca `UnlockedApp`'in unmount olması **sayesinde** çalışıyor | `App.tsx:46`, `UnlockedApp.tsx:71`, `SensitiveRevealContext.tsx:18` |
| Sabit kodlanmış kullanıcıya dönük dizeler 12 dilin hepsine gösteriliyor — en kötüsü `UnlockedApp.tsx:332`'deki `'Category updated successfully / Kategori güncellendi'` (sert kodlanmış iki dilli). Ayrıca `ErrorBoundary.tsx:82-95`, `useSettingsExtensionToken.ts:27-28`, `useAppUpdater.ts:85`, `useShareReceive.ts:92,108,116`. `i18n:audit` bunu yakalamıyor | çeşitli |
| **Tarayıcı/işletim sistemi dil algılama yok** (`navigator.language` için sıfır eşleşme), `defaultLanguage` = `'tr'`, `index.html:2` `<html lang="tr">` sabit kodlanmış. İngilizce/Arapça kullanıcı Türkçe arayüz alıyor. **Kod dokümantasyonu bunu açıkça özellik olarak vaat ediyor** (`LanguageContext.tsx:1-6`) | `i18n/LanguageContext.tsx`, `index.html:2` |
| **RTL ilan edilmiş ama uygulanmamış** — `dir="rtl"` + `.rtl` sınıfı ayarlanıyor; `rtl:` varyantı veya `.rtl` CSS kuralı **sıfır**. 13 fiziksel `border-l-*` sınıfı dönmüyor (`SecurityAudit.tsx:168,176,183,202`, `VaultForm*Fields.tsx`, `VaultItemSecurityAssessment.tsx:16-18,43`) | `LanguageContext.tsx:112-119` + 13 bileşen |
| Anlık görüntü geri yükleme onayı, uygulamadaki her diğer katmanın kullandığı erişilebilir `Modal`'ı **atlayan** tek modal — `role="dialog"` yok, focus trap yok, Escape yok, `aria-labelledby` yok, ve **tüm kasayı ezen** bir eylemi koruyor. Ayrıca aynı bileşen boş durumda `window.confirm` kullanıyor | `SettingsSnapshotHistoryCard.tsx:500,512-565` |
| `ConfirmModal` erişilebilir ada sahip değil (`Modal`'ın `labelledBy`/`describedBy` desteğine rağmen geçirmiyor, `<h3>`/`<p>`'de `id` yok) ve async onay yerleşmeden **önce** kapanıyor; yeniden giriş koruması yok (çift tıklama `onConfirm`'ı iki kez çalıştırır) | `ConfirmModal.tsx:64,84-88,102-105` |
| Bildirimler ve yıkıcı onaylar **tek yuva** paylaşıyor (`useConfirmModal.ts`) — bir bildirim açık bir onayı **sessizce** siliyor ve `onConfirm`'ı no-op ile değiştiriyor. "Çöpü boşalt" diyaloğu bu şekilde kayboluyor ve eylem hiç çalışmıyor. 5 farklı efekt `onNotify` çağırıyor | `useConfirmModal.ts:14-40` |
| `useSettingsSync.handleSyncDisable` **yinelenen** bir gövde; ikinci kopya S3 alan sıfırlamalarını atlıyor. Bakım landminesi, ve `async` olmasına rağmen `await` içermiyor | `useSettingsSync.ts:169-179` |
| Senkronizasyon yapılandırma yükleme hataları yutuluyor ve **"senkronizasyon devre dışı"** olarak yanlış raporlanıyor. Yanlış/ele geçirilmiş ana şifre `authFailed` atıyor → kullanıcı "devre dışı" görüyor, hata görmüyor, **vayet gerçekten yedeklendiğini sanıyor** — bir şifre yöneticisi için **yanlış dayanıklılık güvencesi**. Legacy v1 zarfı `try/catch` dışında `JSON.parse` hatası veriyor → işlenmeyen red. `withActiveBackupPassword` `null` dönerse `setSyncLoading(true)` bile çalışmıyor → düğmeye basmak hiçbir şey yapmıyor | `useSettingsSync.ts:57-81,182` |
| Sync sağlayıcı `dispose()` **hiç çağrılmıyor** → `airgapNetworkPolicy`'deki `addSyncAllowedOrigin` **sınırsız** büyüyor. Kullanıcı sınav ettiği **her** WebDAV/S3 uç noktası, sekme ömrü boyunca (senkronizasyon devre dışı bırakılsa bile) kalıcı olarak çıkış-izinli; `handleSyncDisable` adresi kaldırmıyor. `hasSyncConfig()` yalnızca anahtar varlığı kontrol ediyor, bozuk zarf aynı sonucu veriyor | `useSettingsSync.ts:90,111,188`, `airgapNetworkPolicy.ts:38-50` |
| LAN HTTP muafiyeti **düz metin Basic-Auth** kimlik bilgilerine izin veriyor (LAN'daki her cihaz — misafir cihaz, ele geçirilmiş IoT, ARP-spoofing komşu — token'ı ve şifreli kasayı yakalayabiliyor) ama HTTPS'ye **link-local/metadata adreslerine** hiçbir kısıt koymuyor: `https://169.254.169.254` geçiyor ve kalıcı olarak izin listesine giriyor (bulut metadata SSRF). Hata mesajı gerçek davranışı yanlış tanımlıyor. `127.1`, `0.0.0.0`, `[::1]`, `::ffff:127.0.0.1` ele alınmıyor | `webdavProvider.ts:58-63`, `airgapNetworkPolicy.ts:18-50` |
| Düz metin dışa aktarım `data:` URI çapasıyla teslim ediliyor — sınırsız, geri çağrılamaz, DOM'da ikamet ediyor; `encodeURIComponent` boyutu ~3× büyütüyor (20 MB kasa → ~60 MB string). Tarayıcı limitleri aşıldığında **kırpılmış, geri yüklenemez** dosya "başarılı" raporlanıyor. `SettingsRecoverySection.tsx:149-157` **doğru** Blob/`createObjectURL`/`revokeObjectURL` desenini yapıyor — iki yol birleştirilmeli | `useSettingsBackupImport.ts:124-132,203-220` |
| `open_import_file` dosyanın **tamamını** sınırsız belleğe okuyor (Rust tarafında hiç boyut kontrolü yok) — her diğer okuma yolu sınırlı. `panic = "abort"` ile tahsis hatası sert süreç ölümü. Android tarafındaki `MainActivity.handleOpenFileResult` doğru desenli (`MAX_OPEN_FILE_BYTES`, sayaçlı akış) — masaüstüne taşınmalı | `src-tauri/src/lib.rs:604-619` |
| Ham `JSON.parse` hata metinleri kullanıcıya gösteriliyor (`'Unexpected token } in JSON at position 12345'`) — sır taşıyan yedek dosyasından parçalar ekrana, ekran görüntüsüne ve hata raporuna düşüyor | `useSettingsBackupImport.ts:69-73,222`, `importer.ts:222` |
| `validateBackupPayload` alan bazında tip/uzunluk doğrulaması yapmıyor ve öğe sayısı tavanı yok; `tags`/`folderId` güvenilmeyen JSON'dan **kelimesi kelimesine** kopyalanıyor (dizi olmayan `tags` `tags.ts` tüketicilerini kırabilir). `.aegis` yolu dosya boyutu kontrolünü **tamamen atlıyor** (100 MB tavanı çözülmüş yük için hiç uygulanmıyor) | `backupValidation.ts:90-130` |
| Ek boyutu sınırları iç tutarsız (`MAX_ATTACHMENT_SIZE` 250 MB, `MAX_BACKUP_FILE_SIZE` 100 MB) — 250 MB'lik ek hiçbir dosya yolundan sığamıyor, `attachmentTooLarge` dalı **erişilemez**, kullanıcı yanlış (genel) hata mesajı alıyor. `att.size` beyan ediliyor ama base64 yüküyle çapraz doğrulanmıyor (`size: 1` + 90 MB veri kabul ediliyor) | `backupValidation.ts:25-26,142-162` |
| zxcvbn **kullanıcı girdileri olmadan** çağrılıyor; site adından türetilen `AegisVault2026` **ana şifre** olarak geçiyor (her iki katmanda da). `hashCacheKey` de girdileri içermediği için önbellek de düzelemez | `security.ts:24-26,413-421` |
| Anlık görüntü `checksum`'u hesaplanıp saklanıyor ama **hiç doğrulanmıyor** — UI'da bütünlük göstergesi olarak sunuluyor (`snap.checksum.slice(0,8)`). IndexedDB bozulması GCM hatası olarak, "yanlış şifre" sanılıyor | `snapshots.ts:110,253` |
| Otomatik anlık görüntü hataları tamamen yutuluyor → `null` dönüyor, günlük yok, kullanıcı sinyali yok. Yedeklemeler sessizce duruyor, kullanıcı bayat bir rozet görüyor. `saveSnapshotSettings` de kota hatasını yutuyor → ayar uygulandı gibi görünüyor ama değil | `snapshots.ts:384-390,461-470` |
| Yanlış olay kodu: `securityLegacyCryptoWarning \|\| 'security.snapshot.created'` — `securityLegacyCryptoWarning` boş olmayan bir string olduğu için `\|\|` ölü kod ve **her rutin anlık görüntü oluşturma "eski kripto uyarısı" olarak loglanıyor** (`useRuntimeSecurity` ve denetim ekranının güvendiği sinyali seyreltiyor) | `snapshots.ts:137-141` |
| Anlık görüntülerde **boyut bütçesi yok** — budama yalnızca sayıya göre. 30 anlık görüntü × ekli bir kasa yüzlerce MB olabilir, `sizeBytes` kaydedilse bile kullanılmıyor | `snapshots.ts:117,223-232,353-355` |
| `migrateAttachmentRecordToAesGcm` fiilen **ölü kod** — `keySource: 'master-password'` kayıtları için `decryptAttachmentData` koşulsuz `legacyEncryptionBlocked` fırlatıyor. `storage.ts`'deki dört `migrateLegacyAttachmentsToAesGcm()` çağrısı başarısız olup **hiçbir şey başarmıyor**. Legacy ek yolu ayrıca per-item anahtarı `HKDF(ikm = UTF8(masterPassword))` ile türetiyor (hızlı KDF, insan şifresi üzerinde) | `attachments.ts:99-119, 262, 265-290` |
| `generateTOTP` her `TOTPValidationError` dışı hatayı yutuyor ve `'000 000'` döndürüyor — bozuk sır, meşru sıfır koduyla ayırt edilemiyor. TOTP sayacı `Date.now()` duvar saatine bağlı (yanlış saatli kullanıcı sürekli geçersiz kod görüyor, teşhis yok) | `otp.ts:129, 146-149` |
| `LEGACY_VAULT_ITEM_KDF_SALT` sabit bir string; belirli bir sürümdeki tüm kurulumlar için aynı Argon2id tuzu (ön hesaplama tehlikesi) | `sqliteOpfsShared.ts:18` |
| Masaüstünde Rust KDF hatası loglanıp **sessizce WASM'e düşüyor**; `getDefaultKdfProfile()` masaüstünde 64 MiB dönerken Rust varsayılanı 32 MiB → etkin profil çağıranın seçimine bağlı | `argon2id.ts:143-162` |
| Linux ekran yakalama monitörü: alt dize eşleşmesi (`obsidian`, `spectacled`, `peek` içeren her süreç) **spam edilebilir** yanlış pozitifler üretiyor; 3 saniyelik döngüde **dört** PATH ile çözümlenen yardımcı süreç, `MONITORING_STARTED` yani hiç durmuyor — kasa kilitliyken bile. Aynı PATH çözümleme deseni `icacls`, `keytool`, `taskkill` çağrılarında da | `linux_security.rs:52-55,66-200`, `native_messaging.rs:274` |
| `is_native_host` argv sezgisinin son disjunct'i `argv[0]`'ı **dahil** ediyor: kullanıcı hesap adında `@` olan bir makinede (AD tabanlı kurumsal imajlarda olağan) AegisVault ile ilişkilendirilmiş **herhangi bir `.json` dosyası** açmak GUI'siz native-messaging-ana moduna giriyor, pencere hiç açılmıyor; çevrimdışı yedek yolunda her istek için GUI örneği spawn ediyor | `src-tauri/src/lib.rs:692-704` |
| Windows eşleştirme token'ı ACL kısıtlaması **fail-open**: `USERNAME` ayarlanmamışsa iki "fail-closed" dalı atlanıp `Ok(())` dönüyor, token miras kalan dizin ACL'siyle okunabilir kalıyor. Aynı fonksiyon port dosyası için de kullanılıyor, `rotate_pairing_token`/`setup`/`revoke`'tan çağrılıyor. `icacls` yerine doğrudan Win32 API önerilir | `native_messaging.rs:268-297` |
| ✅ **KAPANDI (bkz. §1.17)** — `revoke` diğer canlı oturumları sonlandırmıyordu: `handle_client` token'ı bağlantı anında bir kez alıyor, diğer istemciler kendi `session_data_key`'iyle yaşamaya devam ediyordu. Dokümantasyonun ("tüm önceden verilmiş oturum anahtarlarını geçersiz kılar") tersini vaat ettiği davranış. Paylaşılan bir jenerasyon sayacı eklendi ve kontrol **çerçeve okuyucuya** kondu (tek geçiş noktası). Bulgunun raporda yazılmayan ikinci kapısı da vardı: `rotate_pairing_token` komutu da token döndürdüğü için aynı kusuru taşıyordu — artış, döndüren fonksiyonun **içinde** olduğu için iki yoldan biri unutsa bile açılmaz | `native_messaging.rs` (`RevokeGeneration`, `read_authenticated_frame`, `rotate_pairing_token_now`) |
| PSL algoritması **IP sabitlerine** uygulanıyor, tüm `127.0.0.0/8`'i tek kimliğe çökertiyor (`extract_etld_plus_one("127.0.0.1")` → `"0.1"`). İki farklı döngüç adresi 85 puanla eşleşiyor. Sondaki nokta, IDN/punycode ve `user:pass@` normalleştirilmiyor (`parse_url` `userinfo`'yu ayıklamıyor) | `native_messaging.rs:466-536` |
| Eklenti `blocked` dalları `chrome.tabs.query` geri çağrısı içinden `return` ediyor, **listener'dan** değil → çağıran her zaman `{ status: 'ok' }` alıyor. Güvenlik kontrolü çalışıyor, raporlaması çalışmıyor | `src-extension/background.ts:306-308` |
| `adm-zip` tam olarak pinlenmiş (hem `devDependencies` hem `overrides`), iki override ölü (`shell-quote` lockfile'da hiç yok, `qs` bağımlı tarafından 6.15.1'de sabitlenmiş), `engines`/`packageManager`/corepack yok. `argon2-browser` üretim paketinde Rust `argon2 0.6`'ya **yanında** ikinci bir Argon2id uygulaması olarak gidiyor — parametre/salt kodlaması sapması riski. `npx tauri` yerine `npx --no-install` | `package.json:144,158-163` |
| Gradle dağıtımı `distributionSha256Sum` olmadan indiriliyor ve çalıştırılıyor; `verification-metadata.xml` yok, bağımlılık kilitleme yok, dependabot `gradle` ekosistemini **hiç** kapsamıyor. Kotlin 1.9.25 + AGP 8.11 desteklenen matrisin dışında | `gradle-wrapper.properties:3`, `buildSrc/build.gradle.kts:8-11` |
| İmzalama sırları (`TAURI_SIGNING_PRIVATE_KEY`, Android keystore parolaları) `npm ci`'nin **tüm** devDependency kurulum/yapım grafığını çalıştıran `npx tauri build` sürecinin ortamında; tek bir ele geçirilmiş transitive devDependency + `postinstall` imzalama anahtarını sızdırır. `persist-credentials` varsayılan `true` bırakılmış | `release-desktop.yml:68-86,132-151,274-316` |
| **CI, depodaki kendi güvenlik kapılarının hiçbirini çalıştırmıyor.** `ci.yml` yalnızca `typecheck` + `test:unit` + `cargo check`/`cargo test` yapıyor. Çalışmayanlar: `lint`, `security:dependencies`, `security:csp`, `security:no-js-master-string`, `security:session-gates`, `test:fuzz` (8 fuzz paketi), gitleaks, `cargo clippy`/`audit`/`deny`/`fmt`. Sertleştirme kapısı yalnızca etiket-tetikli masaüstü işlerinde; `build-android` işinde **hiç** yok, `release-desktop-manual.yml`'de hiç yok | `.github/workflows/ci.yml` |
| CodeQL **yalnızca javascript-typescript** — Rust kripto/KDF/IPC arka uç (elle yazılmış XChaCha20-Poly1305 çerçevelemesi, Argon2id, elle URL eşleştirici, token el sıkışması) ve Kotlin kripto/autofill/KeyStore katmanı hiç analiz edilmiyor. En çok işe yarayacak sorgular (sabit kod kimlik bilgisi, zayırf kripto, yetkisiz veri yolu, IPC giriş noktasında yetkilendirme eksikliği) yalnızca o dillerde tetikleniyor | `.github/workflows/codeql.yml:20-24` |
| Sürüm yayınlama **atomik değil** ve otomatik-güncelleyici ucunu kararsızlaştırıyor: yeniden çalıştırma için yayınlanan sürüm (ve `latest.json` dahil) siliniyor, sonra varlık varlık yeniden oluşturuluyor; bu pencerede `releases/latest/download/latest.json` 404 döndürüyor ya da farklı bir etikete çözümleniyor → sürüm karışıklığı. `generate_release_notes: true` + `make_latest: true` "latest" işaretçisini sıfırlıyor. Düzeltme: taslakla yayınla → tüm varlıkları yükle → tek `PATCH` ile yayınla; veya `latest.json`'ı değişmez etiket URL'sinden sun | `release-desktop.yml:580-622` |
| `latest.json` bütünlük iddiası olmadan yayınlanıyor: eksik `.sig` koleksiyonu sessizce atlanıyor (`if (!signature) continue;`), manifest `platforms: {}` ile ve **sıfır çıkış koduyla** yazılıyor, sonra cosign imzalanıp yükleniyor. İmza "doğrulaması" bir **alt dize testi** (`raw.includes('untrusted comment: signature from tauri secret key')`) — istemci gerçek minisign doğrulaması yaptığı için istismar edilemez, ama üretici bir doğrulama katmanı değil | `generate-updater-manifest.cjs:118-143` |
| Android `isMinifyEnabled`/`isShrinkResources` etkin ama `-keep class com.hafgit99.aegisvault7.** { *; }` tüm uygulama kodunu koruyor → R8 yalnızca kütüphaneyi soyuyor. Saldırgana KeyStore sarmalayıcısının, autofill servisinin ve beş `@JavascriptInterface` bridge'inin tam sınıf/yöntem adlarını ücretsiz veriyor | `proguard-rules.pro:24-25` |
| Android release imzalama Gradle düzeyinde isteğe bağlı (fail-open): yapılandırma yoksa yalnızca bir uyarı, **imzasız, yüklenebilir, dağıtılabilir** APK üretiliyor. CI dört sırrı açıkça kontrol ediyor ama `apksigner verify --print-certs` parmak izi kontrolü hiç yok | `build.gradle.kts:76-84` |
| NSIS `NSIS_HOOK_PREUNINSTALL` `%APPDATA%\com.hafgit99.aegisvault7` dizinini **onaysız** siliyor — bir şifre yöneticisini kaldırmak kasayı ve eşleştirme token'ını sessizce yok ediyor | `nsis/installer.nsh:3-9` |
| `register-host.js` native messaging host `allowed_origins` değerlerini **açılmış derleme ağaçlarındaki** dosyalardan göç ettiriyor — düşmanlı bir eklenti paketini açıp `npm run register:extension` çalıştırmak o paketin kimliğine kimlik bilgisi IPC'sine erişim veriyor. Release ikilisi yoksa `target/debug/` derlemesini tercih ediyor (`debug_assertions` + dosya günlükleme açık) | `scripts/register-host.js:33-40,93-96` |
| `chrome-zip.cjs` PowerShell geri düşüşü dosya sistemi yollarını komut **string'i** içine enjekte ediyor (`-Command` argümanları metin olarak birleştiriliyor, parametre olarak bağlanmıyor). Paylaşılan build ajanlarında rutin. Aynı scriptin `run()` yardımcısı doğru deseni kullanıyor — tutarsızlık. `android-release-gate.cjs:112` ve `firefox-xpi.cjs:62` aynı yardımcıyı kopyalıyor, `release-utils.cjs`'e çıkarılmalı | `scripts/chrome-zip.cjs:111-118` |
| `generate-checksums.cjs` girdileri yalnızca **basename** üzerinden anahtarlıyor → farklı bundle alt dizinlerindeki aynı adlı artefaktlar belirsiz `sha256sum -c` veriyor; macOS güncelleyici paketi (`.app.tar.gz`, otomatik güncelleyicinin kurabildiği **tek** macOS artefaktı) hiç dahil edilmiyor | `scripts/generate-checksums.cjs:33-53,71-79` |
| `generate-audit-package-checksums.cjs` `SHA256SUMS.txt.minisig` algıladığında **"ayrılmış minisign imzası tespit edildi"** diyor ama **hiçbir zaman doğrulamıyor** — imzasız bir sağlama dosyası hiçbir müdahale belirteci sağlamıyor | `scripts/generate-audit-package-checksums.cjs:209-214` |
| `.gitleaks.toml` izin listesi yol tabanlı ve kalıcı → sonradan izlenen bir yolda commit edilen gerçek bir sır **bir daha asla raporlanmıyor**; gömülü `commits = [...]` listesi tercih edilmeli | `.gitleaks.toml:8-17` |
| `src-tauri/gen/android/tauri.settings.gradle` geliştiricinin mutlak yollarıyla commit edilmiş → Android derlemesi başka hiçbir makinede yeniden üretilebilir değil ve depoya kullanıcı adını sızdırıyor | `tauri.settings.gradle:4,6` |
| `SECURITY.md`, `scorecard.yml`, `tauri.dev.conf.json`, `CODEOWNERS` dosyaları U+FFFD değiştirme karakterleri içeriyor (mojibake) — `SECURITY.md` destek matrisi yayımlandığı haliyle **okunamıyor** | çeşitli |
| `.github/CODEOWNERS` tek bir sahip (`@hafgit99`) her yolu tutuyor, `/src-tauri/**` ve `/.github/workflows/**` dahil. Görevler ayrılığı yok — ele geçirilmiş bir bakımcı hesabı kripto ve CI katmanına incelenmeden değişiklik geçirip yayınlayabilir | `.github/CODEOWNERS:1` |

---

## 7. Doğrulanmış Olarak **Temiz** Bulunanlar (düzeltme yapmayın)

İnceleme sırasında varsayım olarak test edilen ve **temiz** çıkan alanlar:

| Alan | Sonuç |
|---|---|
| **Zip bomb / zip slip / XXE** | `adm-zip` yalnızca `scripts/chrome-zip.cjs` ve `desktop-signing-policy.cjs`'te (derleme-zamanı paketleme), asla `src/`'de. Uygulamada hiç zip, tar veya XML ayrıştırıcı yok. **Yüzey yok.** |
| **`dangerouslySetInnerHTML` / `innerHTML` / `document.write`** | `src/` içinde **sıfır** eşleşme. Tüm vault verisi JSX metin interpolasyonuyla DOM'a ulaşıyor, React otomatik kaçışlıyor. Notlar düz metin (Markdown/HTML oluşturucu yok, `notes.ts` saf string sanitizasyonu). |
| **`javascript:` URL XSS** | `VaultItemDetailHeader.tsx:56` `^https?://` testi kullanıyor; `javascript:`, `data:`, `vbscript:` testi geçemez ve `https://` ile öneklenerek nötrleştiriliyor. React öznitelik değerini kaçışlıyor. **Sömürülemez.** |
| **ReDoS** | `csvParser.ts` tek geçişli karakter döngüsü, iç içe niceleyici yok. `backupValidation.ts:35` base64 doğrulayıcısı sabit genişlikli (`(?:[A-Za-z0-9+/]{4})*`) ve ankrajlı kuyruklu — O(n), üstel geri izleme yok. |
| **Prototype pollution** | Tüm güvenilmeyen JSON `JSON.parse` üzerinden; `__proto__` sıradan bir veri özelliği olarak oluşuyor, setter tetiklenmiyor. Tek nesne yayılımı (`importer.ts:97`) `CopyDataProperties` kullanıyor, setter'sız. `security.ts:283` en kötü ihtimalle yanlış "yeniden kullanılan şifre" sayacı üretiyor. |
| **TLS sertifika doğrulama atlama** | `Cargo.toml`: `tauri = { version = "2.11.2", features = [] }` — `dangerousInsecureTls` yok, `accept-invalid-certs` yok. Rust veya TS katmanında TLS atlama yok. |
| **Dışa aktarma dosya adında yol geçişi** | `default_filename` yalnızca native `GetSaveFileNameW` iletişim kutusuna ön-doldurma; nihai yol her zaman kullanıcının seçimi. |
| **Kurtarma anahtarı entropisi/kodlaması** | `recoveryKey.ts:99-124` `crypto.getRandomValues`'dan 32 bayt (256 bit), doğru hesaplanmış tek blok SHA-256 sağlama baytı (32 bayt + 1 dolgu biti tek 512-bit bloğa sığıyor, optimizasyon geçerli), 24 × 11-bit BIP-39 indeksi. `validateRecoveryWords` yeniden kurup doğruluyor. Tümü sağlam. |
| **Yedek dosyası kimlik doğrulaması** | `encryption.ts:66-96`: Argon2id → AES-256-GCM; çözme GCM etiketini **ve** şifreli metin üzerindeki SHA-256 sağlamasını doğruluyor. Değiştirilmiş yedekler ithal **öncesi** reddediliyor. (Anahtarsız sağlama GCM etiketine ek güç katmıyor, ama erken reddetme olarak doğru kullanılıyor.) |
| **Ek ithal atomikliği** | `importAttachments` tüm kayıtları yazma işlemi **açılmadan önce** şifreliyor; `store.put` tek IDB işlemi. Ortada throw → hiçbir şey yazılmıyor, `importedAttachmentIds` kısmen doldurulmuyor. |
| **Etiket kütüphanesi şifreleme** | Etiketler vault öğelerinin `enc_metadata` alanı içinde şifreli. |
| **Hata sınıfı importları / tip güvenliği** | `tsc --noEmit` temiz; `strict` açık. Test kapsamı satır %91.4 / branch %81.9 — bir şifre yöneticisi için iyi. |

---

## 8. Önerilen Aksiyon Planı

### ✅ Aşama 0 — Tamamlandı (8/8 doğrulandı)

| # | Aksiyon | Durum |
|---|---|---|
| 1 | `checkAndTriggerAutoSnapshot`'ı `useVaultLock.lock` içinde, `closeVaultSession()`'den önce bağla | ✅ `useVaultLock.ts:26` |
| 2 | Kullanılmayan import'u kaldır (lint hatası) | ✅ `useVaultSnapshots.ts` |
| 3 | `LockScreenRecoveryModal` kapanışta hassas alanları sıfırlasın | ✅ Render-phase deseni |
| 4 | CSP'in bulduğu 3 React inline `style` prop'unu kaldır | ✅ `ui/ProgressFill.tsx` |
| 5 | `security:session-gates` ihlalini yetkilendir | ✅ `snapshots.ts` beyaz listeye |
| 6 | `ci.yml`'a `security` işi ekle | ✅ lint + audit + CSP + session-gates + **i18n:audit** + fuzz + gitleaks |
| 7 | `main.tsx`'a `import('./App.tsx')` zincirine `.catch` | ✅ `application.bundle.loadFailed` |
| 8 | `useAssetIntegrity`'ye `.catch` + fail-closed | ✅ Reddedilen doğrulama = başarısızlık |

### ✅ Aşama 1 — Tamamlandı (15/15, N-1 regresyonu sonradan kapatıldı)

| # | Aksiyon | Durum |
|---|---|---|
| 9 | `sqlite_opfs.ts:548` bütünlük hatalarını yutmasın | ✅ Yeniden fırlatıyor (ikinci yarı açık → Aşama 2 #34) |
| 10 | `persistVaultDatabase` yazamazsa `false` döndürsün | ✅ + O-23 kilit sızıntısı düzeldi |
| 11 | Okuma/yazma boyut sınırlarını eşitle | ✅ `lib.rs:343-351` |
| 12 | `waSqliteEngine` erişim sırası + `busy_timeout` | ✅ `enqueue()` + PRAGMA |
| 13 | `share.ts`: Argon2id + 12 karakter + deneme sayacı | ✅ (+ AAD salt bağlama) |
| 14 | `LockScreen` biometrik yoluna kilitleme koruması | ✅ |
| 15 | Senkronizasyon zaman damgalarını tam ISO-8601 yap | ✅ 6 nokta |
| 16 | `changeMasterPassword` sonrası `disableRecoveryKey()` | ✅ Her iki dal |
| 17 | `useRuntimeSecurity` ref tabanlı tek bağlanan abonelik | ✅ `disposed` yarışı da çözüldü |
| 18 | `VaultFormModal.onSave` await + `ConfirmModal` async onay | ✅ Çift gönderim guard'ı ile |
| 19 | `useSettingsBackupImport` zamanlayıcı cleanup | ✅ |
| 20 | Görünürlüğe dönüşte son tarih kontrolü + 60 sn tabanını kaldır | 🔴 N-1 regresyonu → ✅ **Aşama 0.5 #24/#28** |
| 21 | `runVaultAudit` zxcvbn kullansın | ✅ Hibrit: `>= 40` olanlar doğrulanıyor |
| 22 | İmza kapılarını release pipeline'a bağla | ✅ 3 platformda bloke edici |
| 23 | `no-js-master-string` tabanını daralt | ✅ 5 → 3 |

### ✅ Aşama 0.5 — Tamamlandı (8/9 kod, 1 operasyonel; 2 yeni bulgu açıldı ve kapandı)

| # | Aksiyon | Öncelik | Durum |
|---|---|---|---|
| **24** | **`useRuntimeSecurity`'te `backgroundDeadline`'ı `number \| null` yap ve `!== null` kontrolü ekle** (N-1). `isAutofillMode` erken dönüşü nedeniyle başlangıçta `0` kalmak "silahlanmamış" ile "süresi dolmuş" ayrımını yok ediyordu. | 🔴 **Yüksek** | ✅ `useRuntimeSecurity.ts:89,125` |
| **25** | **`fr.ts:224` ve `it.ts:224`'te `vaultForm.saveFailed` anahtarlarını tek tırnaka çevir** (N-2) — `i18n:audit` BLOCKED'tı. | 🔴 Yüksek | ✅ **+ kök neden:** `i18n-audit.cjs` artık iki tırnak stili de okuyor ve kanıtı kendi satırında raporluyor |
| **26** | `i18n:audit`'i CI'ın `security` işine ekle (kapı hiç çalışmıyordu, bozulması fark edilmedi) | Yüksek | ✅ `ci.yml` |
| **27** | `OnboardingTour.tsx:71`'de `data-testid` → `testId` (N-3). | Düşük | ✅ **`...rest` önerisi revize edildi** — bkz. §1.2 "Revize Edilen Öneri". Prop sözleşmesi `ProgressFill.test.tsx` ile sabitlendi. |
| **28** | `useRuntimeSecurity.test.tsx`'e N-1 senaryosu için kalıcı regresyon testi ekle | Yüksek | ✅ 3 test — `git stash` ile kırıldığı doğrulandı |
| **29** | `CHANGELOG.md`'ye "paylaşım bağlantıları Argon2id'ye taşındı, eski bağlantılar artık açılamaz" notu düş (N-4) | Düşük | ✅ Yeni `## 7.0.7.0` bölümü, `### Breaking Changes` |
| **30** | N-5: `src-tauri/deny.toml` (lisans/bans + advisory politikası) | Düşük | ✅ `[graph]/[advisories]/[bans]/[licenses]/[sources]` + CI `cargo deny check advisories bans licenses sources` |
| **31** | N-6: `journal_mode` eklenmeme kararının gerekçesini `waSqliteEngine.ts`'ye yorum olarak düş | Bilgi | ✅ `waSqliteEngine.ts:100-119` |
| **32** | N-4: `APPLE_*` ve Windows Authenticode secret'larını CI'a ekle | Operasyonel | ⏸️ **Bekliyor** — kodla kapatılamaz, secret yönetimi gerektirir |

### 🔴 Aşama 1.5 — Yeni (Aşama 0.5'te açılan iki bulgu; 1 gün)

| # | Bulgu | Aksiyon | Öncelik | Durum |
|---|---|---|---|---|
| **N-7** | `RUSTSEC-2026-0285` — `rustls 0.23.43` TLS 1.3 şifreleme düzeyi belirsizliği. `cargo deny check advisories` **CI'ı kırmızı bırakıyordu**; Rust tarafındaki tek güvenlik kapısı fiilen ölüydü. | `Cargo.lock`'u `rustls 0.23.45`'e yükselt (**istisna listesine ekleme**). `unic-*` için 5 unmaintained advisory'yi gerekçeli `ignore`'a al. `licenses` + `sources` politikasını tanımla ve CI'a bağla. | 🔴 **Kritik** | ✅ 4 kapı da PASS |
| **N-8** | Yok sayılan bir Android autofill isteği, `pendingAutofillRequest` state'inde sınırsız kalıyordu; bu da `isAutofillMode`'u `true` tutarak **arka plan otomatik kilidini süresiz bastırıyordu** (N-1'in ikinci kapısı). | Bekleyen isteği kendi tazelik penceresinde (`ANDROID_AUTOFILL_REQUEST_MAX_AGE_MS`) bir zamanlayıcıyla expire et. Süre hesaplanamıyorsa fail-closed. | 🔴 **Yüksek** | ✅ `useAndroidAutofillCoordinator.ts:96-131` + regresyon testi (`git stash` ile kırıldığı doğrulandı) |

### Aşama 2 — Orta vade (2–4 hafta)

| # | Aksiyon |
|---|---|
| 33 | ? **KISMEN KAPANDI** (bkz. §1.5) — `integrityHmac` varlığı zorunlu kılındı (`sealed` defteri) ve yüksek su işareti dosya dışına taşındı. **Kalan:** yüksek su işaretinin cihaz kaybında (IndexedDB temizlenir / yedek geri yüklenir) korunması → O-8. |
| 34 | ? **KAPANDI** (bkz. §1.4) — doğrulanmamış durumun yeniden imzalanması `mayReSignState()` ile engellendi; HMAC girdisine `sealedAtVersionCounter` kondu. |
| 35 | ? **KAPANDI** (bkz. §1.4) — `useAutoSnapshotScheduler` `UnlockedApp`e bağlandı (60 sn yoklama + açılışta anında + ön plana dönüşte). |
| 36 | `share.ts`'e zxcvbn güç skoru ekleyin (K-2 kalan). |
| 37 | ✅ **KAPANDI (bkz. §1.11 ve §1.12)** — sekmeler arası koordinasyon: yazma serileştirmesi (`navigator.locks`), taban tazelik kontrolü, commit duyuruları, çakışma UI'ı + kalıcı "yenile" banner'ı, `subscribeVaultCommits` tüketicisi, ve `moveToTrash`/`restoreFromTrash` için tek satır hedefli `setItemTrashedWithKey`. Yükleme yolundaki rollback tespiti kalıcı ledger'ı kullanıyor, `useVaultRollbackAlert` artık üretimde çalışıyor. 49 test, 2 mutasyonla doğrulandı. |
| 38 | ✅ **KAPANDI (bkz. §1.16)** — wa-sqlite `hydrate` memoize (uçuş promise'i, başarısızlık önbelleğe alınmıyor, 4 test); `readVaultItemRows` filtresi **SQL'e itildi** (`typeof(id)='text' AND length(id)>0`); satır bazlı kripto **sınırlı eşzamanlılığa** (16) alındı, sıra korunuyor. 5 test, 3 mutasyonla doğrulandı. |
| 39 | ✅ **KISMEN KAPANDI (bkz. §1.8)** — wa-sqlite terfi anahtarı hatası düzeltildi: terfi sonrası oturum anahtarı artık **her zaman** yeni aktif depodan türetiliyor, `existingKey` kısayolu kaldırıldı (Y-12), 5 regresyon testi. **Kalan:** `ensureOpen`'ta kalıcı olmayan VFS'ye sessiz düşüşü fail-closed yapın (O-15). |
| 40 | ✅ **KAPANDI (bkz. §1.3 ve §1.16)** — Android: autofill istekleri süreç registry'sine taşındı, `MainActivity` `exported="false"` yapıldı, LAUNCHER `LauncherActivity` trampoline'ine taşındı, düz metin şifre yolu silindi, `security:android-autofill-boundary` kapısı CI'a eklendi. |
| 41 | Android: `SecureStorageKeyStore`'a auth binding zorunlu kılın, `RUST-O5` rotasyonunu açılışta yapın (Y-8). |
| 42 | ✅ **KAPANDI (bkz. §1.12, §1.13, §1.14)** — Rust: KDF maliyet parametrelerine üst sınır (Y-16). Yerel IPC'nin yetki gerektiren komutlarına fail-closed oturum kapısı (#42). `open_import_file` artık hem `stat` hem akış düzeyinde sınırlı. 24 Rust testi, 4 mutasyonla doğrulandı. |
| 43 | ✅ **KAPANDI (bkz. §1.17)** — `revoke` artık diğer canlı oturumları da sonlandırıyor: paylaşılan `RevokeGeneration` sayacı eklendi, kontrol mesaj döngüsü değil **tek geçiş noktası olan `read_authenticated_frame`** içine kondu (döngüdeki tek satır test edilemiyordu, silinseydi sessizce geri geliyordu). Kontrol okumadan **sonra** konumlandı; başta da olması isteniyordu, ama o zaman **blokeli okuma sırasında gerçekleşen iptal** test edilemiyordu, bu yüzden gereksiz olan baş kontrolü kaldırıldı — daha az kod, daha çok kanıt. Jenerasyon artışı `rotate_pairing_token_now`'un içinde, çünkü token'ı **iki** yol döndürüyordu (`revoke` eylemi ve `rotate_pairing_token` komutu) ve raporda yazılmayan ikinci kapı buydu. 11 test, **9 mutasyon** — üçü aşırı düzeltme (her oturumu iptal et, sayacı sıfırla, önce yaz sonra kes), üçü de yakalandı. |
| 44 | ✅ **KAPANDI (bkz. §1.18)** — `index.html` artık bütünlük manifestinde ve `verifyRuntimeAssetIntegrity` manifesttekileri de dâhil **her** referansı reddediyor (Y-20). Dışlamanın "Tauri CSP'yi çalışma zamanında enjekte ediyor" gerekçesi **ölçülerek çürütüldü**: `tauri.conf.json`'un CSP'si ile `dist/index.html`'in CSP `<meta>` etiketi farklı stringler ve `<meta>` kaynak şablonuyla bayt bayt aynı. Karşı kontrol canlı `document`'i değil **doğrulanmış baytları** çözüyor, çünkü `outerHTML` yeniden serileştirme ve asla orijinal hash'i vermez. 10 test, 6 mutasyon — üçü aşırı düzeltme (her referansı reddet, `../`'yi çözümle, `.map`'leri de dahil et), üçü de yakalandı. |
| 45 | ⚠️ **KISMEN KAPANDI (bkz. §1.16)** — O-3 kapandı: öksüz kalan base64 legacy ana şifre (öğe blob'u silinmiş, depo boş) artık koşullardan bağımsız temizleniyor, **ve ayna yolundaki ikinci kapı** da kapatıldı; 3 test, 3 mutasyon. **Kalan (O-2):** `localStorage` aynası kaldırılmadı — göç yolu ona dayanıyor, asıl bulgu "düz metin sızıntısı" değil **sessiz bayatlama**. Önerilen sonraki adım: silmek yerine aynanın yaşını tutup bayatlığını görünür kılmak. |
| 46 | ✅ **KAPANDI (bkz. §1.7 ve §1.14)** — koşullu yazma (`If-Match`/ETag, 412/409 → `sync.remoteModified`) ve "uzak durum bilinmiyorken üzerine yazma" yasağı (Y-11, 17 test); meta veri şema doğrulaması + motor seviyesinde ikinci savunma (O-21, 20 test); indirme boyut tavanı (O-20, `Content-Length` + akış sınırı); `dispose()` referans sayımı ile hava boşluğu izin listesi sızıntısı (O-21, 16 test). |
| 47 | ✅ **KAPANDI (bkz. §1.16)** — Anlık görüntü geri yükleme artık **atomik** (tek `replaceAllVaultItemsWithKey`, tek kalıcılık yazımı, rollback var) ve bayt + öğe sayısı bütçeleri uygulanıyor. Anlık görüntü geri yükleme işlemini atomik yapın; boyut bütçesi + sağlama doğrulaması; `pruneSnapshotsRetention(settings.maxSnapshots)`; yanlış olay kodunu düzeltin. **Kilit ekranından tek tıkla yeniden kurulum ✅ KAPANDI** (bkz. §1.5); geri yükleme işleminin kendisi hâlâ atomik değil → O-16/O-17. || 48 | ? **KAPANDI** (bkz. §1.6) — WebAuthn assertion imzası artık saklanan public key ile doğrulanıyor: challenge, origin, crossOrigin, rpIdHash, UP bayrağı, userHandle ve `signCount` klon sinyali dahil 9 kontrol. `signCount` artık yerel `+1` değil, doğrulanmış sayaç. |
| 49 | CodeQL'e `rust` ve `java` ekleyin; Gradle `distributionSha256Sum` + `verification-metadata.xml` + dependabot `gradle` ekleyin. |
| 50 | `UnlockedApp.test.tsx` yazın + dosya bazlı kapsam eşikleri koyun (O-34). |
| 51 | ✅ **KAPANDI (bkz. §1.15)** — Güvenilmeyen KDF parametrelerine üst sınır kondu (O-6/O-7). Rust ve TypeScript sınırlarının ayrışmasını `security:argon2-bounds` kapısı engelliyor. |
| 52 | `-keep` kuralını daraltın, Android imzalamayı Gradle'da zorunlu kılın, `apksigner` parmak izi doğrulaması ekleyin. |
| 53 | Sürüm yayınlamayı taslak→yayın akışına çevirin; `latest.json` platform bütünlüğü iddiası ekleyin. |

### Aşama 3 — Uzun vade (yapısal) — Aynen geçerli

| # | Aksiyon |
|---|---|
| 54 | **Güvenlik kontrollerini "fail-closed" ilkesine tam geçirin.** K-3/K-4/K-5 artık fail-closed *olsa da* `sqliteOpfsPersistence` hâlâ `unavailable` ile bayat aynaya düşüyor ve `getVaultItems` hâlâ `[]` dönüyor. Bu, Aşama 2 #33'ün hedefi. |
| 55 | **Çözülmüş kasa anahtarını JS yığınından tamamen çıkarın** (`credential_handler.rs:161, 212-216` anahtarı döndürüyor). |
| 56 | **Tüm yerel IPC komutlarına Rust tarafında oturum kapısı ekleyin.** |
| 57 | Klasör / akıllı klasör / arama geçmişi / profil kitaplıklarını şifreli kasanın içine taşıyın. |
| 58 | `wa-sqlite`'i tek depolama motoru olarak konsolide edin. |
| 59 | `securityEvents` altyapısını genişletin: her yutulan `catch` için `critical` kaydı ve kullanıcıya yüzey çıkışı. |
| 60 | İnceleme dokümantasyonunu güncelleyin (`docs/ARCHITECTURE_REVIEW.md`, `docs/SECURITY_REVIEW_STATUS_2026.md`, `SECURITY_AUDIT_PACKAGE/SECURITY_NOTES.md` bu dalgayı yansıtmıyor; `SECURITY.md` mojibake). |
| 61 | Görevler ayrılığı: `CODEOWNERS`'ta kripto + CI yollarında en az iki bakımcı. |

---

## 9. Sonuç

### İlk İnceleme (Orijinal Durum)

AegisVault'un kriptografik temeli **sağlam** — Argon2id, AES-256-GCM, sıfırlanabilir oturum sırları ve doğru yazılmış native messaging kriptografisi bunun kanıtı. Test altyapısı (1860 test, fuzz, mutasyon testi) ve dokümantasyon kültürü profesyonel düzeyde.

Ancak **güvenlik kontrollerinin hata yolları** bu temeli zayıflatıyordu. Kritik/yüksek bulguların ezici çoğunluğu yeni bir açık değil, mevcut kontrollerin **sessizce vazgeçmesi**ydi.

### Aşama 0–1 Sonrası Durum (Arşiv)

**7 kritik bulgunun 5'i tamamen kapandı, 1'i kısmen, 1'i (K-1 Android) hiç dokunulmadı.** 24 yüksek bulgunun 15'i kapandı. Lint hatası gitti, üç güvenlik kapısı yeşile döndü, CI artık bu kapıları gerçekten çalıştırıyor ve imzasız yayınları engelliyor.

En kritik veri kaybı senaryoları kapatıldı:
- Kasa bütünlük hatası artık boş kasa olarak yutulmuyor → yemye değil, yüzeye çıkıyor
- OPFS yazma hatası artık başarı gibi raporlanmıyor
- OPFS kilit sızıntısı kapandı
- wa-sqlite işlemleri artık birbirini geri almıyor
- **Kullanıcının otomatik yedeklemesi artık gerçekten çalışıyor** (K-7) — bu, bir şifre yöneticisi için en yüksek getirili tek düzeltmeydi
- Paylaşım bağlantıları 4 karakterlik HKDF'ten 12 karakterlik Argon2id'ye geçti
- Biometrik yol kaba kuvvet kilitlemesini artık atlıyor değil
- Düz metin dışa aktarım artık ayarlardan ayrılınca tetiklenmiyor

**Uygulama kalitesi yüksek:** düzeltmeler üstü kapalı değil, kök nedeni hedefliyor; gerekçeler kodda belgelenmiş; bonus düzeltmeler getirilmiş (OPFS kilit sızıntısı, paylaşım deneme sayacı); iki güvenlik kapısı gevşetilmek yerine **sıkılaştırılmış**.

**O sıradaki en acil konu N-1'ydı** — Y-6'nın uç durum analizi yapılmadan uygulanması, Android autofill sonrası anında kilitleme getiriyordu. Bu, düzeltilen bir güvenlik açığının (arka plan kilidi uygulanmıyor) yerine geçen bir işlevsel regresyon ve **kullanıcıya neden açıklanamayan bir kilitlenme** olarak görünecekti. Bir satırlık düzeltme + bir regresyon testiyle kapandı, kapatıldıktan sonra da ikinci bir kapısı (N-8) bulundu — bkz. aşağıdaki "Aşama 0.5 Sonrası Güncel Durum" ve §1.2.

### Aşama 0.5 Sonrası Güncel Durum

**Aşama 0 ve 1 artık eksiksiz.** 23 kod kaleminin 22'si kapatıldı; tek kalan kalem (#32, imza secret'ları) kodla değil secret yönetimiyle çözülebilir ve o zamana kadar imzasız yayınları bilerek bloke ediyor. Yüksek öncelikli bulguların 17'si kapandı.

**Kritik RustSec açığı kapatıldı.** Aşama 0.5 sırasında `cargo deny check` çalıştırıldığında dört kapının da kırmızı olduğu görüldü: CI'ın Rust tarafındaki tek güvenlik kapısı (`check advisories`) **fiilen ölüydü** ve `rustls 0.23.43` üzerinde **RUSTSEC-2026-0285** (TLS 1.3 şifreleme düzeyi belirsizliği) açığını taşıyordu. Bu, raporun "CI yeşil" kaydının **yanlış** olduğunu gösterdi — yeşil görünen kapı, çalışmıyordu. Advisory istisna listesine eklenmedi; `rustls 0.23.45`'e yükseltildi. `licenses` ve `sources` politikaları ilk kez tanımlandı **ve** CI'a bağlandı (`cargo deny check advisories bans licenses sources`).

**Arka plan kilidi artık gerçekten fail-closed.** N-1'in regresyonu kapandı; kapattıktan sonra yapılan ikinci bir incelemede aynı fail-open'un **ikinci bir kapısı** bulundu (N-8): kullanıcının yok saydığı bir autofill isteği `pendingAutofillRequest`'te sınırsız kalıp `isAutofillMode`'u `true` tutuyor, dolayısıyla arka plan otomatik kilidi hiç silahlanmıyordu. İstek artık kendi tazelik penceresinde expire oluyor.

**İki sessiz düşüş sınıfı kalıcı olarak kapatıldı.** (a) `i18n-audit.cjs` artık hem tek hem çift tırnaklı anahtarları okuyor ve kanıtı **satır numarasıyla** raporluyor; ayrıca CI'da çalışıyor. (b) `ProgressFill`'ın kapalı prop listesi artık bir testle sabitlenmiş — ama bu, `...rest` yayılımı eklenerek değil, **eklenmeyerek** yapıldı: regex tabanlı CSP kapısının kendi çıkardığı açığı sessizce geri açmasına izin vermemek için.

**Doğrulama disiplini.** Yeni eklenen her regresyon testi, düzeltme `git stash` ile geri alınarak **kırıldığı doğrulandı** — yalnızca yeşil oldukları görülmedi. Lint uyarı tabanı (23) korundu; ilk denemede eklenen bir uyarı fark edilip tasarım değiştirildi.

**Sömürülebilir tek kritik bulgu K-1 kapandı** (bkz. §1.3). Android dışa açık `MainActivity` artık `exported="false"`; LAUNCHER filtresi hiçbir extra iletmeyen bir trampoline'e taşındı; autofill istekleri `AegisAutofillService`'in doldurduğu süreç-geneli bir registry'den çözülüyor ve intent yalnızca 128-bit rastgele bir taşıma id'si taşıyor. Kimlik bilgisi `setResult` yoluyla artık yalnızca sistemin kendi `PendingIntent`'ini yürüttüğü, bizim kaydettiğimiz bir istek için dönebiliyor. Düz metin şifre kabul eden `EXTRA_AUTOFILL_SAVE_PASSWORD` yolu tamamen silindi, istek id'leri tahmin edilemez hale geldi, ve bu sınır artık `security:android-autofill-boundary` adlı **18 kontrollük statik kapıyla** CI'da kilitli.

**Passkey "kimlik doğrulama" eylemi artık gerçekten doğrulanıyor (O-4, bkz. §1.6).** Önceden `navigator.credentials.get()` çağrısının ardından yalnızca credential id eşleşmesine bakılıyor, imza `clientDataJSON` ve `rpIdHash` hiç incelenmiyor, buna rağmen UI başarılı gösteriyor ve kasa `signCount` artırıyordu. Şimdi dokuz kontrol uygulanıyor ve `signCount` doğrulanmış sayaçtan geliyor.

**Kalan en yüksek konu O-8:** `versionCounter` yüksek su işareti dosya dışında tutuluyor, yani kasa dosyasını düzenlemek tek başına yetmiyor. Ancak iki konumu da kaybetmek (IndexedDB temizlenmesi, yedekten geri yükleme) hâlâ rollback'e açık. → Aşama 2 #33.

**K-4'ün kilit ekranı yolu tamamlandı:** bozuk kasa için kullanıcı artık Settings'e gitmek zorunda değil; kilit ekranı anlık görüntüleri listeliyor, tek tıkla yeniden kuruyor, ve yanlış parola yıkıcı eylemden **önce** reddediliyor. Geri yükleme işleminin kendisi hâlâ atomik değil (O-16/O-17) → Aşama 2 #47.

**Senkronizasyon artık uzak yedeği ezmiyor (Y-11, bkz. §1.7).** Bulgu yeniden doğrulandığında `getRemoteMetadata` sözleşmesindeki tek bir belirsizliğin — `null`'ın hem "uzak yok" hem "meta veri okunamadı" anlamına gelmesi — kullanıcının cihaz dışı tek yedeğini yok edip bunu `success` olarak bildirdiğini gösterdi. Düzeltme sözleşmede: üç durum ayrıştırıldı (`absent` / `unreadable` / `ok`), `unreadable` artık **hata** ve yazmayı durduruyor, yazma okunan `ETag` ile koşullu (`If-Match`), 412/409 `sync.remoteModified` olarak yüzeye çıkıyor. 17 regresyon testi; bunlardan biri mutasyonla kırıldığı doğrulandı.

**Terfi sonrası ana şifre değiştirme artık mümkün (Y-12, bkz. §1.8).** wa-sqlite terfi hedef depoda `setupMaster` çağırarak **yeni** bir tuz üretiyor ve göç eden satırları o yeni tuzdan türetilen anahtarla yazıyor; buna rağmen kod oturumdaki **eski** OPFS anahtarını terfi sonrası geri yazıyordu. Kullanıcının ilk `changeMasterPassword` çağrısı ilk satırda `WA_SQLITE_ROW_DECRYPT_ERROR` alıyor, yani terfi başarıyla tamamlanmış bir kasa kullanıcı için kalıcı olarak parola değiştirilemez hale geliyordu. Kısayolun "IPC sınırını ikinci kez geçmemek" gerekçesi gerçek değildi — kimlik bilgisi zaten o kapsamda çözülmüştü. K-3'teki "mevcut durumu yeniden kullanma" sapmasının ikinci örneği.

**Terfi sonrası "boş kasa" artık imkânsız (Y-13, bkz. §1.9).** Bulgu yeniden incelendiğinde etkinin raporda anlatılandan ağır olduğu görüldü: `hydrate()` geçici olarak başarısız olduğunda işaret siliniyor, `hasLegacyData` yanlış dönüyor ve akış **marka yeni boş bir veritabanı** açıp başarı durumuyla (`activated-wa-sqlite-default`) ekrana koyuyordu. Kullanıcının verisi sağlam kalıyor ama erişilebilir hiçbir referansı kalmıyordu. Tasarımın dayandığı tespit şuydu: `catch` içindeki temizleme **hiçbir zaman meşru değil**, çünkü uyumsuz işaretler zaten okuma sırasında siliniyor. Artık `unavailable` ayrı bir durum, işaret korunuyor, aktivasyon dalı atlanıyor ve kullanıcı başarısız bir parola formu yerine açık bir "tekrar dene" ekranı görüyor.

**Kasa okumak artık veri silmiyor (Y-14, bkz. §1.10).** `getVaultItems()` bir *okuma* fonksiyonu olmasına rağmen 15 günden eski çöp öğelerini geri alınamaz biçimde siliyordu ve **11** çağrı noktası vardı. En kötüleri: bir yedek almak, bir yedek geri yüklemek, WebDAV/S3'e senkronize olmak ve bir passkey işlemi yapmak — hepsi onaysız ve günlüksüz çöp temizliği tetikliyordu. Okuma artık saf; temizlik ayrı, açık ve `storage.trashRetention.purged` olayı kaydeden bir işlem, yalnızca `useVaultData.refreshDatabase` tarafından bir kez çağrılıyor. Snapshot/senkronizasyon/passkey/içe aktarma yolları yapısal olarak temizliğe ulaşamaz. Aynı bulgunun ikinci yarısı da kapandı: otomatik kilitleme bir kaydın ortasında tetiklenirse UI listesi artık boşalmıyor.

**Sekmeler arası sessiz veri kaybı kapandı (Y-15, bkz. §1.11).** Bulgu, rapor yazıldıktan sonra eklenen Y-5/K-3 düzeltmeleriyle kısmen eskimişti; dört iddia yeniden incelendi ve tamamı doğrulandı. Asıl keşif şuydu: kalıcı yüksek su işareti **zaten vardı** ama yalnızca yazma yolu onu kullanıyordu. Yükleme yolu modül-globaline bakıyordu ve bu değişken taze sayfa yüklemesinde `0` olduğu için rollback tespiti hiç tetiklenmiyordu — yani `useVaultRollbackAlert` gerçekten ölü koddu ve kullanıcı geri alınmış kasa karşısında yalnızca açıksız bir kayıt hatası alıyordu. İki yol artık aynı işareti kullanıyor.

Kayıp güncelleme için raporun önerdiği kilit **tek başına yeterli değildi** ve bu teknik itiraz kayda geçti: kilit yazmaları serileştirir ama bayt B yine de bayt 10'daki bellek kopyasından tüm blob'u yeniden yazar. Bu yüzden serileştirmenin yanına bir taban tazelik kontrolü eklendi; başka bir sekmenin meşru yazması geçerli bir HMAC ürettiği için bütünlük kapısı onu göremez, yalnızca taban karşılaştırması yakalayabilir.

**Sekmeler arası sessiz veri kaybı ve IPC maliyet parametreleri DoS'u kapandı (Y-15, Y-16 — bkz. §1.11 ve §1.12).** Y-15'in kalan üç parçası bu oturumda tamamlandı: reddedilen yazma artık kullanıcıya "değişikliğin kaydedilmedi" mesajıyla ulaşıyor ve liste boşalmıyor, kalıcı bir "yenile" banner'ı ekranda kalıyor, `subscribeVaultCommits`'in gerçek tüketicisi yazıldı ve `moveToTrash`/`restoreFromTrash` artık tek satırı hedefliyor (okuma ile yazma arasında değişen alanların sessizce geri alınması bitti).

Y-16 Rust tarafında kapatıldı ve **derlenerek** doğrulandı. En kayda değer bulgu, bulgunun "zaten kısmen korunuyor" görünmesiydi: `argon2::Params::new` bazı değerleri reddediyor, ama yalnızca Argon2 *spesifikasyon* sınırlarına karşı — ~2 GiB'lık bir isteği memnuniyetle kabul ediyor. Tehlike crate'in reddettiği değil, kabul ettiği bölgede; bu gerekçe teste sabitlendi ki ileride "tavan gereksiz" sanılıp kaldırılmasın.

İki tasarım kararı da kayda geçti: Argon2id parametreleri **sessizce kırpılmıyor, reddediliyor** (sessiz kırpma çağırana istediğinden farklı bir anahtarı "başarılı" diye verirdi) ve banner bildirim bayrağı temizlendiğinde kapanmıyor, **yalnızca liste gerçekten yeniden okunduğunda** kapanıyor.

**Loopback IPC artık kaynak tüketemiyor ve yayın imzalama mekanizması bağlı (Y-18, Y-19, #42 — bkz. §1.13).** IPC'ye 30 saniyelik okuma / 15 saniyelik yazma zaman aşımı ve 32 bağlantılık bir eşzamanlılık kapısı eklendi. Kapı bilinçli olarak **bekletmiyor, reddediyor**: bloklayan bir semaphore, sınırın varlık sebebi olan DoS'un kendisini geri getirirdi.

Bu turda iki şeyi doğrulamak özellikle değerliydi. Birincisi, **oturum kapısını yükseklikte uygularken uygulamayı kıracaktım**: `read_vault_database` komutunu kapıya bağladım, sonra çağrı sırasını kontrol edince gördüm ki oturumu besleyen okuma, oturumdan *önce* geliyor — kilit hiç açılamazdı. İkincisi, Y-19'un "imza kapısı hiç çalıştırılmıyor" iddiası **eskimişti**; kapı zaten bağlıydı. Rapordaki bulguyu körlemesine uygulamak, yanlış olan kısmı da "düzeltilmiş" diye kaydetmimi sağlardı.

Y-19'un gerçek kalan kısmı imzalamanın kendisiydi. macOS ad-hoc idi, Windows'ta imzalama hiç yoktu. İkisi de secret'a bağlı gerçek imzalamaya bağlandı, **fail-closed korunarak**: secret yoksa adım atlanır ve mevcut kapı işi düşürür, yani imzasız genel yayın hâlâ imkânsız. Ayrıca `security:release-signing` adlı yeni bir statik kapı eklendi — mevcut kapı sonucu doğruluyor, yeni olanı **mekaniği** doğruluyor (imzalama adımı silinmiş, yanlış sıraya konmuş veya yanlış secret'a bağlanmış olsaydı, ancak yayın gününde kırmızı çıkardı).

**Doğrulama borcu KAPANDI.** Rapor artık "yayın öncesi bir Android derlemesi alınmalıdır" demiyor: `:app:compileArmDebugKotlin`, `:app:compileUniversalDebugKotlin` ve `:app:lintArmDebug` **BUILD SUCCESSFUL** (bkz. §1.16). Önceki denemeler yalnızca iki yapılandırma eksiğinden başarısızdı — `local.properties` yoktu ve yazıldığında ters eğik çizgiliydi (doğrusu `sdk.dir=C\:/Users/...`).

Bu derlemenin asıl kazancı, daha önce hiç çalışmayan bir kapının ortaya çıkmasıydı: **Android lint CI'a hiç bağlı değildi** ve yedi hata bekliyordu — bunların üçü K-1'in eklediği yollardan, API 26+ bir tipi minSdk 24 iken referans alan bir sınıftan. Lint artık `npm run android:lint` ile CI'da ve K-1 statik kapısı bunu zorunlu tutuyor.

**Snapshot geri yükleme artık atomik ve sınırlı (O-16/O-17 — bkz. §1.16).** Geri yükleme, silinen her öğe için ayrı bir tam kasa yazımı yapıyordu; bir adım başarısız olunca kasa yarı silinmiş ve geri dönüşsüz kalıyordu. Artık tek bir atomik değiştirme, tek kalıcılık yazımı ve rollback var. `validateBackupPayload`'ın bayt bütçesi zaten vardı ama bu çağrı yerine hiç geçirilmiyordu — sınır kâğıt üzerinde mevcuttu; artık uygulanıyor ve öğe sayısı için ikinci bir bütçe eklendi.

**Doğrulama disiplini bu turda da sürdü.** `NewApi` bulgusunda önce yanlış sonuca vardım: "API 24/25'te her açılışta çöker" dedim, sonra `const val` gömme mekanizmasını fark ederek düzelttim. Gerekçeyi kodun içine yazdım, çünkü bu yol her açılışta çalışıyor ve ileride `const val` olmaktan çıkarsa gerçekten çöker. Ayrıca "depo boş değiştirmeyi reddeder" diye bir test yazmıştım ama o davranışı hiç kurmamıştım — testi kurarken kararı netleştirmek zorunda kaldım.

**Güvenilmeyen uzak tarafı artık sınırlı (O-20, O-21 — bkz. §1.14).** Uzak senkronizasyon yükü `res.text()` ile sınırsız okunuyordu — depodaki her güvenilmeyen girdi yolunun sınırı varken, uzak partinin kontrolündeki tek yolun yoktu. Daha keskin olanı metadata doğrulamasıydı: `updatedAt` ayrıştırılamazsa `NaN` oluyor, `NaN > x` her zaman `false` olduğu için senkronizasyon "uzak daha yeni değil" deyip **indirmeyi atlıyor** ve üzerine yazıyordu — yani ~60 baytlık bir dosya sağlam bir uzak yedeği yıkabiliyordu. Doğrulama hem sağlayıcılarda hem **motorda** yapılıyor; çünkü `NaN`'ın oluştuğu ve kararın verildiği yer motordur.

Aynı bulgunun ikinci yarısı bir izin listesi sızıntısıydı: "Test connection" düğmesi her tıklamada kalıcı bir ağ muafiyeti bırakıyor, `dispose()` hiç çağrılmıyordu. Referans sayımıyla kapatıldı.

**Bu turda iki test düzeltmesi yapıldı ve ikisi de aynı dersi verdi.** Biri: stream boyut sınırını gerçek bir dosyayla test etmek imkânsız, çünkü `stat` ön kontrolü zaten yakalıyor — sınırı kaldırsanız bile testler yeşil kalıyordu; sentetik okuyucuya geçirildi. İkisi: eşzamanlılık testi toplam edinimi sınırlıyordu, oysa sınır *eşzamanlı* sayıyı sınırlıyor. **Yeşil bir test, tek başına kanıt değildir.**

---

**`revoke` artık gerçekten iptal ediyor (#43 — bkz. §1.17).** Bulgu bir eksik düğme değil, **"token döndürme hiçbir koşulda canlı oturumları sonlandırmıyor"** idi: `handle_client` `session_data_key`'i bağlantı anında bir kez türetiyor, sonra onu bellekte taşıyor; token'ın kendisi hiçbir istekte karşılaştırılmadığı için döndürmek yalnızca gelecekteki el sıkışmalarını etkiliyordu. Kullanıcı "bağlantıyı kes" dediğinde olan şey "yalnızca kendi bağlantısını kes" oldu.

Raporda yazılmayan ikinci bir kapı çıktı: **`rotate_pairing_token` komutu da token döndürüyordu**, yani aynı kusuru taşıyordu. Sadece `revoke`'u düzeltmek bulgunun yarısını düzeltmek olurdu. Bu yüzden jenerasyon artışı, döndüren fonksiyonun **içine** kondu — iki yoldan biri unutsa bile açılmaz.

Bu turda asıl değerli olan kısım düzeltmenin kendisi değil, **kendisini test edemeyen bir düzeltmeyi fark etmem** oldu. Kontrolü önce mesaj döngüsüne koydum; sonra o satırı sildiğimde hiçbir test kırmadı, çünkü `handle_client` bir `tauri::AppHandle` istiyor ve testler ona hiç ulaşamıyor. Kontrolü **tek geçtiği noktaya**, çerçeve okuyucuya taşıdım — artık atlanmasının tek yolu okuyucuyu kullanmamak.

İkinci ders, aşırı düzeltme disiplininin **eksiltme** yönünde işe yaramasıydı. Kontrolü hem fonksiyonun başına hem sonuna koymuştum (baştaki, sessizce duran iptal edilmiş bağlantıyı erken kapatmak içindi). Sonraki kontrolü silen mutasyonu denediğimde "blokeli okuma sırasında iptal" testim yine de geçti — çünkü testimin "başladı" sinyali fonksiyon çağrılmadan önce gönderiliyordu ve iptali **baş** kontrolü yakalıyordu. Baş kontrolü kaldırınca sonraki kontrol tek kontrole dönüştü ve test gerçekten bir şey kanıtlamaya başladı: **daha az kod, daha çok kanıt.**

Dokuz mutasyonun üçü kasıtlı olarak aşırı düzeltmeydi ve üçü de yakalandı: *her* oturumu jenerasyon fark etmeksizin iptal etmek (yeni token'la yeniden el sıkışmış meşru oturumu öldürür), sayacı ilerletmek yerine **sıfırlamak** (emekliye ayrılmış oturumu geri canlandırır) ve "önce diske yaz, sonra bağlantıları kes" (fail-open: kullanıcı bağlantıyı kesmeyi istedi, yazma başarısız oldu, eklentiler hiçbir şey olmamış gibi okumaya devam etti).

---

**`index.html` artık bütünlük kapsamında, ve `dist/`'de garantisi olmayan dosya kalmadı (#44 / Y-20 — bkz. §1.18).** Bulgu, `dist/` içinde bütünlük garantisi olmayan **tek** dosyanın her diğer betiği yükleyen belge olmasıydı: yerel bir yazma `<script src="evil.js">` eklediğinde kök hash'i hâlâ eşleşiyor, kontrol `{status:'verified'}` döndürüyor ve çözülmüş kasayla keyfi JS çalışıyordu.

Bu bulgunun en ilginç tarafı, dışlamanın **gerekçesiz** olmamasıydı. Kodda gerekçesi yazılıydı ve makul görünüyordu: "Tauri yapılandırılmış CSP'yi `index.html`'e çalışma zamanında enjekte ediyor." Bu Tauri v2 için doğru değil, ama tahmin etmek yerine **ölçtüm**: `tauri.conf.json`'un CSP'si ile derlenmiş `dist/index.html`'in CSP `<meta>` etiketi **farklı stringler**, ve `<meta>` etiketi kaynak şablonuyla bayt bayt aynı. Tauri kendi policy'sini yanıt başlığı olarak uyguluyor, dosyayı diskte yeniden yazmıyor. Gerekçe yanlıştı; ve raporda "niçin yapıldı" sorusu cevaplanmadan geçildiği için fark edilmemişti.

Bulgu iki yarımdan oluşuyordu ve ilkini yapmak ikincisini açık bırakırdı: `index.html`'i hash'lemek, manifestte **olmayan** bir isteği reddetmeyen bir doğrulamayı daha güçlü kılmaz. Karşı kontrol eklendi — ama canlı `document`'i okumak yerine **doğrulanmış baytları** çözüyor, çünkü `document.documentElement.outerHTML` ayrıştırılmış DOM'un yeniden serileştirilmiş hâli ve orijinal hash'i asla vermez.

Bu turda da bir refleksi durdum: yeni kontrol `DOMParser` istediği için test dosyasını bölmek istedim. Bu refleksi sorguladım, çünkü **güvenlik açısından ters yönde** bir bölme olurdu — yeni kontrolün uçtan uca testi, kontrolün çalıştığı ortamdan ayrılırdı. Önce ölçtüm: jsdom hem `DOMParser` hem çalışan `crypto.subtle` sağlıyor. Bölme gereksizdi.

Altı mutasyonun üçü aşırı düzeltmeydi. En öğretici olanı, "her referansı reddet" yazımının meşru yapıyı bozduğunu ve **bunu meşru yapıyı reddeden bir regresyon testiyle** yakaladığım: `blob:` ve `data:` referansları paketlenmiş dosya değil, uygulamanın kendi ürettiği şeyler. Diğer aşırı düzeltme, `../`'yi aramadan önce çözümlemekti — bu, dist'ten kaçan bir referansı listede bulunabilecek bir şeye dönüştürerek **sessiz** bir açık kapı açardı; bir regresyon gibi görünmez, o yüzden sessizliği tehlikeli kılıyordu.


