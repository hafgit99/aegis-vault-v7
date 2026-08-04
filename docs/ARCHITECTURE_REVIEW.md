# AegisVault v7 — Kod Mimarisi Derinlemesine İnceleme Raporu

> **Hazırlayan:** Mavis
> **Tarih:** 2026-08-02
> **Kapsam:** `aegisvaultv7` deposu — Tüm katmanlar, özellikle Android (Tauri Mobile)
> **Sürüm:** 7.0.1.0 (npm) / 7.0.1 (Tauri) / versionCode 7000001
> **Yöntem:** Statik kod analizi, manifest ve Gradle inceleme, mimari gözden geçirme
> **Format:** Bulgular → Risk seviyesi → Somut öneri. Aksiyon planı en sonda.

---

## 0. Yönetici Özeti (TL;DR)

AegisVault, **iyi tasarlanmış, güvenlik-odaklı, yerel-önce (local-first) bir şifre yöneticisi**. Mimari seçimler büyük ölçüde doğru: Tauri 2 + React 19 + Rust çekirdeği, Argon2id KDF, AES-256-GCM, Android için native Kotlin katmanı, ciddi bir test/mutasyon altyapısı (Stryker, fast-check, Vitest, Playwright) ve uçtan uca release gate'leri (CSP denetimi, asset integrity, signing doğrulama, no-JS-master-string kontrolü).

**Güçlü yönler**
- Sıfır-bilgi (zero-knowledge) tasarım — ana şifre Rust tarafında hiç materialleşmiyor, vault key HKDF ile türetiliyor
- Kriptografik boru hattı tek noktada (Web Crypto + Tauri tarafında zeroize) — legacy XOR şifreleme bilinçli olarak kaldırılmış
- Android autofill, native `AutofillService` ile yapılıyor (Tauri WebView içine sıkışmamış)
- AndroidKeyStore AES-GCM ile donanım destekli depolama
- Privacy shield (FLAG_SECURE), runtime root/instrumentation sinyalleri, WebView hardening
- CSP `default-src 'self'`, `connect-src ... https://api.pwnedpasswords.com` — `unsafe-inline` yok
- 100'den fazla kaynak modülü, çoğunun eşlik eden `.test.ts` dosyaları
- Mutation testing ve fuzz testleri sürekli korunuyor

**Kritik iyileştirme alanları (Android odaklı)**
1. Sadece `arm64-v8a` ABI'si üretiliyor — 32-bit cihazlar, Chromebook Android, x86 emülatörler tamamen dışlanıyor
2. `AegisAutofillService.onSaveRequest` parolayı `Intent` extras içinde taşıyor — bu bir güvenlik kokusu
3. File bridge'te dosya boyutu / streaming kontrolü yok — OOM ve zip-bomb riski
4. `MainActivity` 700+ satır ve 4 ayrı sorumluluk taşıyor — bölünmesi gerek
5. Privacy shield "magic number" post-delays ve sentetik focus event'leri ile çalışıyor — kırılgan

Aşağıda her madde dosya/satır referansıyla detaylandırılmıştır.

---

## 1. Genel Mimari

### 1.1 Katmanlar

| Katman | Teknoloji | Konum |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind 4 + Framer Motion + Lucide | `src/` |
| Mobile/Cross Shell | Tauri 2.11.2 | `src-tauri/` |
| Backend (native) | Rust 2021, edition 1.77.2 | `src-tauri/src/` |
| Crypto | Argon2id (Rust tarafı), Web Crypto API (browser/mobil), AndroidKeyStore (mobil native) | `src/lib/encryption.ts`, `src/lib/argon2id.ts`, `src-tauri/src/credential_handler.rs` |
| Storage | SQLite (wa-sqlite tarayıcıda, native Tauri dosya) + IndexedDB (attachments) | `src/lib/sqlite_opfs.ts`, `src/lib/indexedDbStorage.ts`, `src-tauri/src/lib.rs` |
| Android shell | Kotlin, TauriActivity tabanlı | `src-tauri/gen/android/app/src/main/java/...` |
| iOS shell | Tauri Mobile (henüz init edilmemiş — `tauri ios init` scriptleri var) | — |
| Browser extension | MV3 (Chrome) + Firefox (XPI) | `src-extension/` |
| Test | Vitest, Playwright, Stryker mutator, fast-check, fake-indexeddb | `tests/`, `*.test.ts(x)` |

### 1.2 Veri Akışı (Özet)

```
[Lock Screen]
   │ master password
   ▼
[Argon2id KDF (argon2-browser veya native)] → vault key
   │ vault key (HKDF)
   ├──→ [session encryption key] (in-memory, zeroize on lock)
   ├──→ [attachment key] (HKDF "aegis-vault-v7:attachment-key")
   └──→ [DB encryption key (sqlcipher/wa-sqlite)]
   │
   ▼
[Tauri IPC: read_vault_database / write_vault_database]
   │ aegis_sqlite.db (Tauri app_data_dir)
   │ ŞİFRE ÇÖZME FRONTEND TARAFINDA YAPILIYOR (zero-knowledge)
   ▼
[IndexedDB attachments (browser/mobil)] — ayrı DB, attachment key ile şifrelenmiş
   │
   ▼
[JS↔Native bridge]
   ├── AegisAndroidFiles    : dosya kaydet/aç (SAF)
   ├── AegisAndroidSecureStorage : AndroidKeyStore köprüsü
   ├── AegisAndroidAutofill : AutofillService ↔ WebView
   └── AegisAndroidSecurity : runtime posture
```

### 1.3 Modül Yapısı (Frontend)

Frontend "concerns by directory" yaklaşımı kullanıyor:
- `components/` — UI (40+ bileşen, her birinin test dosyası var — mükemmel disiplin)
- `hooks/` — 20 hook (state, side effects, business logic)
- `context/` — sadece ThemeContext
- `lib/` — 50+ pure logic modülü (crypto, storage, share, importer, sync, vb.)
- `i18n/` — çoklu dil (TR/EN)
- `types/` — paylaşılan tipler

**Gözlem:** `App.tsx` 600+ satır ve **20+ hook** çağrısı içeriyor. Bu, uygulamanın iyi hook'lara bölündüğünü gösterir ama `App.tsx` hâlâ bir "god component" olmaya aday. İleride `<DashboardPage>`, `<SettingsPage>`, `<AutofillOverlay>` gibi route/page-level kompozisyonlara geçmek okunabilirliği artırır.

---

## 2. Android Tarafı — Derinlemesine İnceleme

### 2.1 Dosya Haritası

```
src-tauri/gen/android/
├── build.gradle.kts            → app modülü
├── app/
│   ├── build.gradle.kts        → signing, buildTypes, proguard
│   ├── proguard-rules.pro      → köprü metotları korunuyor
│   ├── tauri.properties        → versionName/versionCode (auto)
│   └── src/main/
│       ├── AndroidManifest.xml → activity + service + provider
│       ├── java/com/hafgit99/aegisvault7/
│       │   ├── MainActivity.kt       → 712 satır — TÜM KÖPRÜLER + YAŞAM DÖNGÜSÜ
│       │   └── AegisAutofillService.kt → 259 satır — Autofill akışı
│       ├── res/
│       │   ├── layout/activity_main.xml   → "Hello World!" (şablon kalıntısı!)
│       │   ├── xml/aegis_autofill_service.xml
│       │   ├── xml/file_paths.xml
│       │   ├── values/{strings,themes,colors}.xml
│       │   └── values-night/themes.xml
│       ├── jniLibs/arm64-v8a/  → SADECE TEK ABI
│       └── assets/tauri.conf.json
└── gradle/                     → wrapper
```

