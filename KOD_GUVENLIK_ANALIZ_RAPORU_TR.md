# 🛡️ Aegis Vault 7 — Ayrıntılı Kod & Güvenlik Analiz Raporu (TR)

> **Analiz Tarihi:** 2026-08-12
> **İncelenen Sürüm:** 7.0.1.0 (`main` dalı)
> **Kapsam:** `src/`, `src-extension/`, `src-tauri/`, `scripts/`, `.github/workflows/`, `SECURITY_AUDIT_PACKAGE/`
> **Yöntem:** Statik kod incelemesi + iddia-doğrulama (README ↔ gerçek kod) + tehdit modeli değerlendirmesi + rakip kıyaslaması

---

## 1. YÖNETİCİ ÖZETİ

Aegis Vault 7, **offline-first, zero-knowledge** mimarili; React 19 + TypeScript + Tauri 2 (Rust) + WebCrypto + wa-sqlite üzerine inşa edilmiş bir şifre yöneticisidir. Kod tabanı **olgun, disiplinli ve güvenlik bilinci yüksek** bir şekilde yazılmıştır: 1196 birim test, %89+ satır kapsama, Stryker mutasyon testi, yayın kapıları ve güvenlik tarayıcı script'leri mevcuttur.

**Genel Güvenlik Puanı: 88/100 (A)** — README'deki kendi kendine verilen **92/100 (A+)** skoru, per-item HKDF iddiası ve BIP-39 uyumluluğu gibi noktalarda **gerçek koddan daha iyimserdir**. Raporun 5. bölümünde iddia ↔ gerçek farkları tek tek tablolanmıştır.

**En güçlü yönler:**
- WebCrypto AES-256-GCM (128-bit tag, 12-byte random IV) — doğru ve modern
- Argon2id (32 MiB / 3 iter / 1 lane) hem Rust native hem WASM fallback ile
- Rust tarafında `ZeroizeOnDrop`, JS tarafında WASM zeroizer ile anahtar materyali sıfırlama disiplini
- Yerel TCP IPC'de sabit zamanlı (constant-time) token karşılaştırması, hız sınırlama, sadece `127.0.0.1` bağlantısı
- Kapsamlı tehdit modeli ve dürüst "rezidüel risk" kayıtları

**En kritik bulgular:**
1. **"Per-Item Key Isolation" iddiası gerçekte uygulanmıyor** — `derivePerItemKey()` fonksiyonu kodda mevcut ama vault satırlarında **hiç kullanılmıyor** (sadece test dosyasında çağrılıyor). Tüm vault satırları tek bir vault geneli anahtarla şifreleniyor.
2. **Vault açılışında KDF parametresi indirgeme saldırısı (downgrade)** — Rust tarafı JS'den gelen `kdfParams`'ı minimum eşik olmadan kabul ediyor; backup yolundaki 1 MiB/3 iter tabanı vault açılış yolunda yok.
3. **Biometric v3 wrapping secret, şifrelendiği bundle'ın yanında saklanıyor** — güvenli depolama sızarsa 600k PBKDF2 tek engel kalıyor.
4. **Argon2id WASM fallback'inde sessiz bellek düşürme** (32→16→8 MiB).
5. **Master parola değişmez JS string'lerinde yaşıyor** — zeroize edilemiyor (bilinen, kısmen kabul edilmiş bir sınır).

---

## 2. TEKNOLOJİ YIĞINI & MİMARİ

| Katman | Teknoloji | Yorum |
|---|---|---|
| UI | React 19, TypeScript 5, Vite 6, Tailwind 4 | Modern, sıkı tip denetimi |
| Frontend şifreleme | WebCrypto (AES-256-GCM, HKDF-SHA256), `argon2-browser` WASM | Doğru primitif kullanımı |
| Native katman | Tauri 2 (Rust), `argon2` crate, `zeroize` | Anahtar materyali native'de tutma yaklaşımı güçlü |
| Depolama | wa-sqlite (gerçek SQLite/WASM) + OPFS/JSON simülasyonu (legacy) | Çift motor; migrasyon kapıları mevcut |
| Browser eklentisi | Manifest V3, native messaging (TCP proxy) | Kapsamı dar, Shadow DOM izole |
| Test | Vitest (1196), Playwright, Stryker mutasyon, cargo test | Sektör ortalamasının üzerinde |
| CI/CD | GitHub Actions (typecheck + lint + unit + cargo) | Yeterli ama E2E/mutasyon CI'da değil |

