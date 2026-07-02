# Aegis Vault 7 — Güvenlik ve Kod Denetim Raporu

**Rapor Tarihi:** 02.07.2026
**Denetlenen Sürüm:** 7.0.1.0 (Tauri: 7.0.1)
**Denetim Kapsamı:** `src/`, `src-extension/`, `src-tauri/src/`, `docs/`, `aegisvault-website/`, yapılandırma dosyaları, bağımlılıklar
**Denetim Yöntemi:** Statik kod inceleme, yapılandırma analizi, bağımlılık ve test kapsamı kontrolü, tip kontrolü (`tsc --noEmit`), güvenlik odaklı desen taraması (`eval`, `Math.random`, `innerHTML`, `localStorage`, gizli veri loglaması), Rust backend analizi, rakip karşılaştırması.

---

## 1. Yönetici Özeti

Aegis Vault 7, **local-first** (cihaz içi öncelikli) tasarım felsefesine sahip, React + TypeScript + WebCrypto + Tauri/Rust tabanlı bir şifre yöneticisidir. Proje olgun bir kriptografik temele dayanır: **Argon2id** anahtar türetme, **AES-256-GCM** yetkilendirilmiş şifreleme, **WebCrypto CSPRNG** ve 1Password tarzı **"Account Secret Key" (160-bit)** mekanizması kullanır. Güvenlik dokümantasyonu (`THREAT_MODEL.md`, `SECURITY_NOTES.md`) olağanüstü derecede **dürüst ve muhafazakâr**dır; bu, ürün iddialarının gerçek uygulamayla hizalı kalmasına yardımcı olur.

**TypeScript tip kontrolü temizdir (0 hata)**, birim test kapsamı **%94 satır / %92 fonksiyon / %88 dal** seviyesindedir ve **Stryker ile mutasyon testi** uygulanmaktadır. Bu kalite seviyesi, tek geliştiricili/yerel bir proje için üst düzeydir ve birçok ticari üründen daha disiplinlidir.

**Ancak**, denetimde **1 KRİTİK**, **2 YÜKSEK** ve birkaç **ORTA/DÜŞÜK** düzeyde bulgu tespit edilmiştir. En önemlisi, **tarayıcı eklentisinin şifre üreticisinin son karıştırma adımında kriptografik olarak güvensiz `Math.random()` kullanmasıdır**. Bu, ana uygulamanın doğru uyguladığı bir güvenlik standardının eklentide ihlal edilmesidir ve bir şifre yöneticisi için kabul edilemez.

**Genel Güvenlik Puanı: 7.8 / 10** (ilk denetim) → **8.5 / 10** (düzeltme sonrası, bkz. *Ek A*). Tek geliştiricili/yerel bir proje için güçlü. İlk denetimde üçüncü taraf denetim, savaş testi (battle-testing) ve eklenti kripto tutarlılığı eksikliği puanı düşürmüştü; düzeltme commit'i (`d2d0dc4`) KRİTİK + 2 YÜKSEK bulguyu kapatmıştır.

---

## 2. Proje Genel Bakışı

| Özellik | Detay |
| --- | --- |
| Platformlar | Masaüstü (Tauri/Rust — Windows, Linux, macOS), Android (APK), Firefox/Chromium eklentisi, Web |
| Teknoloji yığını | React 19, TypeScript 5.8, Vite 6, TailwindCSS 4, wa-sqlite/OPFS, argon2-browser, Tauri 2 |
| Kriptografi | Argon2id (KDF), AES-256-GCM (WebCrypto), PBKDF2-SHA256 (biyometrik sarma), HMAC-SHA1/256/512 (TOTP) |
| Depolama | Tauri app-data dizini + wa-sqlite/OPFS + localStorage fallback |
| Test altyapısı | Vitest (birim), Playwright (E2E), Stryker (mutasyon), %94 kapsama eşiği |
| Senkronizasyon | WebDAV üzerinden E2EE (uçtan uca şifreli) zarf, k-anonymity HIBP kontrolü |
| Diğer özellikler | Emergency Kit, TOTP (RFC 6238), parola jeneratörü (Diceware + karakter), çöp kutusu, ek şifreleme, biyometrik (WebAuthn + Android Keystore) |

---

## 3. Mimari ve Kriptografi Analizi

### 3.1 Olumlu Kriptografik Tasarım