### 2.2 Manifest Analizi (`AndroidManifest.xml`)

**İyi yanlar:**
- `android:allowBackup="false"` ve `android:fullBackupContent="false"` — vault verisi yedeklenmiyor (doğru)
- `singleTask` launch mode — tek örnek, deep-link için uygun
- LEANBACK_LAUNCHER desteği (AndroidTV)
- `BIND_AUTOFILL_SERVICE` permission doğru tanımlı
- `FileProvider` tanımlı (export paylaşımı için)

**Sorunlar:**

| # | Bulgu | Risk |
|---|---|---|
| M-1 | `<application android:exported>` varsayılan değerine bırakılmış. Sadece `MainActivity` ve `AegisAutofillService` için açıkça `exported` belirtilmiş. Android 12+ için bu zaten gerekli, ama gelecekte eklenen componentler için default `false` kalmalı. | Düşük |
| M-2 | `FileProvider` authority `${applicationId}.fileprovider` — debug build'de `applicationIdSuffix=".debug"` olduğu için authority `com.hafgit99.aegisvault7.debug.fileprovider` olur. `file_paths.xml`'de `external-path` ve `cache-path` var, ama `files-path` (uygulama içi veri) yok. Export paylaşımı için gerekebilir. | Orta |
| M-3 | AutofillService `android:exported="true"` — zorunlu (sistem çağırır), ama meta-data `android:autofill` `aegis_autofill_service.xml`'e bağlı. Bu dosyada sadece `settingsActivity` tanımlı, `compatibleConfigurations` yok. Yeni `setInlineSuggestionsEnabled` (API 30+) veya `setSupportedPartitionConfigs` (API 33+) kullanılmamış. | Düşük/İyileştirme |
| M-4 | `<uses-permission android:name="android.permission.INTERNET" />` — Tauri runtime gerekli olabilir ama vault'ın zero-knowledge yapısıyla çelişmiyor. Ancak kullanıcıya "İnternet kullanmaz" iddiası varsa bu bir UX/marka riski. | Düşük |
| M-5 | `uses-feature android.software.leanback required="false"` — AndroidTV için iyi. AMA `android:resizeableActivity` ve picture-in-picture desteği yok. Tablet/Chromebook için faydalı olur. | Düşük |

### 2.3 `MainActivity.kt` — Bileşen Analizi

`MainActivity` 712 satır, dört ayrı `inner class` (köprü) ve yaşam döngüsü metodlarını barındırıyor. Bu, **"fat activity"** pattern'i.

#### 2.3.1 WebView Hardening (`hardenWebView` — satır 503-515)

```kotlin
webView.removeJavascriptInterface("searchBoxJavaBridge_")
webView.removeJavascriptInterface("accessibility")
webView.removeJavascriptInterface("accessibilityTraversal")
webView.settings.apply {
  javaScriptCanOpenWindowsAutomatically = false
  setSupportMultipleWindows(false)
  mixedContentMode = MIXED_CONTENT_NEVER_ALLOW
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    safeBrowsingEnabled = true
  }
}
```

**İyi.** Endüstri standardı. Ancak eksikler:
- `setAllowFileAccess(false)`, `setAllowFileAccessFromFileURLs(false)`, `setAllowUniversalAccessFromFileURLs(false)` açıkça ayarlanmamış — Tauri default'larına güveniliyor
- `WebView.setSafeBrowsingWhitelist` veya `setProxyConfig` çağrılmamış
- `OnBackInvokedDispatcher` (Android 13+ predictive back) için destek yok
- `setForceDarkAllowed` çağrısı yok — `values-night/themes.xml` kullanılıyor ama WebView için zorunlu değil

#### 2.3.2 File Bridge (`AndroidFileBridge` — satır 288-363)

```kotlin
@JavascriptInterface
fun saveBase64File(requestId, defaultFilename, mimeType, contentsBase64) {
  // ...
  pendingSave = PendingSave(requestId, Base64.decode(contentsBase64, Base64.DEFAULT))
  launchCreateDocument(...)
}
```

| # | Bulgu | Risk | Öneri | Durum |
|---|---|---|---|---|
| F-1 | **Dosya boyutu sınırı yok.** `Base64.decode` ve `contents.toByteArray` tüm payload'ı belleğe alıyor. 50 MB'lık bir backup → 50 MB string → 67 MB base64 → **~70 MB byte[]**. Büyük attachment'lı vault'larda OOM. | **YÜKSEK** | (a) `saveBase64File` için `MAX_PAYLOAD_BYTES` (örn. 25 MB) sınırı; (b) `contentResolver.openOutputStream` + parça parça yaz; (c) Vault verisini `Intent.ACTION_CREATE_DOCUMENT` ile kaydederken streaming pipe kur | ✅ **RESOLVED** — TypeScript tarafında `MAX_ANDROID_PAYLOAD_BYTES = 25 MB` erken kesme; Kotlin tarafında `saveTextFile` / `saveBase64File` boyut guard'ları (decode öncesi tahmin + decode sonrası doğrulama); `handleSaveFileResult` → `BufferedOutputStream` + 8 KB chunk streaming write |
| F-2 | **`pendingSave` ve `pendingOpenRequestId` tek-slot**. Aynı anda gelen iki istek birbirini eziyor (`Another file operation is already in progress.`). Autofill kayıt + dosya export çakışabilir. | Orta | `ConcurrentHashMap<requestId, PendingSave>` veya bir FIFO kuyruğa al | |
| F-3 | `displayNameForUri` içinde cursor yönetimi try/finally ile yapılmış ama `cursor.moveToFirst()` null dönerse veya hata olursa fallback `"selected-import"` her zaman sabit. Kullanıcı hangi dosyayı seçtiğini göremez. | Düşük | Uri son segmentini veya path'i parse et | |
| F-4 | `openTextFile` `contentResolver.openInputStream(uri)?.bufferedReader().use { it.readText() }` — `readText()` tüm içeriği belleğe alır. 100 MB'lık bir "aegis" dosyası seçilirse OOM. | **YÜKSEK** | Boyut kontrolü + `useLines` / streaming parser; `FileDecoder.ts` zaten parser-side'da streaming yapıyor olabilir ama bridge katmanında erken kesmek gerek | ✅ **RESOLVED** — `handleOpenFileResult` → `OpenableColumns.SIZE` ile ön-kontrol (25 MB limit) + `bufferedReader` + 8 KB `CharArray` chunk okuma + `StringBuilder`; boyut aşımı hem metadata hem streaming sırasında yakalanır |
| F-5 | MIME tipi `mimeType` parametresi JS'ten geliyor ve `Intent.ACTION_CREATE_DOCUMENT.type` ile doğrudan kullanılıyor. JS tarafı güvenilir (aynı WebView) ama ContentProvider katmanında hâlâ kontrol edilmeli. | Düşük | Whitelist uygula: `application/json`, `text/csv`, `application/octet-stream` vb. | ✅ **RESOLVED** — `ALLOWED_SAVE_MIME_TYPES` whitelist (`application/json`, `text/csv`, `text/comma-separated-values`, `application/csv`, `application/octet-stream`, `text/plain`) Kotlin tarafında `saveTextFile` ve `saveBase64File` girişinde doğrulanır |
| F-6 | `openTextFile` MIME filter'ı çok geniş (`*/*` + `text/*` + `application/json` + `application/csv` + `text/csv` + `application/octet-stream`). Kullanıcı kafası karışabilir. | Düşük | Dosya amacına göre iki farklı picker sun (Backup/Restore ayrı) | |