### Mimaride dikkat çeken kararlar
- **İki depolama motoru:** Yeni kurulumlarda gerçek wa-sqlite; mevcut masaüstü verileri JSON simüle SQLite (OPFS) üzerinde kalıyor ve wa-sqlite yalnızca **salt-okunur** migrasyon aynası olarak çalışıyor. Bu, veri kaybı riskini azaltan bilinçli, muhafazakâr bir geçiş stratejisi.
- **Anahtar-yalnız oturum:** Rutin CRUD işlemleri anahtar baytları üzerinden yürüyor; master parola string'i yalnızca setup/unlock/export/migrasyon sınırlarında materyalize ediliyor. "No-JS-Master-String" gate'i bunu testte otomatik denetliyor.
- **Extension ↔ masaüstü köprüsü:** Chrome native messaging host, masaüstü uygulamasındaki yerel TCP sunucusuna (127.0.0.1:49155–49165) 4-byte uzunluk + 256-bit token handshake'i ile bağlanıyor; kimlik doğrulamasız bağlantı `UNAUTHORIZED` ile reddediliyor.

---

## 3. DETAYLI KOD & GÜVENLİK ANALİZİ

### 3.1 Kriptografik Çekirdek — ✅ Güçlü

**Dosyalar:** `src/lib/webcrypto.ts`, `encryption.ts`, `argon2id.ts`, `random.ts`

| Kontrol | Bulgu | Değerlendirme |
|---|---|---|
| Simetrik şifreleme | AES-256-GCM, 128-bit auth tag, her işlemde yeni 12-byte random IV | ✅ Doğru |
| Anahtar içe aktarma | `raw` + `non-extractable` + `['encrypt','decrypt']` | ✅ Doğru |
| Master anahtar türetme | Argon2id 32 MiB / 3 iter / 1 lane → 32-byte | ✅ Güçlü (rakip: Bitwarden default PBKDF2 600k) |
| KDF hızlandırma | Rust native `argon2` crate; WASM fallback aynı parametreler | ✅ Parite iyi |
| Backup zarfı | `version 1.2`, SHA-256 ciphertext checksum, GCM doğrulama öncesi checksum kontrolü | ✅ Sağlam |
| Şifre karşılaştırma | XOR-accumulation `areByteArraysEqual` (OPFS repo) + Rust `subtle::ConstantTimeEq` | ✅ Sabit zamanlı |
| Anahtar materyali sıfırlama | JS: WASM zeroizer; Rust: `ZeroizeOnDrop` (`SessionState`) | ✅ Ortalamanın üzerinde |
| Parola gücü | zxcvbn (common+TR), k-anonim HIBP (SHA-1 5-karakter) | ✅ Gizlilik dostu |

**Nüanslar / riskler:**
- `importedKeysCache` (webcrypto.ts:50-91) anahtarın **SHA-256 parmak izini** bellekte tutuyor ve yalnızca **düzgün kilitlenmede** temizleniyor. `CryptoKey`'in kendisi export edilemez olsa da deterministik parmak izi, bellek dökümü saldırganına aday anahtar eşleştirme imkânı verir.
- `secureRandomToken(16)` (alfanümerik, ~95 bit) Argon2 **hash salt'ı** olarak kullanılıyor; kriptografik tuz için ham 16 byte (128 bit) daha doğru olurdu. `secureRandomToken(9)` item ID (~54 bit) için yeterli.
- `Math.random()` yalnızca **güvenlik dışı** ID'lerde (mock audit geçmişi, event log ID) kullanılıyor — sızıntı değil, tutarlılık notu.

### 3.2 Anahtar Türetme ve Oturum Yönetimi — ✅ Güçlü (sınırlarıyla)

**Dosyalar:** `src/lib/vaultSession.ts`, `secretKey.ts`, `storage.ts`, `src-tauri/src/credential_handler.rs`

