# Aegis Vault 7 — Bağımsız Dış Güvenlik Denetimi Kapsam ve Hazırlık Dokümanı

**Doküman Sürümü:** 2.0.0 · **Tarih:** Eylül 2026 · **Hedef Sürüm:** Aegis Vault 7.0.4+

---

## 1. Giriş ve Amaç

Aegis Vault 7, yerel-öncelikli (local-first) ve sıfır-bilgi (zero-knowledge) mimarisine sahip modern bir parola yöneticisidir. Bu doküman, bağımsız üçüncü taraf siber güvenlik ve kod denetim firmalarına (örneğin Cure53, Trail of Bits, NCC Group, Doyensec, OSTIF bağlantılı denetçiler vb.) sunulmak üzere hazırlanmış resmi denetim kapsam kılavuzudur.

**Kapsamdaki dağıtım kanalları:** Windows/macOS/Linux masaüstü uygulamaları (Tauri), Android uygulaması (Tauri) ve Chromium/Firefox/Safari tarayıcı eklentisi — tümü tek bir yeniden üretilebilir CI release hattından üretilir; Sigstore (cosign) keyless imzaları, Tauri minisign updater imzaları ve sürüm başına CycloneDX SBOM'ları ile birlikte.

---

## 2. Denetim Kapsamı ve Mimari Katmanlar

### Katman 1: Kriptografik Çekirdek (`src/lib/`)
* **Anahtar Türetme (KDF):**
  * `argon2id.ts`: RFC 9106 uyumlu parametreler (32-64 MiB RAM, 3-4 iterasyon). WASM bellek yönetimi ve degradasyon koruması.
  * `secretKey.ts`: 160-bit A3 formatlı iki faktörlü hesap anahtarı türetimi ve normalizasyonu.
* **Şifreleme İlkemleri:**
  * `webcrypto.ts`: AES-256-GCM (12-byte CSPRNG IV, 128-bit kimlik doğrulama etiketi), HKDF-SHA256 öğe-başı anahtar izolasyonu (`derivePerItemKey`), non-extractable CryptoKey önbellekleme ve LFU tahliye stratejisi.
  * `random.ts`: CSPRNG entropisi (`crypto.getRandomValues`) + rejection sampling; `Math.random` kullanımı lint gate'i ile yasaklanmıştır.
  * `wasmZeroizer.ts` & `vaultSession.ts`: Bellek sıfırlama disiplini, oturum kapatıldığında CryptoKey önbelleğinin temizlenmesi, lazy-unmount.
* **Güvenli Paylaşım:**
  * `share.ts`: Parola-türetimli HKDF-SHA256 + AES-256-GCM anahtar mimarisi. URL fragmentinde anahtar taşımama garantisi.
* **Veritabanı ve Bütünlük:**
  * `vaultDatabaseFormat.ts` & `sqliteOpfsPersistence.ts`: Monoton sürüm sayacı (`versionCounter`), kanonik durum HMAC-SHA256 bütünlük doğrulaması (`computeStateIntegrityHmac`), satır silme ve geri yükleme (rollback) koruması.

### Katman 2: Rust / Tauri Masaüstü ve IPC Köprüsü (`src-tauri/`)
* **Native Messaging & IPC:**
  * `src-tauri/src/native_messaging.rs`: 256-bit CSPRNG pairing token, constant-time token doğrulaması, kısıtlı ACL izinleri (Windows CreateFile/icacls fail-closed, Unix 0o600), dinamik loopback TCP bağlama, tam Public Suffix List eTLD+1 etki alanı eşleme (çok parçalı ccTLD ve wildcard kuralları dahil), 5 dakikalık aktif kira penceresi (`EXTENSION_CREDENTIAL_LEASE_MS`).
* **Sistem Güvenliği:**
  * `src-tauri/src/lib.rs`: Ekran yakalama engeli (`WDA_EXCLUDEFROMCAPTURE`), korumalı pano yazımı, minisign imzalı `tauri-plugin-updater` güncelleme doğrulaması.