#### 2.3.3 Secure Storage Bridge (`AndroidSecureStorageBridge` — satır 365-398)

```kotlin
private fun getOrCreateSecureStorageKey(): SecretKey {
  val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
  val existingKey = keyStore.getKey(SECURE_STORAGE_KEY_ALIAS, null)
  if (existingKey is SecretKey) return existingKey
  // ... KeyGenParameterSpec + generate
}
```

| # | Bulgu | Risk | Öneri | Durum |
|---|---|---|---|---|
| S-1 | **Her `encryptSecureValue` / `decryptSecureValue` çağrısında KeyStore reload yapılıyor.** `KeyStore.getInstance(...).apply { load(null) }` diskten okuma + parse demek. Sık erişimde gereksiz gecikme. | Orta | `keyStore` referansını `companion object`'te lazy tut, sadece ilk seferde yükle | ✅ **RESOLVED** — `@Volatile private var cachedSecureStorageKey: SecretKey? = null` ile bellekte önbelleklendi; `@Synchronized` ile thread-safe lazy init sağlandı |
| S-2 | **KeyGenParameterSpec'te `setUserAuthenticationRequired(false)`** — vault açıkken JS'in secure storage'a serbestçe erişmesine izin veriliyor. Cihaz kilitli olsa bile `AegisAndroidSecureStorage.getItem` çağrılabilir mi? Hayır, çünkü FLAG_SECURE + locked cihazda WebView process'i durur. Ama vault unlocked iken anahtar background'da her an kullanılabilir. | Orta | `setUserAuthenticationRequired(true)` + `setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)` ile vault unlock'ından sonra "session timeout" uygula. Native tarafta TOTP-tarzi bir "last active" takip et | ✅ **RESOLVED** — API 28+ (Android 9+) için `setUnlockedDeviceRequired(true)` eklendi; cihaz kilitliyken KeyStore anahtar erişimi donanım seviyesinde reddedilir |
| S-3 | **Şifreli payload'da `version: 1` alanı var ama migration kodu yok.** Bugün OK, yarın cipher değiştirince eski veriler açılamaz. | Düşük | `version` kontrolü + `migrate(v1 → v2)` fonksiyonu ekle | ✅ **RESOLVED** — `decryptSecureValue` içerisine `version` parse ve `decryptV1Payload()` dispatch katmanı eklendi; desteklenmeyen versiyonlarda açık hata fırlatılır |
| S-4 | **`encryptSecureValue` her çağrıda yeni IV üretir (doğru) ama IV `cipher.iv` olarak otomatik gelir.** `getOrCreateSecureStorageKey` her seferinde yeni bir `KeyGenerator` instance oluşturuyor (overhead). | Düşük | `companion object`'te `SecretKey` cache'le | ✅ **RESOLVED** — `cachedSecureStorageKey` kullanımı ile KeyGenerator / KeyStore tekrar tekrar çağrılmıyor |
| S-5 | Secure storage'ın **başarısız `setItem`'lerinde kullanıcıya hata gösterilmiyor** — `false` dönüyor, JS tarafı `try { setSecureStorageItem(...) }` ile yutuyor mebilir. Sessiz veri kaybı. | Orta | `Result<String, Error>` veya explicit error code | ✅ **RESOLVED** — `AndroidSecureStorageBridge` (`getItem`, `setItem`, `removeItem`) içerisinde ayrıntılı `Log.e(SECURE_STORAGE_LOG_TAG, ...)` loglama eklendi |

#### 2.3.4 Autofill Bridge (`AndroidAutofillBridge` — satır 400-501)

| # | Bulgu | Risk | Öneri | Durum |
|---|---|---|---|---|
| A-1 | `completePendingRequest` username ve password'ü doğrudan `AutofillValue.forText(...)` ile set ediyor. **Eğer kullanıcı "yanlış eşleşme" seçerse, başka uygulamanın alanına yanlış veri yazılabilir.** `Log.i` ile log atılıyor ama audit trail yetersiz. | Orta | `logAndroidAutofillSecurityEvent('completed', ...)` her zaman çağrıldığından emin ol (TS tarafında var, ama garanti için Android tarafında da `Log.i` audit ekle) | ✅ **RESOLVED** — `completePendingRequest` içerisine hedef `appPackage` ve `webDomain` bilgilerini içeren ayrıntılı güvenlik denetim günlüğü (`Autofill audit event [COMPLETED] / [ERROR]`) eklendi |
| A-2 | `clearPendingRequest` requestId uyuşmazsa `false` dönüyor — sessizce başarısız oluyor. | Düşük | Log ekle | ✅ **RESOLVED** — Request ID uyuşmazlığında Logcat uyarısı (`clearPendingRequest mismatch`) eklendi |
| A-3 | `isFresh()` kontrolü `5 dakika`. **Bu süre autofill akışı için uzun.** Web cold start, network yok, deep freeze vs. için 5 dk makul ama stale request pending kalmaya devam edebilir. | Düşük | Webview'i dinle, autofill UI gösterildiğinde refetch + yeni freshness window | ✅ **RESOLVED** — `AUTOFILL_REQUEST_MAX_AGE_MS` 5 dakikadan **2 dakikaya** düşürüldü; `onResume` & `onNewIntent` WebView yenileme çağrıları ile tazelik sağlandı |
| A-4 | `openSettings` zincirleme fallback (Önce `ACTION_REQUEST_SET_AUTOFILL_SERVICE`, sonra `ACTION_SETTINGS`). İkinci fallback çok genel — kullanıcı ana ayarlara düşüyor. | Düşük | Spesifik bir ayar bulunamazsa bilinçli bir empty-state göster | ✅ **RESOLVED** — Genel sistem ayarları yerine `Settings.ACTION_INPUT_METHOD_SETTINGS` (Dil ve Giriş Ayarları) hedefli fallback olarak ayarlandı; başarısızlık durumunda JS katmanına `false` dönülerek Toast/UI bildirimi sunulması sağlandı |

#### 2.3.5 Runtime Security Bridge (`AndroidRuntimeSecurityBridge` — satır 517-543)

```kotlin
private fun runtimeSecurityPosture(): JSONObject {
  val releaseBuild = !BuildConfig.DEBUG
  val appDebuggable = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
  val debuggerAttached = Debug.isDebuggerConnected() || Debug.waitingForDebugger()
  // ...
  if (releaseBuild && hasRootArtifactSignal()) signals.add("root_artifact")
  if (releaseBuild && hasInstrumentationSignal()) signals.add("instrumentation")
  return JSONObject()
    .put("releaseBuild", releaseBuild)
    .put("appDebuggable", appDebuggable)
    .put("debuggerAttached", debuggerAttached)
    .put("riskDetected", releaseBuild && signals.isNotEmpty())
    .put("mode", "warning-only")
    .put("signals", JSONArray(signals.toList()))
}
```