- Opsiyonel 160-bit hesap secret key; KDF girdisi `'aegis-vault-v7:' + password + '\0' + secretKey` bileşimi.
- Desktop'ta doğrulama **Rust tarafında** yapılıyor; derived key `SessionState` içinde `ZeroizeOnDrop` yapıda.
- `openVaultSession` anahtar-yalnız yolu (desktop) ve credential-yedekli yol (fallback) destekliyor; kilitlenmede 4 byte dizisi de WASM ile sıfırlanıyor.
- **Art arda başarısız giriş kilitleme/gecikmesi** mevcut (2^N backoff, max 30 sn).

**Riskler:**
- Master parola string olarak JS belleğinde yaşıyor (`withActiveBackupPassword`, `withActiveSessionSecrets` → decode edilen string'ler zeroize edilemez). Tehdit modeli bunu "malware aynı kullanıcıyla çalışıyorsa korunmaz" olarak zaten kabul ediyor. ✅ dürüst.
- **Vault açılışında KDF parametre tabanı yok:** `sqlite_opfs.ts getKdfParams()` ve `waSqliteVaultStorageRepository.getKdfParams()` dosyadaki `kdfParams`'ı olduğu gibi kullanıyor; `credential_handler.rs to_params()` minimum eşik uygulamıyor. Veri dosyasını değiştirebilen saldırgan, Argon2id'i 1 iter/1 KiB'e çekip **offline brute-force**'u ucuzlatabilir. Backup yolundaki (encryption.ts) 1 MiB/3 iter koruması burada **yok**.

### 3.3 Vault Depolama (At-Rest) — ✅ İyi (metadatan sızıntısı ile)

**Dosyalar:** `src/lib/sqlite_opfs.ts`, `waSqliteVaultStorageRepository.ts`, `waSqliteEngine.ts`

- Satır düzeyinde AES-256-GCM; hassas alanlar `title/username_db/password_db/notes_db` **statik `[encrypted: aes-256-gcm]` token'ı** ile maskeleniyor — README iddiası **doğru**.
- Şifre değişiminde tüm satırlar yeni anahtarla yeniden şifreleniyor; attachment'lar da yeniden anahtarlanıyor (`reencryptAttachmentsForVaultKeyChange`). Rekey hijyeni iyi.
- `decryptedItemsCache`: 5 dk TTL'li, bellekte **düz metin** item cache'i; yalnızca kilitlenmede temizleniyor.

**Riskler:**
- `category`, `favorite`, `deleted`, zaman damgaları ve **item `id`** düz metin. Bu, vault şekli/metadata sızıntısıdır; içerik değil. Şifrelenmiş arama dizini yok.
- Legacy `localStorage` migrasyonu eski master parolayı `atob` ile materyalize ediyor (yalnızca legacy anahtarlar varsa çalışır).

### 3.4 Browser Eklentisi (Manifest V3) — ✅ İyi (bazı tavizlerle)

**Dosyalar:** `src-extension/manifest.json`, `background.ts`, `content.ts`, `popup.ts`

**Güçlü yönler:**
- Kapsam dar: `nativeMessaging`, `activeTab`, `tabs`, `storage`; host permission `http/https`.
- CSP: `script-src 'self'; object-src 'self'` — ✅ sıkı.
- **Kapalı Shadow DOM** (`attachShadow({mode:'closed'})`) ile otomatik doldurma dropdown'ı ve phishing banner'ı host sayfa JS'inden izole — README iddiası **doğru**.
- Hız sınırlı, sabit zamanlı, yalnızca localhost'a token'lı TCP köprü; credential cache 5 dk lease.
- Phishing motoru: IDN homograph (xn--), Unicode confusable haritası, Levenshtein typosquat algılama; otomatik doldurma phishing varlığında engelleniyor.
- Pending credential 120 s sonra siliniyor; tab kapanışında draft temizleniyor.

**Riskler:**
- **Sender doğrulaması eksik:** `background.ts` `chrome.runtime.onMessage` listener'ı `sender.tab`'ı kontrol ediyor ama **URL/orijin doğrulamıyor**. Zararlı bir web sayfasının content script'i `set_pending_credential` / `get_pending_credential` ile credential sızdırabilir (senaryo: kullanıcı önce legit sitede form doldurur, sonra zararlı siteye geçer → pending credential geri istenir). Ayrıca `save_new_credential` ve `query_credentials` de herhangi bir sekmeden çağrılabilir.
- `list_credentials` **tüm** cache'i (tüm sitelerin credential'ları) döndürüyor ve content script bunu `initializePhishingCheck`'te her sayfada çağırıyor — tek bir `add_credential`/`list` çağrısı credential'ların tamamını döndürür. Site bazlı filtreleme Rust tarafında `get_credentials` için var ama `list_credentials` için yok.
- Gerçek **Public Suffix List** yok: `src-tauri/src/native_messaging.rs`'de 32 sonekten oluşan **sabit bir liste** var (`co.uk`, `com.tr`, `github.io` vb.). README "Embedded Public Suffix List" derken "public suffix list" ifadesini geniş anlamda kullanıyor; eksiksiz PSL veritabanı değil. Bilinmeyen çok parçalı üst düzey alanlarda eTLD+1 yanlış hesaplanabilir.
- Content script'te `navigator.clipboard.writeText(generated)` — üretilen şifre clipboard'a yazılıyor ve **30 sn temizleme yok** (masaüstü `clipboard.ts` 30 sn temizliyor; eklenti yolu temizlemiyor).
- `fill_inputs` mesajı aktif sekme content script'ine username/password'u düz metin gönderiyor; phishing kontrolü mevcut ama mesaj doğrulaması yok.
- `alert()` ile phishing engelleme UX'i zayıf (önemsiz).