### Katman 3: Tarayıcı Eklentisi (`src-extension/`)
* **İzolasyon ve Yetki Modeli:**
  * Manifest V3 en az yetki ilkesi (`host_permissions` yok, harici betik yok).
  * Kapalı Shadow DOM form doldurma arayüzü.
  * `psl-utils.ts`: Tam Public Suffix List phishing tespiti (10k+ kural, çok parçalı ccTLD ve hosting etki alanı kapsamı, wildcard/exception işleme).
  * `background.ts`: Mandatory domain-matching kapısı, origin-bound transient taslak bellek, şema doğrulaması.
  * `content.ts`: Form-bound refill sızıntı koruması, güvenli IDN/punycode muafiyet mantığı.

### Katman 4: Android / Mobil Güvenlik (`gen/android/` & `src/lib/android*`)
* **Android KeyStore Entegrasyonu:**
  * AndroidKeyStore AES-256-GCM wrapping, `unlockedDeviceRequired(true)`, `FLAG_SECURE` pencere koruması, FileProvider kapsam sınırlandırması.

### Katman 5: Tedarik Zinciri ve Release Bütünlüğü (v7.0.3+ itibarıyla yeni)
* Tüm GitHub Actions SHA-pinned; job başına en az yetkili `GITHUB_TOKEN` kapsamı.
* Release hattı: build gate'leri (typecheck, unit test, sıkılaştırma kontrolleri) → Tauri updater paketleri → `latest.json` manifesti → her artifact için **cosign Sigstore keyless imzaları** (OIDC-bağlı) → global `SHA256SUMS.txt` → GitHub Release.
* Sürüm başına **CycloneDX SBOM**: npm (CycloneDX 1.6) + Cargo (CycloneDX 1.5), imzalanıp release asset'i olarak yayımlanır.
* Bağımlılık disiplini: %100 Dependabot kapsamı (19/19 güncelleme PR'ı merge edildi), CodeQL SAST temiz, Scorecard otomatik kontrolleri.

---

## 3. Tehdit Modeli ve Güvenlik Sınırları

| Tehdit | Beklenen Savunma Mekanizması |
|---|---|
| **Kayıp/Çalınan Veritabanı (Offline Saldırı)** | 32-64 MiB Argon2id + 160-bit Secret Key birleşimi (kullanıcı parolası zayıf olsa bile kırılması hesaplama açısından imkansız). |
| **Zararlı Web Sayfası / Phishing** | Eklenti tarafında tam-PSL eTLD+1 eşleşmesi, zorunlu domain-mismatch kullanıcı onayı, Shadow DOM izolasyonu, textContent-only rendering. |
| **Aynı Cihazdaki Kötü Amaçlı Süreç (Local IPC)** | Sıkılaştırılmış 0o600 / Windows kısıtlı ACL token dosyası, fail-closed denetimi, tek seferlik dinamik port eşleme. |
| **Tedarik Zinciri / Zararlı Güncelleme** | Minisign imzalı güncelleme paketleri (Tauri), cosign Sigstore keyless imzalı release artifact'leri, SRI asset manifesti, SHA-pinned CI. |
| **Zararlı Bağımlılık** | SBOM + yalnızca-lockfile build'ler + npm/cargo audit gate'leri + Dependabot; Sigstore Rekor transparency log'u ile kurcalamaya-duyarsız (tamper-evident) release'ler. |
| **Bellek Dökümü (Memory Dump)** | Zeroize/ZeroizeOnDrop trait'leri, WASM zeroizer arena, kilitte React component unmount. |

---

## 4. Önerilen Denetim Metodolojisi

1. **Beyaz Kutu (White-box) Kaynak Kod İncelemesi:** Kriptografik anahtar türetme, IV yönetimi, bellek temizleme ve IPC el sıkışma mantığı.
2. **Statik ve Dinamik Analiz:** Eklenti mesajlaşma akışlarının fuzzer ile test edilmesi, WebAuthn PRF ve Android KeyStore köprülerinin doğrulanması.
3. **Penetrasyon Testi (Local IPC & Extension Bridge):** Tarayıcı context script'lerinden yetki yükseltme veya native host manipülasyon denemeleri.
4. **Build/Yeniden Üretilebilirlik İncelemesi (tedarik zinciri):** CI workflow denetimi, SBOM eksiksizliği, uçtan uca imza doğrulama zinciri.

---

## 5. Raporlama ve Şeffaflık Taahhüdü

Denetim tamamlandığında:
- Bulgular önem derecesine göre, şeffaf ilerleme takibiyle remediate edilecektir.
- Yönetici özeti ve teknik bulgular kamuya açık olarak depoda ve resmi web sitesinde yayımlanacaktır.