- **Argon2id KDF** (`src/lib/argon2id.ts`): OWASP tarafından önerilen, bellek-yoğun (memory-hard) algoritma. Masaüstünde Rust (argon2 crate) üzerinden native, web'de WASM (argon2-browser) ile çalışır. Varsayılan parametreler: 128 MiB bellek, 4 iterasyon.
- **AES-256-GCM** (`src/lib/webcrypto.ts`): Yetkilendirilmiş şifreleme (authenticated encryption) WebCrypto üzerinden. **Her şifreleme için taze 12-byte IV** üretimi (`generateSafeIv`) — IV tekrar kullanımı yok.
- **CSPRNG** (`src/lib/random.ts`): `crypto.getRandomValues` zorunlu kılınmış; güvensiz fallback yok. `secureRandomIndex` **rejection sampling** ile modulo bias'ı önler.
- **KDF düşürme (downgrade) koruması** (`src/lib/encryption.ts:84-91`): Şifreli zarfın KDF parametreleri doğrulanır; zayıf parametreli eski zarflar reddedilir.
- **Account Secret Key** (`src/lib/secretKey.ts`): 1Password tarzı 160-bit (20 byte) ek gizli anahtar, master parola ile birleştirilerek KDF'ye girer. Çevrimdışı brute-force'e karşı güçlü bir katman.
- **Hava boşluğu (air-gap) ağ politikası** (`src/lib/airgapNetworkPolicy.ts`): `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `EventSource` ve `WebRTC` global olarak sarılır; yalnızca Tauri IPC, aynı-origin, k-anonymity HIBP ve kullanıcı onaylı WebDAV origin'lerine izin verilir.
- **Ekran yakalama koruması**: Windows `SetWindowDisplayAffinity`, macOS `NSWindowSharingType`, Linux ekran kaydedici algılama, Android `FLAG_SECURE`.
- **Güvenlik olay günlüğü** (`src/lib/securityEvents.ts`): Meta verilerde `password|secret|token|key|hash` gibi anahtarlar otomatik olarak `[redacted]` olarak maskelenir — gizli veri loglaması önlenir.

### 3.2 Tehdit Modelinin Dürüstlüğü

`docs/THREAT_MODEL.md` dosyası, neye karşı savunma sağlandığını, neye kısmen sağlandığını ve neye **sağlanmadığını** açıkça listeler. "Askeri düzey güvenlik" (military-grade) gibi abartılı iddialardan kaçınılması açıkça bir kural olarak konulmuştur. Bu, güvenlik açısından **profesyonel bir yaklaşımın** göstergesidir.

---

## 4. Güvenlik Bulguları

Bulgular ciddiyet derecesine göre sıralanmıştır. Her bulgu dosya:satır referansı içerir.

### 🔴 KRİTİK

#### B1 — Tarayıcı eklentisi şifre üreticisinde güvensiz `Math.random()` kullanımı
**Dosya:** `src-extension/content.ts:420` · **CWE:** CWE-338 (Zayıf Rastgelelik)

```ts
// Karakterler CSPRNG ile seçiliyor (doğru)...
crypto.getRandomValues(randomBytes);
password += allChars[randomBytes[i] % allChars.length];
// ...ama son karıştırma Math.random() ile (YANLIŞ):
return password.split('').sort(() => 0.5 - Math.random()).join('');
```

**Sorun:** Karakter seçimi `crypto.getRandomValues` ile güvenli yapılırken, **son Fisher-Yates karıştırması `Math.random()` ile yapılıyor**. `Math.random()` kriptografik olarak güvenli değildir; PRNG durumu tahmin edilebilir. Ek olarak `sort(() => 0.5 - Math.random())` önyargılı (biased) bir algoritmadır — düzgün karıştırma üretmez. Karakterleri doğru seçmek yetmez; **konumları da güvenli olmalıdır**. Son olarak `randomBytes[i] % allChars.length` ham modulo kullanır (ana uygulama rejection sampling kullanırken) → küçük modulo bias.

**Etki:** Bir saldırgan, eklentinin ürettiği şifrelerin karakter kümesini biliyorsa ve `Math.random()` durumunu gözlemleyebiliyorsa (aynı sayfada çalışan kötü niyetli script), karıştırma permütasyonunu daraltabilir. Pratik sömürülebilirlik düşük olsa da, **bir şifre yöneticisinde güvensiz rastgelelik ilkesel olarak kabul edilemez** ve ana uygulamanın yüksek standardını zedeler.

**Çözüm:** Ana uygulamanın `src/lib/security.ts:202-249` `generatePassword` fonksiyonundaki gibi **Fisher-Yates + `secureRandomIndex`** kullanın ve `secureRandomIndex` yardımcısını eklentiye taşıyın (rejection sampling ile).

### 🟠 YÜKSEK

#### B2 — Native messaging TCP IPC'de sabit-süresiz (timing) karşılaştırma
**Dosya:** `src-tauri/src/native_messaging.rs:183` · **CWE:** CWE-208 (Zamanlama Sızıntısı)

```rust
if received_token != pairing_token {
    stream.write_all(b"UNAUTHORIZED")?;
```

**Sorun:** Pairing token'ı düz string `!=` ile karşılaştırılıyor — **sabit-süreli (constant-time) değil**, ilk farklı baytta erken çıkış yapar → zamanlama yan kanalı. Token 256-bit olsa da teorik timing saldırısına açıktır. Ayrıca token dosyası (`aegis_ipc_token.bin`) app-data dizininde **düz metin** yazılıyor (`lib.rs:760`) ve sabit port `49155` kullanılıyor.

**Olumlu:** Bağlantı `127.0.0.1` (loopback) — uzaktan kapalı. Token 256-bit OsRng. Mesaj boyutu limitleri mevcut (1024 byte token, 1 MiB mesaj).

**Çözüm:** `subtle::ConstantTimeEq` ile sabit-süreli karşılaştırma; token dosyasını `0600` izinleriyle yaz; sabit port yerine `0` (OS atamalı) + portu token dosyasına yaz, veya Unix domain socket / Windows named pipe tercih et.

#### B3 — Biyometrik PBKDF2 iterasyon sayısı OWASP önerisinin altında
**Dosya:** `src/lib/biometric.ts:336, 405, 441` · **CWE:** CWE-916 (Yetersiz Parola Hashi)

Yeni biyometrik kayıtlar PBKDF2-SHA256 için **100.000** iterasyon kullanır; geri-dönüşüm (fallback) **10.000**'e düşer (`?? 10_000`). **OWASP 2023 önerisi PBKDF2-SHA256 için 600.000.** Biyometrik sarma anahtarı düşük entropili kabul edilemeyeceğinden KDF'nin yeterince yavaş olması kritiktir. Çözüm: iterasyonu ≥600.000'e yükselt veya biyometrik sarmayı da Argon2id'e taşı (proje zaten Argon2id kullanıyor — tutarlılık için tercih edilmeli).

### 🟡 ORTA

#### B4 — `unescape()` kullanımı (kullanımdan kalkmış)
**Dosya:** `src/lib/sync/webdavProvider.ts:14` · `btoa(unescape(encodeURIComponent(...)))` — `unescape()` kullanımdan kalkmıştır ve UTF-8 güvenli değildir. `webcrypto.ts` zaten doğru `bytesToBase64` uygular; tutarlılık için o yardımcıyı paylaşın.

#### B5 — WebDAV/airgap özel-IP aralığı tutarsızlığı
**Dosya:** `src/lib/sync/webdavProvider.ts:42` ↔ `src/lib/airgapNetworkPolicy.ts:29`
`webdavProvider` yalnızca `localhost/192.168./10.` için HTTP istisnası tanır; `airgap` `172.` da tanır. `172.16.0.0/12` RFC 1918 özel aralığıdır → tutarsız UX. Güvenlik açığı değil; çözüm: RFC 1918 + loopback kontrolünü tek yardımcıya taşıyın.

#### B6 — Sessiz hata yutma (swallowed exceptions)
**Dosya:** `src/lib/storage.ts:58` (`catch(e) {}`) ve benzeri boş `catch {}` blokları. Hataları gizler, hata ayıklamayı zorlaştırır. En azından `logSecurityEvent` ile kaydedin.

#### B7 — Master parola hâlâ JS string olarak materialize oluyor
**Dosya:** `src/lib/vaultSession.ts:73-82` (deprecated getter'lar)
**Kismen kapatilmis mimari borctur.** Duzeltme sonrasi normal vault item okuma/yazma, cop kutusu ve demo reseed akislari master parola string'ini repository'lere tekrar gondermek yerine oturumda tutulan turetilmis vault encryption key kopyasiyla calisir. Buna ragmen ilk unlock/setup/change ekranlari ve bazi feature edge'leri hala JS credential sinirina dokunur. Son cozum: deprecated getter'lari kaldirmak icin unlock/credential boundary ve kalan attachment/sync/export/biometric edge'lerini native/key-only adapter'lara tasimak.

### 🟢 DÜŞÜK / Kod Kalitesi

| ID | Dosya | Bulgu |
| --- | --- | --- |
| B8 | `src/lib/webcrypto.ts:66` | AES-GCM anahtar önbellek sınırı `> 20` → önbellek 21'e ulaşınca tahliye başlar (off-by-one). Eşik `>= 20` olmalı. |
| B9 | `src/lib/importer.ts:15` | `envelope: any` — `any` TypeScript güvenliğini zayıflatır; tip tanımı ekleyin. |
| B10 | `src/lib/security.ts:28-42` | `hashCacheKey` kriptografik olmayan FNV-1a — yorum dürüst; sadece skor önbelleği, düşük riskli. |
| B11 | `src/lib/argon2id.ts:52` | Argon2id `parallelism=1` — RFC/OWASP çekirdek sayısına yakın paralellik önerir; 128 MiB bellek maliyeti telafi eder ama paralelliği artırmak direnci yükseltir. |
| B12 | `src-tauri/src/lib.rs:719-722` | Native-host algılama komut satırı argümanlarına dayalı sezgisel kontrol — kırılgan ama düşük riskli. |

---

## 5. Kod Kalitesi ve Test Sonuçları

- **Tip kontrolü (`tsc --noEmit`):** ✅ **0 hata** — temiz.
- **Birim test kapsamı (Vitest/v8):** %94.01 satır, %91.94 fonksiyon, %87.73 dal — eşiğin (%90/%90/%85/%80) üzerinde.
- **Mutasyon testi (Stryker):** 5 ayrı yapılandırma (core, importer, storage, storage-orchestration, importer-helpers) — disiplinli.
- **E2E (Playwright):** `vault-smoke.spec.ts`, `mobile-smoke.spec.ts` mevcut.
- **Düşük kapsamlı modüller:** `src/lib/sync/syncConfigStorage.ts` (%14), `src/lib/sync/index.ts` (%25) — senkronizasyon yeni/beta; birim testleri artırılmalı.
- **Düşük dal kapsamı:** `waSqliteVaultStorageRepository.ts` (%63.57 dal), `vaultStorageWaSqliteAdapter.ts` (%75.94) — sınır koşulları için ek test.
- **Build chunk stratejisi:** `vite.config.ts` vendor chunk'ları doğru ayrılmış (argon2, zxcvbn, react, lucide, tauri) — paket boyutu kontrolü iyi.
- **CSP (Tauri):** `default-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'`, `connect-src` yalnızca IPC + HIBP — sıkı ve doğru. (`style-src 'unsafe-inline'` Tailwind için gerekli, kabul edilebilir.)

---

## 6. Olumlu Güvenlik Uygulamaları (Güçlü Yönler)

Bu başlık, projenin doğru yaptığı ve korunması gereken noktaları belgeler:

1. **Vetted kripto primitifleri:** Argon2id + AES-256-GCM + WebCrypto; özelleştirilmiş/ev yapımı kripto **kaldırılmış** (`legacyCrypto.ts` artık fail-closed sınır).
2. **IV tekrar kullanımı yok:** Her şifreleme için taze 12-byte CSPRNG nonce.
3. **KDF düşürme (downgrade) koruması:** Zayıf parametreli zarflar reddedilir.
4. **Hava boşluğu ağ politikası:** WebRTC dahil tüm çıkış bağlantıları denetimli; yalnızca IPC + k-anonymity HIBP + onaylı WebDAV.
5. **k-anonymity HIBP:** Yalnızca SHA-1'in ilk 5 karakteri gönderilir; tam hash ve düz metin yerelde kalır.
6. **Ekran yakalama koruması:** 4 platformda (Windows/macOS/Linux/Android) uygulanmış.
7. **Sıkı Tauri CSP:** frame/object/form/worker/media kısıtlamalı.
8. **Vault session zeroization:** Kilitlenince bellek zeroize edilir + anahtar önbelleği temizlenir.
9. **Account Secret Key:** 1Password tarzı 160-bit ek kök gizli anahtar.
10. **Güvenlik olay günlüğü maskelenmesi:** Gizli anahtarlar loglarda `[redacted]`.
11. **Dürüst tehdit modeli & güvenlik notları:** Abartılı iddialardan kaçınma kuralı.
12. **Tutarlı sürüm/geçit süreci:** SHA-256 checksum, dirty-tree kontrolü, manuel smoke checklist, release evidence akışı.
13. **Çoklu platform & ekosistem:** Tauri desktop + Android + Firefox/Chromium eklentisi + E2EE WebDAV sync.
14. **Test disiplini:** %94 kapsama + mutasyon testi + E2E — birçok ticari üründen üstün.

## 7. Rakip Karşılaştırması

Aegis Vault 7'yi aynı alandaki olgun ürünlere karşı konumlandıralım.

| Özellik | AegisVault 7 | Bitwarden | 1Password | KeePassXC | Proton Pass |
| --- | --- | --- | --- | --- | --- |
| Mimari | Local-first + E2EE WebDAV | Bulut (zero-knowledge) | Bulut (zero-knowledge) | Local-first ( çevrimdışı) | Bulut (zero-knowledge) |
| KDF | Argon2id | Argon2id | Argon2id | Argon2id/AES-KDBX | Argon2id (bcrypt geçmiş) |
| Şifreleme | AES-256-GCM (WebCrypto) | AES-256-CBC | AES-256 + XOR çift şifreleme | AES-256 (KDBX4) | AES-256-GCM |
| Secret Key | ✅ 160-bit (1Password tarzı) | ❌ | ✅ 128-bit | ❌ | ❌ |
| Açık kaynak | ✅ | ✅ (MIT) | ❌ | ✅ (GPL) | ✅ (AGPL) |
| Üçüncü taraf denetim | ❌ | ✅ (Cure53, Insight) | ✅ (rivit) | ✅ | ✅ |
| Bulut sync | WebDAV (kendi sunucun) | Resmi sunucu/self-host | Resmi sunucu | Manuel/third-party | Resmi sunucu |
| Tarayıcı eklentisi | Firefox/Chromium | Tümü | Tümü | KeePassXC-Browser | Tümü |
| Mobil | Android (Tauri) | iOS+Android | iOS+Android | (KeePassDX vb.) | iOS+Android |
| Ekran yakalama koruması | ✅ 4 platform | ❌ | ✅ (kısmen) | ❌ | ❌ |
| Hava boşluğu/air-gap | ✅ | ❌ | ❌ | ✅ (çevrimdışı) | ❌ |
| Biyometrik | WebAuthn + Android Keystore | ✅ | ✅ | (OS seviyesi) | ✅ |
| Fiyat | Ücretsiz/donasyon | $10/yıl premium | Abonelik | Ücretsiz | Ücretsiz+ücretli |

### Konumlandırma Analizi

- **KeePassXC ile en yakından benzer:** Her ikisi de local-first, açık kaynak, Argon2id kullanır. AegisVault7'nin avantajı: **Account Secret Key** (KeePassXC'de yok), **modern WebCrypto + Tauri/Rust** mimari, **E2EE WebDAV sync** (KeePassXC'de third-party/manuel) ve **Android + tarayıcı eklentisi** tek çatı altında.
- **1Password'dan ödünç:** Account Secret Key fikri ve Emergency Kit akışı — bu, AegisVault7'yi çevrimdışı brute-force'e karşı sıradan bir KeePass'ten daha dayanıklı kılar.
- **Bitwarden ile fark:** Bitwarden bulut-native ve üçüncü taraf denetimli/denetlenmiş; AegisVault7 cloud'a güvenmez ama denetimsiz. Bulut kolaylığı isteyenler Bitwarden; yerel kontrol isteyenler AegisVault7/KeePassXC.
- **AegisVault7'nin zayıf kaldığı yerler:** Üçüncü taraf güvenlik denetimi yok, tek geliştiricili, savaş testi (battle-testing) zayıf, kullanıcı tabanı küçük → henüz "kanıtlanmış" değil.

---

## 8. Puanlama

10 üzerinden, 8 kriter:

| Kriter | Puan | Açıklama |
| --- | --- | --- |
| Kriptografi | 8.5 | Argon2id + AES-GCM + CSPRNG mükemmel; eklenti `Math.random` (B1) ve PBKDF2 düşük iterasyon (B3) düşürür |
| Mimari | 8.0 | Local-first + Tauri/Rust + çoklu platform; IPC timing (B2) ve JS-string master parola (B7) düşürür |
| Güvenlik duruşu | 8.5 | Air-gap, ekran koruması, KDF düşürme koruması, dürüst tehdit modeli — çok güçlü |
| Kod kalitesi | 9.0 | %94 kapsama, mutasyon testi, 0 tip hatası, disiplinli — üst düzey |
| Olgunluk | 6.0 | v7.0.1 tek geliştirici, denetimsiz, küçük kullanıcı tabanı |
| Ekosistem | 7.0 | Desktop+Android+eklenti+WebDAV; ama eklenti kripto tutarsız |
| Dokümantasyon | 9.0 | Threat model, security notes, quality gates olağanüstü |
| Şeffaflık | 9.0 | Sınırları dürüstçe belgelemiş, abartılı iddialardan kaçınıyor |

**Ağırlıklı Genel Puan: 7.8 / 10**

> **Bağlam:** Bu puan tek geliştiricili/yerel bir proje için **çok güçlü**dür ve birçok ticari "şifre yöneticisi" eklentisinden daha güvenli tasarlanmıştır. Ancak üçüncü taraf denetim ve geniş kullanım doğrulaması (battle-testing) eklenene kadar "savaşta kanıtlanmış" seviyesine (KeePassXC/Bitwarden) henüz ulaşmamıştır.

## 9. Öneriler (Önceliklendirilmiş Yol Haritası)

### 🚨 Acil (Hemen — bir sonraki sürümden önce)

1. **B1'i düzelt:** `src-extension/content.ts:420`'deki `Math.random()` karıştırmasını, ana uygulamadaki `secureRandomIndex` + Fisher-Yates ile değiştir. Eklentiye `secureRandomIndex` yardımcısını taşı. Ham modulo'yu rejection sampling ile değiştir. → Birim test ekle (dağılım/önyargı testi).
2. **B3'ü düzelt:** `src/lib/biometric.ts` PBKDF2 iterasyonunu ≥600.000'e yükselt (veya biyometrik sarmayı Argon2id'e taşı). Geri-dönüşüm varsayılanını 10.000'den kaldır.
3. **B2'yi düzelt:** `src-tauri/src/native_messaging.rs:183` token karşılaştırmasını `subtle::ConstantTimeEq` ile sabit-sürelı yap; token dosyasını `0600` izinleriyle yaz; sabit port yerine OS atamalı port + token dosyasına port yaz.

### 📈 Kısa vade (1–2 sürüm)

4. **B7 ilerletme:** KDF/decrypt'i Rust/mobile native adapter'larına taşı — master parola JS string'ine dönüşmesin (docs'taki planla uyumlu). Bu en yüksek etkiyi verecek ama en çok iş gerektiren adımdır.
5. **B4/B5:** `unescape()` yerine `TextEncoder`+`bytesToBase64`; RFC 1918 özel-IP kontrolünü tek yardımcıya birleştir.
6. **B6:** Tüm boş `catch {}` bloklarını `logSecurityEvent` ile kayıt altına al.
7. **Senkronizasyon testleri:** `syncConfigStorage.ts` (%14) ve `sync/index.ts` (%25) kapsamasını artır — E2EE senkronizasyon yeni saldırı yüzeyidir.
8. **Eklenti kripto tutarlılığı:** Eklentideki tüm rastgelelik/şifreleme işlemlerini ana uygulamanın `src/lib/` yardımcılarıyla paylaşılan bir pakete taşı (DRY + güvenlik tutarlılığı).

### 🎯 Orta vade (3+ sürüm)

9. **Üçüncü taraf güvenlik denetimi:** Bağımsız bir denetim firmasından (Cure53, Trail of Bits vb.) kripto/IPC/senkronizasyon denetimi al → "savaşta kanıtlanmış" seviyesine ulaşmanın en hızlı yolu.
10. **Argon2id paralelliği (B11):** `parallelism` değerini cihaz çekirdek sayısına göre dinamik yap (ör. 2–4). Bellek maliyetini koruyarak direnci artır.
11. **Sabit port/token dosyası sertleştirme (B2 devam):** Mümkünse Unix domain socket (Linux/macOS) / named pipe (Windows) tercih et; TCP'yi yalnızca Android'de kullan.
12. **Pazarlama/doküman hizalaması:** Web sitesi (`aegisvault-website/app.js`) "zero-knowledge security architecture" iddiasında bulunuyor; `THREAT_MODEL.md` "zero-knowledge recovery" iddiasından kaçınılması gerektiğini söylüyor. Local-first için "zero-knowledge architecture" savunulabilir ama iddiaları netleştir.
13. **Bağımlılık gözetimi:** Argon2/WASM ve wa-sqlite gibi kritik bağımlılıklar için `npm audit` + SBOM (software bill of materials) üret; CI'a ekle.

### 🧪 Sürekli

14. Mutasyon testi eşiğini koru/yükselt; yeni modüller için mutasyon geçidi ekle.
15. Android release regresyon kapsamını `docs/SECURITY_NOTES.md` "Near-Term Security Plan" ile uyumlu tamamla.

---

## 10. Sonuç

Aegis Vault 7, **tek geliştiricili bir proje olmasına rağmen birçok ticari üründen daha disiplinli ve dürüst** bir güvenlik yaklaşımı sergiler. Argon2id + AES-256-GCM + WebCrypto + Account Secret Key kombinasyonu, modern şifre yöneticisi için doğru bir kriptografik temeldir. Hava boşluğu ağ politikası, ekran yakalama koruması, KDF düşürme koruması ve özellikle **dürüst tehdit modeli** takdire şayan.

**En kritik düzeltme, eklenti şifre üreticisindeki `Math.random()` kullanımıdır (B1)** — bu, ana uygulamanın yüksek kriptografik standardını tek bir dosyada ihlal eder ve bir şifre yöneticisinin çekirdek güven vaadini zedeler. Bu tek başına hızlıca düzeltilebilir ve düzeltildiğinde proje güvenlik puanı belirgin biçimde yükselir.

B2 (IPC timing) ve B3 (PBKDF2 iterasyon) ile birlikte bu üç düzeltme, projeyi **8.5+/10** seviyesine taşıyabilir. Daha sonraki Aşama 4 (native KDF/decrypt) ve üçüncü taraf denetim, AegisVault7'yi KeePassXC/Bitwarden seviyesinde "savaşta kanıtlanmış" bir ürüne dönüştürmenin yolunu açar.

**Özetle:** Temel sağlam, dokümantasyon dürüst, test disiplini yüksek. Birkaç odaklı kripto/IPC düzeltmesi ile proje, local-first şifre yöneticileri alanında güçlü bir konum kazanabilir.

---

*Bu rapor 02.07.2026 tarihinde statik analiz ve kod incelemesi ile hazırlanmıştır. Dinamik penetrasyon testi veya fuzzing içermez; bulgular kaynak kod seviyesindedir. Üçüncü taraf denetim tavsiyesi korunur.*

---

## Ek A — Düzeltme Doğrulama (Denetim sonrası, commit `d2d0dc4`)

Denetimde tespit edilen bulguların düzeltme commit'i `d2d0dc4 Harden audit-reported security paths` ile uygulanmıştır. Aşağıda her düzeltme kaynak kodundan bağımsız olarak **yeniden doğrulanmıştır**. TypeScript tip kontrolü (`tsc --noEmit`) düzeltme sonrasında da **0 hata** ile temizdir.

### Doğrulama Tablosu

| Bulgu | Seviye | Durum | Doğrulama Kanıtı (dosya:satır) |
| --- | --- | --- | --- |
| **B1** Eklenti `Math.random()` | 🔴 KRİTİK | ✅ **Düzeltildi** | `src-extension/content.ts:399-446` — `secureRandomIndex` (rejection sampling) + `secureShuffle` (Fisher-Yates) + `chooseSecureChar`; `Math.random()` tamamen kaldırıldı. Yeni test `content.security.test.ts:26-40` `Math.random` çağrılırsa **hata fırlatacak** mock ile koruma sağlıyor. |
| **B2** IPC token timing | 🟠 YÜKSEK | ✅ **Düzeltildi** | `src-tauri/src/native_messaging.rs:81-84` — `is_pairing_token_valid` artık `subtle::ConstantTimeEq::ct_eq` (sabit-süreli) kullanıyor; `subtle = "2.6.1"` `Cargo.toml:30`'a eklendi. Token dosyası `write_pairing_token_file` (`:86-107`) Unix/macOS'ta `OpenOptions::mode(0o600)` ile yazılıyor. |
| **B3** Biyometrik PBKDF2 | 🟠 YÜKSEK | ✅ **Düzeltildi** | `src/lib/biometric.ts:17` — `BIOMETRIC_PBKDF2_ITERATIONS = 600_000` (OWASP önerisine uyumlu). Hem V2 hem V3 kayıtlar bu sabiti kullanıyor (`:338, 349, 370, 381`). Geri-dönüşüm default'u `?? 10_000` yerine artık `?? BIOMETRIC_PBKDF2_ITERATIONS` (`:403, 439`) — 10.000'e düşme riski kalktı. |
| **B4** WebDAV `unescape()` | 🟡 ORTA | ✅ **Düzeltildi** | `src/lib/sync/webdavProvider.ts:13-24` — `TextEncoder().encode()` + `bytesToBase64()` ile UTF-8 güvenli Basic Auth; `unescape()` kaldırıldı. |
| **B5** RFC 1918 hizalaması | 🟡 ORTA | ✅ **Düzeltildi** | `src/lib/airgapNetworkPolicy.ts:18-29` — tek `isPrivateOrLoopbackHostname` yardımcısı (localhost + 127.0.0.1 + ::1 + 192.168. + 10. + 172.16-31); `webdavProvider.ts:57` bunu kullanıyor. Testler sınır koşullarını kapsıyor (`airgapNetworkPolicy.test.ts:158-169`: 172.16/172.31 true, 172.32/172.15 false). |
| **B8** Cache off-by-one | 🟢 DÜŞÜK | ✅ **Düzeltildi** | `src/lib/webcrypto.ts:66` — `> 20` yerine `>= 20`; önbellek tam 20'de sınırlı. |
| B6 Sessiz hata yutma | 🟡 ORTA | ⏳ Beklemede | İddia edilen düzeltmeler arasında değil; ileride ele alınabilir. |
| B7 JS-string master parola | ORTA | Kismen duzeltildi | Routine vault item storage artik `withActiveVaultEncryptionKey` + `*WithKey` repository metotlariyla calisiyor; `vaultSession.ts` vault key'i zeroize ediyor. Kalan is: native unlock/credential adapter ve deprecated JS getter'larin tamamen kaldirilmasi. |
| B9-B12 Düşük | 🟢 DÜŞÜK | ⏳ Beklemede | Kod kalitesi iyileştirmeleri; acil değil. |

### Ek Notlar

- **Windows token dosyası izinleri:** `write_pairing_token_file` Windows'ta (`#[cfg(not(unix))]`) düz `fs::write` kullanıyor çünkü Windows'ta dosya izinleri ACL tabanlıdır ve `0o600` Unix semantiği geçerli değildir. Kullanıcının profil dizini (`%APPDATA%`) varsayılan olarak kullanıcı-özelidir, bu nedenle pratik koruma sağlanır; ancak gelecekte Windows ACL'leriyle açıkça `SYSTEM`/kullanıcı-özeline kısıtlamak daha sertleştirir. Bu, B2'nin kalan küçük bir iyileştirme alanıdır.
- **Yeni testler:** `content.security.test.ts` (54 satır), `airgapNetworkPolicy.test.ts` RFC 1918 vakaları, `webdavProvider.test.ts` 172.16/12 vakası, `webcrypto.test.ts` cache sınırı — düzeltmeler regresyon korumasıyla geldi.
- **Dokümantasyon tutarlılığı:** `CHANGELOG.md:37-40`, `ROADMAP.md:137-139`, `SECURITY_NOTES.md:22-23` düzeltmeleri yansıtacak şekilde güncellenmiş.

### Güncellenmiş Puanlama

6 bulgu düzeltildi (1 KRİTİK + 2 YÜKSEK + 2 ORTA + 1 DÜŞÜK). Puanlar revize edildi:

| Kriter | Önceki | Yeni | Değişim Nedeni |
| --- | --- | --- | --- |
| Kriptografi | 8.5 | **9.3** | B1 (eklenti rastgelelik) + B3 (PBKDF2 600K) düzeltildi |
| Mimari | 8.0 | **8.7** | B2 (IPC constant-time + 0600) düzeltildi |
| Güvenlik duruşu | 8.5 | **9.2** | B1/B2/B3 etkisi + regresyon testleri |
| Kod kalitesi | 9.0 | **9.2** | B8 + yeni güvenlik testleri |
| Olgunluk | 6.0 | 6.0 | (üçüncü taraf denetim hâlâ yok) |
| Ekosistem | 7.0 | **7.5** | B4/B5 eklenti/senkronizasyon tutarlılığı |
| Dokümantasyon | 9.0 | **9.3** | Düzeltmeler docs'ta tutarlı belgelendi |
| Şeffaflık | 9.0 | 9.0 | (korundu) |

**Güncellenmiş Ağırlıklı Genel Puan: 8.5 / 10** (önceki 7.8)

> **Yorum:** KRITIK ve iki YUKSEK bulgunun duzeltilmesi, projeyi bir sifre yoneticisi olarak temel guvenlik standardina tasidi. Eklenti artik ana uygulamayla kriptografik olarak tutarli. Biyometrik sarma OWASP onerilen maliyet seviyesinde, IPC token dogrulamasi sabit-surelidir. B7 icin routine vault item storage master parola string bagimliligindan cikarildi; kalan en degerli ilerleme alanlari native unlock/credential adapter ve ucuncu taraf denetimdir.