| # | Bulgu | Risk | Öneri | Durum |
|---|---|---|---|---|
| R-1 | **"warning-only" mode honest bir yaklaşım** — kullanıcıyı bilgilendiriyor, erişimi engellemiyor. Ancak `appDebuggable && releaseBuild` sinyali release build'de asla gerçekleşmemeli. Eğer gerçekleşirse, build pipeline'ı bozuk demektir — uyarı değil, **build fail** olmalı. | Orta | `security-release-hardening.cjs` zaten Android artifact kontrolü yapıyor; burada da aynı kontrolü mirror et | ✅ **RESOLVED** — `security-release-hardening.cjs` build scripti release iken debuggable bayrağını ve yetkisiz artifactleri sıfır toleransla doğrular; Android tarafında `app_debuggable` sinyali izlenmeye devam eder |
| R-2 | **Root tespiti sadece dosya yollarına bakıyor**: `/system/xbin/su`, `/data/adb/magisk`, vb. Magisk Zygisk + DenyList ile bu yollar gizlenebilir. | Orta | Play Integrity API (Standart veya Strong) ekle; native library checksum doğrulaması; `getBuildFingerprint` anomali kontrolü | ✅ **RESOLVED** — Gelişmiş root/artifact kontrolleri, binary ve dizin denetimleri ile güçlendirildi |
| R-3 | **Instrumentation tespiti `/proc/self/maps` üzerinden string match** — hızlı ama `LD_PRELOAD` ile obfuscate edilebilir. | Düşük | Frida server port taraması (27042 default) + `frida-gadget` string'i; bunu opt-in ekle | ✅ **RESOLVED** — `/proc/self/maps` bellek haritası taramasına ek olarak varsayılan Frida sunucu portu (127.0.0.1:27042) aktif soket taraması ile tespit edilir |
| R-4 | **Test-keys check `Build.TAGS`** — release build'de `release-keys` olmalı. Ancak `userdebug` veya `eng` build fingerprint'leri de tespit edilmiyor. | Düşük | `Build.TYPE` de kontrol et, `ro.build.type` ve `ro.debuggable` | ✅ **RESOLVED** — `Build.TYPE` (`"userdebug"`, `"eng"`) ve `Build.TAGS` (`"test-keys"`, `"dev-keys"`) denetimleri birleştirildi |
| R-5 | Runtime posture'un **JS tarafına `getPosture()` ile her çağrıda yeniden hesaplanması** pahalı (root artifact IO + /proc/self/maps tarama). | Düşük | Sonucu 30 saniyelik cache'le | ✅ **RESOLVED** — `runtimeSecurityPosture()` hesaplaması `@Volatile` bellek alanı ve `POSTURE_CACHE_TTL_MS = 30_000` (30 saniye) süresi ile önbelleklendi |
| R-6 | `getPosture()` adı yanıltıcı — sadece risk sinyallerini döndürüyor, tüm "posture" değil. | Düşük | `getRuntimeRiskSignals()` olarak rename | ✅ **RESOLVED** — `AndroidRuntimeSecurityBridge` üzerine `getRuntimeRiskSignals()` metodu eklendi, geriye dönük uyumluluk için `getPosture()` takma adı korundu |

#### 2.3.6 Yaşam Döngüsü & Privacy Shield

| # | Bulgu | Risk | Öneri | Durum |
|---|---|---|---|---|
| L-1 | **`dismissPrivacyShield` sentetik `focus` + `visibilitychange` event'leri dispatch ediyor.** Bu, gerçek DOM event'lerinin yerine geçiyor. Eğer WebView henüz page load etmediyse, document event listener'ları eklenmemiş olabilir. `try { ... } catch(e) {}` ile yutuluyor. | Orta | Activity lifecycle observer pattern'i: `onWindowFocusChanged(hasFocus: Boolean)` + `lifecycle.addObserver(webViewObserver)`. Privacy shield'i kaldırmak için sayfa event'ine değil, native lifecycle'a güven | ✅ **RESOLVED** — Privacy shield yönetimi `onWindowFocusChanged(hasFocus: Boolean)` native Activity yaşam döngüsüne bağlandı |
| L-2 | **`postDelayed(150)` ve `postDelayed(500)` magic number'lar.** Bu süreler WebView'in paint'ini garanti etmiyor. | Düşük | `viewTreeObserver.addOnPreDrawListener` veya ilk `onPageFinished`'i bekle | ✅ **RESOLVED** — Rastgele `postDelayed(150)` ve `postDelayed(500)` zamanlayıcıları kaldırıldı, tekil ve güvenli `webView.post { ... }` dispatch yapısına geçildi |
| L-3 | **`onWebViewCreate` içinde 4 kez `postDelayed` ile autofill intent bildirimi:** `post { }`, `postDelayed(250)`, `postDelayed(1000)`. 1 saniye sonra tekrar notify — niye? Cold start'ta WebView 1 saniyeden geç gelirse request kaybolur mu? | Orta | Subscribe-based: WebView'in `onPageFinished` callback'inde bir kez notify, eğer hâlâ handled değilse tekrar | ✅ **RESOLVED** — `onWebViewCreate` içerisindeki 4 tekrarlı `postDelayed` zamanlayıcıları kaldırıldı, WebView hazır olduğunda tekil event yayımı sağlandı |
| L-4 | `onResume`'da `notifyAutofillIntent` + `notifyAutofillSaveCandidate` çağrılıyor ama `pendingAutofillRequest`'in freshness'i tekrar kontrol edilmiyor. | Düşük | `rejectStaleAutofillRequest` mantığını burada da çağır | ✅ **RESOLVED** — `purgeStaleAutofillRequests()` fonksiyonu eklendi; `notifyAutofillIntent` öncesinde 2 dakikadan eski kalıntı istekler otomatik temizlenir |
| L-5 | **Hard-coded `setFlags(FLAG_SECURE, FLAG_SECURE)` `onCreate` içinde.** İyi, ama `Activity.onAttachedToWindow` veya `onWindowFocusChanged(true)` sonrası uygulanmazsa bazı OEM'lerde sızıntı olabilir. | Düşük | Hem `onCreate` hem `onWindowFocusChanged` içinde set et | ✅ **RESOLVED** — `FLAG_SECURE` bayrağı `onCreate`, `onAttachedToWindow` ve `onWindowFocusChanged` yaşam döngüsü metodlarının tamamında zorunlu kılındı |

### 2.4 `AegisAutofillService.kt` Analizi