### 3.5 Native IPC (TCP Köprü) — ✅ Çok Güçlü

**Dosya:** `src-tauri/src/native_messaging.rs` (791 satır, testler dahil)

- Token: `OsRng` ile 32 byte (256 bit), hex; `subtle::ConstantTimeEq` ile karşılaştırma.
- Port: `127.0.0.1:49155` → 49156..=49165 → OS ephemeral fallback; port dosyaya yazılıyor.
- Token dosyası Unix'te `0o600`; handshake 4-byte BE uzunluk + token; >1024 byte red.
- Bağlantı hız sınırlayıcı (5/sn) — brute-force'a karşı ek engel.
- Mesaj boyutu 1 MiB ile sınırlı; `parse_url` ve eTLD+1 testleri mevcut.
- **Windows'ta token dosyası ACL ile korunmuyor** (`fs::write` kullanılıyor, 0o600 sadece Unix). APPDATA klasörü kullanıcıya özel olduğundan risk düşük ama aynı makinede yönetici olmayan başka bir kullanıcı aynı profili okuyabilir (gerçekçi olmayan senaryo).

### 3.6 Rust / Tauri Katmanı — ✅ Güçlü

**Dosyalar:** `src-tauri/src/lib.rs`, `credential_handler.rs`, `linux_security.rs`, `tauri.conf.json`

- **Screen capture koruması:** Windows `WDA_EXCLUDEFROMCAPTURE`, macOS `NSWindowSharingType::None`, Linux PipeWire/D-Bus izleme + X11 uyarısı.
- **CSP** sıkı: `default-src 'self'`, `object-src 'none'`, `frame-src 'none'`, `form-action 'none'`; `wasm-unsafe-eval` WASM için gerekli; `connect-src` sadece `ipc:`, `http://ipc.localhost` ve HIBP endpoint'i.
- **Updater:** imza doğrulamalı (`pubkey` mevcut, endpoint `releases.aegisvault.app`). Tauri updater default olarak imza doğruluyor. ✅
- **Capabilities:** `default.json` minimal (`core:default`, `biometric:default`) — yüzey dar.
- `MAX_VAULT_FILE_BYTES = 25 MiB` limiti mevcut (dosya enjeksiyonu/kaynak tüketimine karşı).
- KDF parametrelerinin JS'den kontrol edilmesi (3.2'deki downgrade riski) bu katmanın ana bulgusu.

### 3.7 Ağ Politikası (Air-Gap) — ✅ Güçlü

**Dosya:** `src/lib/airgapNetworkPolicy.ts`

- Üretimde fetch/XHR/WebSocket/sendBeacon/EventSource/WebRTC yalnızca izinli hedeflere (IPC, HIBP 5-karakter aralık sorgusu) gidebiliyor; diğerleri **engelleniyor ve güvenlik olayı olarak loglanıyor**. Zero-knowledge iddiasını destekleyen ciddi bir kontrol.

### 3.8 Kurtarma Anahtarı (Recovery Key) — ⚠️ Kısmen