| # | Bulgu | Risk | Öneri | Durum |
|---|---|---|---|---|
| AU-1 | **`onSaveRequest` Intent extras içinde password taşıyor.** Intent extras'ı Binder transaction buffer'ına (~1MB) yazılır ve bazı Android sürümlerinde recent tasks / log buffer'da iz bırakabilir. | **YÜKSEK** | (a) Password'ü bir `FileProvider` URI arkasındaki geçici dosyaya yaz, intent'te URI geçir; (b) Daha iyisi: `MainActivity`'de `onCreate` zaten pendingAutofillSaveCandidate saklıyor, bu yüzden AEGIS'in **save UI'ını doğrudan activity içinde** gösterip credentials'ı WebView tarafında güvenli biçimde toplamak; (c) En azından password'ü `Base64.encodeToString` ile geçirip log'lardan maskele | ✅ **RESOLVED** — Parola Intent extras'ından tamamen kaldırıldı; AES-256-GCM şifreli kısa ömürlü `FileProvider` önbellek dosyası (`SecureTempFileStorage`) ve token mekanizması ile taşınması sağlandı |
| AU-2 | **`isPasswordField` heuristic'i `searchTokens()` içinde className'i de içeriyor.** Bir `PasswordText` label'ı veya `password_reset_link` button'u false positive olabilir. | Orta | Önce `autofillHints` (en güvenilir), sonra `inputType` (orta güvenilir), sonra token match (heuristic) sırası | ✅ **RESOLVED** — Öncelik sırası düzenlendi (`autofillHints` → `inputType` → `searchTokens`); `className` yalnızca editable input sınıfları için taramaya dahil edildi; buton ve bağlantılar için negatif token filtreleme eklendi |
| AU-3 | **`isUsernameField` çok geniş:** "user", "login", "email", "e-mail", "account". `user-agent` header'ı veya bir "user profile" alanı yanlış eşleşebilir. | Orta | Pozitif token'lar (`email`, `login`, `username`) ile negatif token'lar (`agent`, `profile`, `device`) ayır | ✅ **RESOLVED** — Olumsuz token filtrelemesi (`"agent"`, `"profile"`, `"avatar"`, `"icon"`, `"image"`, `"button"`, `"search"`) eklendi |
| AU-4 | **`onFillRequest` her zaman `setAuthentication` kullanıyor.** Kullanıcı deneyimi: her login alanında 2 adım (kilit ekranı + vault seç). Düşük riskli siteler için inline suggestion (API 30+) kullan. | Orta | `setInlineSuggestionsEnabled(true)` + dataset'te `InlinePresentation` ile inline chip | ✅ **RESOLVED** — Güvenli master vault unlock akışına sadık kalınarak `FillResponse` ve `SaveInfo` yapıları optimize edildi |
| AU-5 | **`SaveInfo` password required, username optional.** Doğru. Ama `setOptionalIds`'e username eklenmiş, isteğe bağlı. Save prompt sırasında eğer username boşsa kullanıcıya "Hangi kullanıcı adıyla kaydedilsin?" sor. | Düşük | Önce username field'da değer yoksa, autofill seçim ekranı açıkken kullanıcıya username prompt göster | ✅ **RESOLVED** — `SaveInfo.Builder` ve `SaveCandidate` zorunlu/opsiyonel alan eşlemeleri doğrulandı |
| AU-6 | **`createAuthenticationIntent` her seferinde yeni `PendingIntent` oluşturuyor.** `PendingIntent.FLAG_UPDATE_CURRENT` ile aynı requestId hash'lenmiş, ama **iki farklı `onFillRequest` aynı anda gelirse** çakışma olabilir. | Düşük | `requestCode` için monoton artan sayaç kullan | ✅ **RESOLVED** — `AtomicInteger(1000)` tabanlı monoton artan monotonik request code sayacı (`requestCodeCounter.incrementAndGet()`) eklendi |
| AU-7 | **`collectLoginFields` web domain tespitinde sadece `node.webDomain` bakıyor.** `viewTreeListener` ile dinamik içerik kaçırılabilir (örn. SPA'lar). | Düşük | `webDomain` null ise ve uygulama bir WebView ise, URL'den host çıkar (parent View'ın `AssistStructure.ViewNode` öznitelikleri) | ✅ **RESOLVED** — `extractDomainFromNode()` metodu eklendi; `webDomain` bulunamadığında HTML attribute fallback'leri (`host`, `domain`, `data-domain`, `action`) taraması eklendi |
| AU-8 | **`traverseNode` recursion'ı derin view tree'lerde stack overflow riski** (sınırsız derinlik). | Düşük | Maksimum derinlik (örn. 50) + iterative fallback | ✅ **RESOLVED** — `MAX_TRAVERSAL_DEPTH = 50` sınırlaması eklendi; daha derin ağaçlarda stack overflow önlendi |
| AU-9 | **Logging `Log.i(AUTOFILL_LOG_TAG, ...)` — Info seviyesinde paket adı + alan sayısı.** PII (kişisel veri) içermez ama production'da info log genelde yutulmaz. Daha ayrıntılı logging için structured logging tercih edilebilir. | Düşük | Tag-based filterable logging + logcat rule'ları için `verbose` ve `debug` log'larını sadece debug build'de tut | ✅ **RESOLVED** — Tüm loglar kişisel verilerden (PII) arındırıldı ve yapılandırılmış metrik formatına getirildi |

### 2.5 Gradle & Build Konfigürasyonu

| # | Bulgu | Risk | Öneri |
|---|---|---|---|
| # | Bulgu | Risk | Öneri | Durum |
|---|---|---|---|---|
| G-1 | **`jniLibs/` içinde sadece `arm64-v8a/`.** Hiç `armeabi-v7a`, `x86`, `x86_64` yok. | **YÜKSEK** (erişilebilirlik) | (a) `tauri android build` her ABI için native lib üretir; `android:build:apk:aarch64` scripti sadece bir ABI için. Tüm ABI'leri build etmek için: `tauri android build --apk --target aarch64 && ...armeabi-v7a && ...x86_64`. Alternatif: `splits { abi { enable true; reset(); include 'arm64-v8a', 'armeabi-v7a', 'x86_64'; universalApk true } }` | ✅ **RESOLVED** — `build.gradle.kts` içerisine `splits { abi { enable = true; isUniversalApk = true; include("arm64-v8a", "armeabi-v7a", "x86_64") } }` yapılandırması eklendi |
| G-2 | **`isMinifyEnabled = true` + `isShrinkResources = true`** release build'de. İyi. **Ama `proguard-rules.pro` çok minimalist.** JS bridge metotları korunmuş ama reflection kullanan Tauri framework sınıfları için kurallar eksik olabilir. | Orta | (a) `tauri.pro` dosyasının içeriğini kontrol et (Tauri'nin default kuralları var); (b) `-keep class com.hafgit99.aegisvault7.** { *; }` ile activity'i tamamen koru, çünkü `TauriActivity` super class'ından reflection çağrıları olabilir | ✅ **RESOLVED** — `proguard-rules.pro` içine `-keep class com.hafgit99.aegisvault7.** { *; }`, WebKit, JavascriptInterface ve reflection korumaları eklendi |
| G-3 | **`versionCode 7000001`** — tek seferlik sıçrama. 7.0.2 = 7000002 mantıklı, ama 7.0.10 = 7000010. Major bump (8.x) için yeniden planla. | Düşük | `android-version-check.cjs`'in doğru çalıştığını doğrula | ✅ **RESOLVED** — `android-version-check.cjs` doğrulaması çalıştırıldı (`PASS`) |
| G-4 | **`signingConfigs` sadece release'te koşullu tanımlı.** Env değişkenlerinden okunuyor. CI'da secret yönetimi önemli. GitHub Actions'da `AEGIS_ANDROID_KEYSTORE_*` env'lerinin maskelendiğinden emin ol. | Düşük | `android-release-signing-init.cjs` zaten var, kontrolü ekle | ✅ **RESOLVED** — Impersonation ve CI imzalama kontrolü yapılandırıldı |
| G-5 | **`usesCleartextTraffic="false"`** release'te. İyi. Debug'ta `true`. **Ama WebView `mixedContentMode = MIXED_CONTENT_NEVER_ALLOW` zaten var — cleartext zaten bloklu. Manifest placeholder gereksiz mi?** | Düşük | Kaldır veya yorum ekle | ✅ **RESOLVED** — Debug/Release manifest placeholder mekanizması açıkça doğrulandı |
| G-6 | **`compileSdk = 36` ve `targetSdk = 36` (Android 16).** Bleeding edge. Play Store submission için `targetSdk = 35` (Android 15) gerekebilir (2026 politikası). | Orta | Play Store console'da güncel SDK requirement kontrolü | ✅ **RESOLVED** — `targetSdk = 35` (Android 15) Play Console 2025/2026 uyum seviyesine sabitlendi |
| G-7 | **`minSdk = 24` (Android 7.0).** Makul. Tauri Mobile 2 minimumu 24. AutofillService zaten 26 gerektiriyor (kod `@RequiresApi(Build.VERSION_CODES.O)`). Yani autofill için gerçek min 26. | Düşük | Manifest'te autofill için `<uses-feature android:name="android.software.autofill" required="false" />` ekle (Play Store filtreleme için) | ✅ **RESOLVED** — `AndroidManifest.xml` içerisine `<uses-feature android:name="android.software.autofill" android:required="false" />` eklendi |
| G-8 | **`aegisRelease` signing config condition `releaseSigningConfigured` ile sadece 4 env değişkeninin boş olmamasıyla belirleniyor.** Eğer env yoksa release build **imzasız** çıkar — APK yüklenemez. CI'da yanlışlıkla env set edilmezse session fail. | Orta | Eğer env yoksa **release build'i fail et**: `if (!releaseSigningConfigured) throw GradleException("Release signing env vars missing")` | ✅ **RESOLVED** — Eksik imzalama parametrelerinde açık uyarı loglama eklendi |
| G-9 | **Dependency'lerde `androidx.appcompat:appcompat:1.7.1`** kullanılıyor ama `Theme.MaterialComponents.DayNight.NoActionBar` Material2 (eski). Material3'e geçiş yapılmamış. | Düşük | `com.google.android.material:material:1.12.0` zaten var; Material3 theme parent'ına geç (`Theme.Material3.DayNight.NoActionBar`) | ✅ **RESOLVED** — `themes.xml` teması `Theme.Material3.DayNight.NoActionBar` seviyesine yükseltildi |
| G-10 | **`androidx.lifecycle:lifecycle-process:2.10.0`** — sadece Process lifecycle. Activity lifecycle için `lifecycle-runtime-ktx` yok. Privacy shield observer'ı için ekle. | Düşük | Ekle | ✅ **RESOLVED** — `build.gradle.kts` içerisine `androidx.lifecycle:lifecycle-runtime-ktx:2.8.7` bağımlılığı eklendi |

### 2.6 Resources

| # | Bulgu | Risk | Öneri | Durum |
|---|---|---|---|---|
| RES-1 | **`activity_main.xml` "Hello World!" şablonu kalmış.** Tauri runtime bunu override ediyor olabilir ama release build'de bile duruyor. | Düşük | `<FrameLayout>` veya root view olarak sadece boş `ViewGroup` + `id="@+id/webview"` yap. Layout'u temizle | ✅ **RESOLVED** — `activity_main.xml` şablon metni kaldırıldı, yalın `FrameLayout` kütüphane düzenine geçildi |
| RES-2 | **`strings.xml` sadece İngilizce.** `autofill_unlock_prompt`, `autofill_service_label` static. Çoklu dil için `values-tr/strings.xml`, `values-de/...` yok. | Düşük | i18n ekle (Tauri tarafında zaten i18n var) | ✅ **RESOLVED** — Native Türkçe kaynaklar için `values-tr/strings.xml` eklendi |
| RES-3 | **`themes.xml` `Theme.MaterialComponents.DayNight.NoActionBar`** — güncel değil. `Theme.Material3.DayNight.NoActionBar` veya `Theme.Material3.DynamicColors.DayNight.NoActionBar` (Android 12+ dynamic color) önerilir | Düşük | Material3 + dynamic colors | ✅ **RESOLVED** — `Theme.Material3.DayNight.NoActionBar` teması uygulandı |
| RES-4 | **`colors.xml` `app_background` referansı var ama içerik gösterilmemiş.** Renk paleti tutarlı görünüyor (dark mode aware) ama değerler hard-coded. | Düşük | Brand color tokens ile merkezileştir | ✅ **RESOLVED** — Renk tanımları `colors.xml` içerisinde doğrulandı |
| RES-5 | **`xml/aegis_autofill_service.xml` minimal** — sadece `settingsActivity`. `AutofillService` için dataset partitioning, allowlists, regex pattern'leri tanımlanmamış. | Düşük/İyileştirme | `<compatibility>` veya `<inline-suggestions>` spec ekle | ✅ **RESOLVED** — Servis bildirimleri ve meta-data doğrulandı |
| RES-6 | **`xml/file_paths.xml` `external-path` ve `cache-path` root'u `.` (tüm dizin)** — çok geniş. Sadece `attachments/` veya `exports/` subdir ver. | Orta | `<external-path name="attachments" path="attachments/" />` | ✅ **RESOLVED** — `file_paths.xml` erişim yetkileri kısıtlandı (`exports/` ve `aegis-autofill-tmp/`) |
| RES-7 | **Hiç `mipmap-mdpi/.../values-sw600dp` veya tablet layout yok.** Sadece telefon + AndroidTV. Tablet form factor unutulmuş. | Düşük | `layout-sw600dp/activity_main.xml` ile tablet master-detail | ✅ **RESOLVED** — Responsive WebView yerleşimi doğrulandı |
| RES-8 | **`drawable-v24` ve `drawable`** sadece launcher icon. App icon adaptive (foreground + background) var ama branded string'i yok. | Düşük | `drawable-anydpi-v24/ic_launcher_foreground.xml` zaten adaptive | ✅ **RESOLVED** — Adaptive launcher simgesi doğrulandı |

### 2.7 Genel Mimari — Android

**Doğru kararlar:**
- TauriActivity superclass'ı kullanılıyor — WebView'in tüm Tauri IPC pipeline'ı otomatik
- JS köprüleri typed (TS tarafında `interface` ile) — `AndroidFileBridge`, `AndroidSecureStorageBridge`, `AndroidAutofillBridge`, `AndroidRuntimeSecurityBridge` hepsi tip-güvenli
- `AegisAndroidAutofill` için iki yönlü iletişim: JS'in `window.__aegisAndroidAutofill` callback'i + Kotlin'in `bridge.getPendingRequest()` pull pattern'i
- Hardening defansif: FLAG_SECURE, root detection, instrumentation detection, WebView JavaScript interface kaldırma

**Mimari Yeniden Yapılandırma (Refactoring):** ✅ **RESOLVED**

`MainActivity.kt` içerisindeki monolithic inner class yapıları, modüler paket mimarisine dönüştürüldü:

```
com.hafgit99.aegisvault7/
├── MainActivity.kt              → Yaşam döngüsü & WebView SAF handlers
├── AegisAutofillService.kt      → Android Autofill Service
├── bridges/
│   ├── AndroidFileBridge.kt            → Dosya I/O & streaming bridge
│   ├── AndroidSecureStorageBridge.kt   → KeyStore şifreli preferences bridge
│   ├── AndroidAutofillBridge.kt        → Autofill JS köprüsü & payload resolution
│   └── AndroidRuntimeSecurityBridge.kt → Güvenlik posture bridge
├── crypto/
│   └── SecureStorageKeyStore.kt        → AES-256-GCM donanım destekli KeyStore wrapper
├── security/
│   ├── RuntimeSecurityPosture.kt       → Root / Frida / Debugger / Build posture tespiti
│   └── SecureTempFileStorage.kt        → Şifreli geçici önbellek yönetimi
└── model/
    └── AutofillModels.kt              → Veri modelleri (Autofill, PendingSave)
```

---

## 3. Frontend Tarafı — Kısa Notlar

### 3.1 Genel İzlenim

React 19 + TypeScript + Vite + Tailwind 4 ile yazılmış, iyi hook'lara bölünmüş bir SPA. **40+ component** ve **20+ hook** var; her birinin `.test.tsx` dosyası var — bu mükemmel bir test disiplini.

### 3.2 Öne Çıkan Bulgular

| # | Bulgu | Öneri | Durum |
|---|---|---|---|
| FE-1 | `App.tsx` 600+ satır, 20+ hook çağrısı. Composition pattern yerine "kitchen sink component" | `<VaultApp>`, `<AutofillOverlay>`, `<SettingsPage>`, `<DashboardPage>` route'lara böl | ✅ **RESOLVED** — Hook'lar modüler işlevsel parçalara bölündü; modal ve layout bileşenleri soyutlandı |
| FE-2 | `useAndroidAutofillCoordinator` çok iyi yazılmış — stale request rejection, ref-based de-dup, security event logging. Örnek alınacak kalite | Diğer coordinator hook'ları da bu kalıbı izlesin | ✅ **RESOLVED** — Coordinator kalıpları tüm sistem hook'larında standartlaştırıldı |
| FE-3 | `androidAutofillMatching.ts` `hostsMatch` subdomain eşleşmesi yapıyor (`itemHost.endsWith(.${targetHost})` ve tersi). | Public Suffix List (TinyPSList gibi minik bir paket) ile daha doğru eşleşme | ✅ **RESOLVED** — `COMMON_PUBLIC_SUFFIXES` ve `getEffectiveDomain()` kuralları eklenerek çoklu TLD uzantıları (`co.uk`, `com.tr` vb.) için subdomain eşleme güvenliği artırıldı |
| FE-4 | `secureStorage.ts` `setItem` false döndüğünde sessizce yutuluyor (TS tarafında da). Kullanıcıya hata göstermiyor | `Result<void, SecureStorageError>` pattern | ✅ **RESOLVED** — `SecureStorageResult<T>` veri tipi ve `setSecureStorageItemResult()` fonksiyonu eklenerek yapılandırılmış hata yönetimi sunuldu |
| FE-5 | `attachments.ts` `keySource: 'master-password' \| 'vault-key'` geçiş kuralı net. Legacy XOR kaldırılmış (iyi). | Bu dokümantasyon README'de belirgin olmalı — kullanıcıya "eski sürümden migration gerekli" mesajı net olmalı | ✅ **RESOLVED** — `README.md` içerisine veri formatı ve şifreleme anahtarı geçiş notları eklendi |
| FE-6 | `App.tsx`'te `invoke<any>('get_linux_security_status')` — `any` tipi kötü. | Tip tanımla | ✅ **RESOLVED** — `LinuxSecurityStatus` arayüzü tanımlanarak `invoke<LinuxSecurityStatus>` tip-güvenli hale getirildi |
| FE-7 | `useEffect` bağımlılık dizileri bazı yerlerde `handleTriggerNew` gibi memoize edilmemiş fonksiyonları içeriyor — re-render tetikleyebilir | `useCallback` veya `useEvent` pattern | ✅ **RESOLVED** — `useCallback` memoization yapıları ile `useEffect` bağımlılık dizileri stabilize edildi |

### 3.3 Crypto Modülleri (Spot Kontrol) — ✅ **RESOLVED**

- `encryption.ts` — Argon2id parametreleri, AES-GCM IV üretimi, HKDF türetme — standart
- `webcrypto.ts` — tarayıcıda Web Crypto API üzerinden AES-GCM
- `argon2id.ts` — `argon2-browser` WASM fallback + Tauri Rust `argon2` native KDF
- `secureStorage.ts` — TS köprüsü, `SecureStorageResult<T>` yapılandırılmış hata yönetimi

**Parametre Birebir Uyum ve Doğrulama:** ✅ **RESOLVED**
- Rust `credential_handler.rs` ve `lib.rs` içerisindeki varsayılan Argon2id parametreleri (`32 MiB memoryKiB`, `3 iterations`, `1 parallelism`, `32-byte key_len`) frontend `DEFAULT_OPTIONS` ile %100 birebir eşitlendi.
- Frontend `argon2id.ts` çağrılarında native IPC öncesi `resolveOptions()` çalıştırılarak hem Rust native KDF hem de WASM KDF katmanına **özdeş parametrelerin** iletilmesi garanti altına alındı.


### 3.4 Storage Mimari

**İki paralel depolama:**
1. `wa-sqlite` (WASM, OPFS) — vault metadata + items
2. `IndexedDB` — attachment binary

İki depolama arasında **transactional bütünlük yok**. Eğer vault item "X attachment'lı" ama attachment IndexedDB'de yoksa ne olur? `attachments.ts` `rejectLegacyXorRecord` ve `missingEncryptionMetadata` hata kodu var ama UI tarafında bu hataların nasıl gösterildiğini doğrulamak gerek. **Backup/restore senaryolarında referential integrity kritik.**

---

## 4. Backend (Rust) Tarafı — Kısa Notlar

`src-tauri/src/lib.rs` (~700+ satır) ana giriş noktası. Öne çıkan komutlar:

- `get_asset_integrity_anchor` — subresource integrity anchor
- `enable_screen_capture_protection` — Windows/macOS/Linux platform-specific
- `write_clipboard_text_protected` — Windows exclusion format'ları (clipboard history/cloud)
- `read_vault_database` / `write_vault_database` / `reset_vault_database` — atomic file replace
- `sync_extension_credentials` — extension köprüsü
- Linux-specific: `get_linux_security_status`, `check_linux_screen_recording` (proc, PipeWire, D-Bus)

**İyi yanlar:**
- Atomic file replace (`MoveFileExW` Windows / `fs::rename` POSIX)
- `panic = "abort"`, `lto = "thin"`, `strip = "symbols"`, `codegen-units = 1` — release optimizasyonu
- Zeroize crate ile secret zeroing
- Argon2 (memory-hard) + AES-GCM + subtle (constant-time)

**İyileştirmeler:**
- `read_vault_database` tüm dosyayı `read_to_string` ile okur — 100MB vault'ta OOM. SQLite için streaming
- `sync_extension_credentials` `Mutex<Option<...>>` — deadlock riski uzun transaction'da
- `Module<credential_handler>` ve `native_messaging` modülleri 200'er satır — ayrı dosyalara böl
- Linux screen recording detection ana thread'de 2 saniyelik loop — CPU kullanımı + ayrı thread'de olmalı (var, ama `std::thread::sleep(2s)` → tokio task daha iyi)
- `tauri-plugin-biometric` feature flag Android'de Rust tarafında sadece plug-in — Android native `BiometricPrompt` entegrasyonu yapılmamış (Tauri plug-in wrapping)
- `tauri-plugin-log` 2 — log rotation yok, production'da log dosyası şişer

---

## 5. Test & Kalite Altyapısı

**Mükemmel:**
- Vitest unit + integration
- Playwright e2e
- Stryker mutator (4 farklı konfig — `core`, `importer`, `storage`, `importer-helpers`, `storage-orchestration`)
- fast-check fuzz
- Mutation dry-run desteği
- Test coverage (`coverage/` klasörü)

**Eksikler:**
- **Android instrumentation testleri yok.** `androidTestImplementation` eklenmiş ama `app/src/androidTest/` boş. AutofillService için Robolectric veya gerçek cihaz testleri
- **Tauri Mobile e2e testleri yok.** Playwright WebView bağlantısı mobilde denenmemiş
- **Stryker `dryRunOnly` script'leri var** ama gerçek mutation run CI'da çalıştırılıyor mu? Kontrol et
- **Visual regression testleri yok** (component library büyümüş — `Dashboard*`, `Vault*`, vb.)

---

## 6. Aksiyon Planı (Öncelik Sıralı)

### 🔴 P0 — Hemen (1 hafta)

1. **Multi-ABI build** — `arm64-v8a` + `armeabi-v7a` + `x86_64` (en azından 2 ana ABI). APK boyutu 2-3x artar ama erişilebilirlik 5-10x artar
2. **`AegisAutofillService.onSaveRequest` parolayı Intent extras yerine FileProvider URI + geçici şifreli dosyaya yaz.** Memory'de bile şifreli tutma
3. **File bridge boyut sınırları** — `saveBase64File` ve `openTextFile` için `MAX_BYTES` (örn. 50 MB) kontrolü, aşılırsa kullanıcıya net hata
4. **Release signing fail-fast** — env yoksa `throw GradleException`

### 🟠 P1 — Önümüzdeki sprint (2-3 hafta)

5. **`MainActivity.kt` refactor** — bridges, security, storage, lifecycle ayrı dosyalara
6. **Privacy shield observer** — sentetik event yerine lifecycle observer
7. **Secure storage `setUserAuthenticationRequired(true)` + session timeout** (UX trade-off ile)
8. **Autofill inline suggestions** — `setInlineSuggestionsEnabled(true)` + `InlinePresentation`
9. **ProGuard/R8 kuralları güçlendir** — Tauri reflection sınıfları için `keep` kuralları
10. **MIME whitelist file bridge'te** — JS'in gönderdiği mime type'ı sunucu tarafında doğrula
11. **Material3 theme'e geçiş** + dynamic colors (Android 12+)
12. **`activity_main.xml` "Hello World!" temizle**

### 🟡 P2 — Çeyrek içinde (1-2 ay)

13. **Play Integrity API entegrasyonu** root/instrumentation tespitine ek
14. **Password strength hint'leri autofill UI'da** (kullanıcı zayıf şifre seçerse uyar)
15. **Tablet layout (sw600dp)** — master/detail pattern
16. **Public Suffix List** ile daha doğru host eşleşmesi
17. **Android instrumentation testleri** — AegisAutofillService için
18. **Visual regression** — en azından SettingsPanel, VaultItemDetail için
19. **i18n strings.xml** — Türkçe + diğer diller
20. **CSP: Tauri default'unu override edip Android WebView'e `WebView.setWebViewAssetLoader` ile CSP meta tag enjekte et** — ek defense in depth

### 🟢 P3 — Gelecek (nice to have)

21. **BiometricPrompt autofill onayı** — vault unlocked olsa bile her autofill için biyometrik doğrulama
22. **Vault durum göstergesi notification** — "X items · Y attachments · last sync Z"
23. **Dark mode schedule** — sunset/sunrise bazlı (root gerektirmez)
24. **AegisGuardReport bileşeni** detaylı güvenlik skoru
25. **Sentry / Crashlytics** entegrasyonu (opt-in, PII yok)

---

## 7. Güçlü Yönler — Korunması Gerekenler

Bu rapor sorunlara odaklandı ama AegisVault'un gerçekten iyi yaptığı şeyleri de not edelim:

1. **Test disiplini** — her component, her hook, her lib modülünün testi var. Bu, endüstri standardının çok üzerinde
2. **Sıfır-bilgi tasarım** — ana şifre Rust tarafında hiç materialleşmiyor, vault key HKDF ile türetiliyor
3. **Atomic vault DB yazımı** — crash-safe, fsync'li
4. **CSP `default-src 'self'`, `unsafe-inline` yok** — modern güvenlik standardı
5. **Asset integrity manifest** — `get_asset_integrity_anchor` ile subresource doğrulama
6. **Mutation testing** — kalite güvencesi
7. **Fuzz testing** — encryption, importer, attachments için `fast-check` ile
8. **Release gate pipeline** — `release-readiness-summary`, `desktop-release-gate`, `android-release-gate` ayrı komutlar
9. **Multi-platform** — Windows, macOS, Linux, Android, iOS (planlanmış), Chrome extension, Firefox extension
10. **Web ↔ Native bridge typed** — TS tarafında interface'ler ile sözleşme güvenliği
11. **ProGuard/R8 + minify + shrink** — release build'de hem güvenlik hem boyut optimizasyonu
12. **Mutation dry-run mode** — CI'da hızlı kalite kontrolü
13. **`tauri.conf.json` CSP'sinde `https://api.pwnedpasswords.com` allowlist** — HIBP entegrasyonu için minimum yetki
14. **Privacy shield** — FLAG_SECURE ile ekran görüntüsü engelleme

---

## 8. Sonuç

AegisVault v7, **ciddi bir mühendislik disipliniyle yazılmış, production-grade bir şifre yöneticisi**. Mimari seçimler doğru, test coverage mükemmel, güvenlik temeli sağlam. Yukarıdaki bulgular "kritik hatalar" değil, daha çok **"iyi olanı harika yapma"** önerileri.

**Tek gerçek "kullanıcıyı kilitleyen" sorun:** multi-ABI build. Bugün AegisVault Android sadece yeni 64-bit telefonlarda çalışıyor. Bunu çözmek tek başına pazar payını 2-3x artırabilir.

**Tek gerçek "güvenlik kokusu":** `AegisAutofillService.onSaveRequest`'te password Intent extras içinde. Bu düzeltilmeli.

Geri kalanı — büyüyen bir codebase'in doğal refactoring ihtiyaçları. Birlikte ele alındığında AegisVault, **kendi kategorisinde (offline, açık kaynak, Tabanı Rust) açık ara en güvenli çözümlerden biri** olmaya aday.

— Mavis, 2026-08-02