**Dosyalar:** `src/lib/recoveryKey.ts`, `recoveryWords.ts`

- 33 byte CSPRNG → 24×11 bit = 264 bit; **BIP-39 checksum yok** (kod bunu bilinçli olarak belirtiyor: "8 leftover bits discarded"). Yani üretilen ifade **spec uyumlu bir BIP-39 mnemonic değil** — sadece BIP-39 kelime listesini kullanıyor. README'nin "24-word BIP-39 Recovery Key" ifadesi yanıltıcı.
- Bundle, master parolayı Argon2id(kelime öbeği)+AES-256-GCM ile şifreliyor; güvenli depolama yoksa **düz IndexedDB'ye** düşüyor (içerik şifreli olduğundan kabul edilebilir; bundle çalınsa bile 256-bit ifade gerekli).
- Kurtarma akışı master parolayı **JS string** olarak döndürüyor (zeroize edilemez) — kabul edilmiş sınır.

### 3.9 Test Kalitesi & CI — ✅ Çok Güçlü

- 154 test dosyası / 1196 test, %89.2 satır kapsama; fuzz testleri (`fast-check`): encryption, importer, attachments.
- Stryker mutasyon testleri: core, importer, storage, storage-orchestration, importer-helpers ayrı ayrı.
- Güvenlik gate'leri test zamanında çalışıyor: `security-no-js-master-string`, `security-csp-no-unsafe-inline`, asset integrity manifest.
- **Eksik:** CI yalnızca typecheck + lint + unit + cargo test çalıştırıyor. **Playwright E2E, Stryker mutasyon ve güvenlik gate'leri CI'da değil** (README'de "0 regression tolerance" iddiası var ama CI bunu tam doğrulamıyor).

---

## 4. BULGU ÖZETİ (Öncelik Sıralı)

### 🔴 Yüksek Öncelik (P1)
| # | Bulgu | Konum | Etki |
|---|---|---|---|
| 1 | **KDF parametresi downgrade saldırısı** — vault açılışında minimum eşik yok; Rust JS'ten gelen parametreyi olduğu gibi kabul ediyor | `sqlite_opfs.ts`, `waSqliteVaultStorageRepository.ts`, `credential_handler.rs:17-37` | Vault dosyasını düzenleyebilen saldırgan Argon2id'i ucuzlatıp offline brute-force yapabilir |
| 2 | **"Per-Item Key Isolation" gerçekte yok** — `derivePerItemKey` yalnızca testte çağrılıyor | `webcrypto.ts:182-201` | README iddiası ile gerçek uyumsuz; tek vault anahtarı sızarsa tüm satırlar çözülür |
| 3 | **Extension message sender doğrulaması eksik** — origin/URL kontrolü yok | `src-extension/background.ts:47-171` | Zararlı sayfa pending/listed credential'ları çekebilir |

### 🟠 Orta Öncelik (P2)
| # | Bulgu | Konum |
|---|---|---|
| 4 | `list_credentials` tüm cache'i döndürüyor; content script her sayfada çağırıyor | `native_messaging.rs:528-543`, `content.ts:674` |
| 5 | Biometric v3 `wrappingSecret` bundle ile aynı kayıtta | `biometric.ts:36-43,363-380` |
| 6 | Argon2id WASM sessiz bellek düşürmesi (32→16→8 MiB) | `argon2id.ts:83-103` |
| 7 | `importedKeysCache`'te anahtarın SHA-256 parmak izi, sadece düzgün kilitlenmede temizleniyor | `webcrypto.ts:50-91` |
| 8 | Alfanümerik tuzlar (`secureRandomToken(16)`) — ham byte yerine | `sqlite_opfs.ts`, `waSqliteVaultStorageRepository.ts` |
| 9 | Content script clipboard temizlemesi yok (masaüstünde 30 sn var) | `content.ts:1012` |
| 10 | Windows'ta token/port dosyaları ACL korumasız (`0o600` yalnızca Unix) | `native_messaging.rs:121-142` |

### 🟡 Düşük Öncelik / Bilgi (P3)
| # | Bulgu |
|---|---|
| 11 | BIP-39 checksum yok — "BIP-39 Recovery Key" ifadesi düzeltilmeli |
| 12 | `Math.random()` güvenlik dışı ID'lerde (mock audit, event log) |
| 13 | Düz metin JSON export seçeneği riskli; tehdit modeli kendisi "remove edilebilir" diyor |
| 14 | CI'da E2E/mutasyon/security gate'leri eksik |
| 15 | PSL sabit liste (32 sonek) — eksiksiz PSL veritabanı değil |

---

## 5. README İDDİASI ↔ GERÇEK KOD KARŞILAŞTIRMASI

| README iddiası | Gerçek | Durum |
|---|---|---|
| Argon2id 32 MiB / 3 iter | Doğru; Rust + WASM parite | ✅ |
| AES-256-GCM, 128-bit tag, 12-byte IV | Doğru | ✅ |
| **Per-Item HKDF Key Isolation** | `derivePerItemKey` var ama **kullanılmıyor**; tek vault anahtarı | ⚠️ **Yanlış/abartılı** |
| At-rest field masking `[encrypted: aes-256-gcm]` | Doğru (title/username/password/notes) | ✅ |
| 24-word BIP-39 Recovery | Kelime listesi kullanılıyor; **checksum yok**, spec-uyumsuz | ⚠️ Kısmen |
| wa-sqlite (OPFS) | Gerçek wa-sqlite yeni kurulumlarda; desktop legacy OPFS/JSON | ⚠️ Kısmen |
| Dynamic TCP port probe 49155–49165 | Doğru; OS ephemeral fallback | ✅ |
| 256-bit pairing token | Doğru; `OsRng`, constant-time | ✅ |
| eTLD+1 Public Suffix List (33+) | Sabit 32 sonek listesi; eksiksiz PSL değil | ⚠️ Kısmen |
| Closed Shadow DOM UI isolation | Doğru; `mode:'closed'` | ✅ |
| 30s clipboard auto-clear | Masaüstünde doğru; **extension content path'te yok** | ⚠️ Kısmen |
| Rust ZeroizeOnDrop, WASM zeroizer | Doğru | ✅ |
| 5-min decrypted items cache TTL | Doğru | ✅ |
| Hardware-backed biometric | v4 WebAuthn PRF donanım-bağlı; v3 wrapping secret yan yana | ⚠️ Kısmen |
| Security Audit 92/100 (A+) | Kendi kendine verilmiş; **bu analiz: 88/100 (A)** | ⚠️ İyimser |
| 1196 test, 154 dosya, %89.2 kapsama | Doğru | ✅ |
| TypeScript 0 errors | Doğru (tsc --noEmit) | ✅ |

---

## 6. İYİLEŞTİRME ÖNERİLERİ (ÖNCELİKLİ)

### P1 — Acil
1. **KDF downgrade koruması:** `getKdfParams()`'ta (her iki depolama motoru) ve `credential_handler.rs::to_params()`'ta minimum eşik uygula: `memoryKiB >= 8192 && iterations >= 3`. Backup yolundaki korumayı vault açılışına taşı. Test: bozuk/düşük parametreli vault dosyasıyla unlock reddedilmeli.
2. **Per-item key'i gerçekten kullan** veya README'yi düzelt: satır şifrelemede `derivePerItemKey(masterKey, itemId)`'i `enc_metadata` yazımında çağır (mevcut tek-anahtar yapısı üstüne geriye dönük uyumlu katman: eski satırlar tek anahtarla, yeniler per-item). En azından dokümantasyonu "per-item key isolation (attachment/passkey)" olarak netleştir.
3. **Extension sender doğrulaması:** `background.ts` listener'ında `sender.url`'yi doğrula — yalnızca `chrome-extension://` kendi kaynağından gelen istekleri kabul et; content script mesajlarında `sender.tab.url`'yi kaydet ve `get_credentials`/`list_credentials` çağrılarını aktif sekme URL'siyle sınırla.

### P2 — Kısa vade
4. `list_credentials`'ı Rust tarafında URL filtreli hale getir veya content script'in `initializePhishingCheck`'ini `get_credentials` (mevcut URL) ile değiştir — tüm cache'i sayfaya açma.
5. Biometric v3 `wrappingSecret`'i bundle'dan ayır: anahtarı Android Keystore'da (non-exportable) tut, bundle'a sadece wrapped payload.
6. WASM Argon2id fallback'inde sessiz düşürme yerine **açık kullanıcı uyarısı** veya düşürme logu ekle.
7. `importedKeysCache` temizliğini lock'a bağlamanın yanında, cache entry'lerini `SHA-256` yerine **HashSet<CryptoKey>` referansı** ile tut (parmak izi kaldır).
8. Tuzları `secureRandomToken(16)` yerine `secureRandomBytes(16)` ile üret.
9. Extension şifre üretimi sonrası `clipboard` için 30 sn temizleme ekle (masaüstü `clearClipboardIfUnchanged` ile aynı desen).
10. Windows'ta token/port dosyalarına kullanıcı-only ACL uygula (PowerShell `icacls` veya Rust `windows-sys` `SetFileSecurity`).

### P3 — Orta vade
11. BIP-39 checksum'u implement et veya dokümantasyonda "24-word recovery phrase (BIP-39 wordlist)" de.
12. PSL'i tam veritabanına (`publicsuffix.org` listesi, derlenmiş) geçir.
13. Düz metin JSON export'u release build'den kaldır ya da kullanıcıya şifreli `.aegis` zorunluluğu sun.
14. CI'ya Playwright E2E + Stryker mutasyon + `security:*` gate'lerini ekle (README "0 regression tolerance" iddiasını CI'da doğrula).
15. `Math.random()` kullanımlarını `secureRandomBytes` ile değiştir (tutarlılık).

---

## 7. RAKİP KARŞILAŞTIRMASI & PUANLAMA

> Karşılaştırma, 2026 itibarıyla her ürünün **varsayılan/önerilen** güvenlik yapılandırmasına dayanır. Puanlar 0-100 arası, güvenlik mimarisi perspektifinden.

| Kriter | **Aegis Vault 7** | Bitwarden | 1Password | KeePassXC | Proton Pass |
|---|---|---|---|---|---|
| **Şifreleme** | AES-256-GCM (WebCrypto) | AES-256-CBC + HMAC | AES-256-GCM | AES-256-GCM (ChaCha20 ops.) | AES-256-GCM |
| **KDF (default)** | Argon2id 32 MiB/3 iter | PBKDF2-SHA256 600k (Argon2id opsiyonel) | PBKDF2-SHA256 650k | Argon2id 64 MiB/1 iter (default DB) | Argon2id 64 MiB/3 iter |
| **Per-item anahtar** | ⚠️ Attachment/passkey'de var; **vault satırlarında yok** (tek anahtar) | Vault anahtarı + per-item salted key | 1Password Secret Key + per-item | Ana anahtar; per-item varyasyon | Vault anahtarı |
| **KDF gücü kıyası** | 32 MiB/3 iter (güçlü) | 600k PBKDF2 (orta) | 650k PBKDF2 (orta) | 64 MiB/1 iter (çok güçlü) | 64 MiB/3 iter (çok güçlü) |
| **Mimari** | Local-first, offline, Tauri | Bulut (self-host opsiyonel) | Bulut | Local file | Bulut |
| **Zero-knowledge** | ✅ (air-gap ağ politikası) | ✅ (servis tarafı şifreleme) | ✅ | ✅ (dosya tabanlı) | ✅ |
| **Açık kaynak** | ✅ Apache 2.0 (repo halka açık değil ama kod şeffaf) | ✅ GPL-3 | ❌ Kapalı kaynak | ✅ GPL-3 | ✅ GPL-3 |
| **Bağımsız denetim** | ⚠️ Kendi kendine (92/100); 3. parti denetim belgesi yok | ✅ Yıllık bağımsız (Cure53, Trail of Bits) | ✅ Yıllık bağımsız (many) | ✅ Bağımsız denetimler (Rust/Go) | ✅ Bağımsız (Cure53) |
| **Çok platform** | Desktop (Win/Linux/macOS) + Android + WebExt | Her yerde | Her yerde | Desktop (mobile 3. parti) | Her yerde |
| **Biyometri** | Android Keystore + WebAuthn PRF (v4) | ✅ | ✅ | ❌ (yok) | ✅ |
| **Eklenti güvenliği** | Shadow DOM izole, native bridge token'lı | İyi | Çok iyi (sıfır bilgi + UX) | N/A | İyi |
| **Kurtarma** | 24 kelime ifade (checksum yok) + secret key | Kurtarma anahtarı | Secret Key + kurtarma kiti | Dosya + ana parola | Kurtarma anahtarı |
| **Yenilik** | Dynamic port IPC, air-gap politikası, WASM zeroizer, field masking | Olgun, geniş | Olgun, UX lideri | Minimalist, güvenlik sert | Olgun, gizlilik odaklı |

### 📊 Kategorik Puan Tablosu (0-100)

| Kategori | Ağırlık | Aegis Vault 7 | Bitwarden | 1Password | KeePassXC | Proton Pass |
|---|---|---|---|---|---|---|
| Kriptografi (primitifler, KDF, IV/tag) | %25 | **95** | 85 | 92 | 96 | 94 |
| Mimari & anahtar yönetimi | %20 | **85** | 90 | 95 | 88 | 90 |
| Veri-at-rest & depolama | %15 | **88** | 86 | 92 | 95 | 88 |
| Uygulama güvenliği (IPC, eklenti, XSS) | %15 | **87** | 88 | 93 | 85 | 88 |
| Tehdit modeli & dokümantasyon | %10 | **95** | 90 | 92 | 85 | 88 |
| Bağımsız denetim & kanıt | %10 | **70** | 95 | 97 | 88 | 92 |
| Test & CI kalitesi | %5 | **93** | 80 | 82 | 75 | 78 |
| **Ağırlıklı TOPLAM** | | **88.1 (A)** | **87.6 (A)** | **92.5 (A)** | **89.8 (A)** | **89.5 (A)** |

### 🏆 Genel Değerlendirme

- **1Password (92.5)** — En dengeli güvenlik + UX + bağımsız denetim geçmişi; Secret Key mimarisi ve 10 yılı aşkın denetim kanıtı en güçlü.
- **KeePassXC (89.8)** — KDF (Argon2id 64 MiB) ve dosya tabanlı sade mimari ile kriptografik olarak en agresif; UX ve mobil tarafı zayıf.
- **Proton Pass (89.5)** — 64 MiB/3 iter Argon2id + Cure53 denetimleri; gizlilik markası güçlü.
- **Aegis Vault 7 (88.1)** — **Teknik olarak rakiplerle başa baş**, hatta mimari yenilikte (air-gap ağ politikası, field masking, dynamic IPC, WASM zeroizer) önde. Puanı düşüren üç şey: (1) per-item key iddiasının gerçekte uygulanmaması, (2) KDF downgrade korumasının eksikliği, (3) **bağımsız üçüncü parti denetim kanıtının olmaması** — README'deki 92/100 kendi kendine verilmiş.
- **Bitwarden (87.6)** — En geniş kullanıcı tabanı ve olgunluk; KDF default'u (PBKDF2 600k) ve CBC+HMAC kombinasyonu Aegis'in GCM/Argon2id yığınından bir adım geride.

---

## 8. SONUÇ

**Aegis Vault 7, teknik kalite açısından ticari rakiplerle aynı ligde, hatta bazı katmanlarda önde bir şifre yöneticisi.** Kriptografik primitifler doğru, anahtar sıfırlama disiplini sektör ortalamasının üzerinde, tehdit modeli örnek niteliğinde ve test altyapısı (fuzz + mutasyon + güvenlik gate'leri) çok güçlü.

Kapatılması gereken kritik boşluklar:
1. **KDF downgrade koruması** (P1, güvenlik açığı sınıfında)
2. **Extension sender/origin doğrulaması** (P1)
3. **Per-item key iddiasının ya gerçekleştirilmesi ya da dokümantasyonun düzeltilmesi** (P1, bütünlük/şeffaflık)
4. **Üçüncü parti bağımsız güvenlik denetimi** — 92/100'lük kendi skoru yerine bağımsız bir Cure53/Trail of Bits seviyesi denetim, ürünün "enterprise-grade" iddiasını kanıtlar.

Bu dört madde kapatıldığında Aegis Vault 7, **90+ puan bandına ve rakiplerin zirvesine** çıkabilir.

---

*Bu rapor statik kod analizi + doküman doğrulaması + kamuya açık karşılaştırma verileriyle hazırlanmıştır; ürünün canlı çalışan sürümünde dinamik penetrasyon testi yapılmamıştır.*
