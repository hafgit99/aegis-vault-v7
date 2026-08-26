# Aegis Vault 7 — Bağımsız Dış Güvenlik Denetimi Kapsam ve Hazırlık Dokümanı

**Doküman Sürümü:** 1.0.0 · **Tarih:** Ağustos 2026 · **Hedef Sürüm:** Aegis Vault 7.x

---

## 1. Giriş ve Amaç

Aegis Vault 7, yerel-öncelikli (local-first) ve sıfır-bilgi (zero-knowledge) mimarisine sahip modern bir parola yöneticisidir. Bu doküman, bağımsız üçüncü taraf siber güvenlik ve kod denetim firmalarına (örneğin Cure53, Trail of Bits, NCC Group, Doyensec vb.) sunulmak üzere hazırlanmış resmi denetim kapsam kılavuzudur.

---

## 2. Denetim Kapsamı ve Mimari Katmanlar

### Katman 1: Kriptografik Çekirdek (`src/lib/`)
* **Anahtar Türetme (KDF):**
  * `argon2id.ts`: RFC 9106 uyumlu parametreler (32-64 MiB RAM, 3-4 iterasyon). WASM bellek yönetimi ve degradasyon koruması.
  * `secretKey.ts`: 160-bit A3 formatlı iki faktörlü hesap anahtarı türetimi ve normalizasyonu.
* **Şifreleme İlkemleri:**
  * `webcrypto.ts`: AES-256-GCM (12-byte CSPRNG IV, 128-bit kimlik doğrulama etiketi), HKDF-SHA256 öğe-başı anahtar izolasyonu (`derivePerItemKey`), non-extractable CryptoKey önbellekleme ve LFU tahliye stratejisi.
  * `random.ts`: CSPRNG entropisi (`crypto.getRandomValues`) + rejection sampling, Math.random kullanım yasağı.
  * `wasmZeroizer.ts` & `vaultSession.ts`: Bellek sıfırlama disiplini, oturum kapatıldığında CryptoKey önbelleğinin temizlenmesi, lazy-unmount.
* **Güvenli Paylaşım:**
  * `share.ts`: Parola-türetimli HKDF-SHA256 + AES-256-GCM anahtar mimarisi. URL fragmentinde anahtar taşımama garantisi.
* **Veritabanı ve Bütünlük:**
  * `vaultDatabaseFormat.ts` & `sqliteOpfsPersistence.ts`: Monoton sürüm sayacı (`versionCounter`), kanonik durum HMAC-SHA256 bütünlük doğrulaması (`computeStateIntegrityHmac`), satır silme ve geri yükleme (rollback) koruması.

### Katman 2: Rust / Tauri Masaüstü ve IPC Köprüsü (`src-tauri/`)
* **Native Messaging & IPC:**
  * `src-tauri/src/native_messaging.rs`: 256-bit CSPRNG pairing token, constant-time token doğrulaması, kısıtlı ACL izinleri (Windows CreateFile/icacls fail-closed, Unix 0o600), dinamik loopback TCP bağlama, eTLD+1 Public Suffix List etki alanı eşleme, 5 dakikalık aktif kira penceresi (`EXTENSION_CREDENTIAL_LEASE_MS`).
* **Sistem Güvenliği:**
  * `src-tauri/src/lib.rs`: Ekran yakalama engeli (`WDA_EXCLUDEFROMCAPTURE`), korumalı pano yazımı, minisign imzalı `tauri-plugin-updater` güncelleme doğrulaması.

### Katman 3: Tarayıcı Eklentisi (`src-extension/`)
* **İzolasyon ve Yetki Modeli:**
  * Manifest V3 en az yetki ilkesi (`host_permissions` yok, harici betik yok).
  * Kapalı Shadow DOM form doldurma arayüzü.
  * `psl-utils.ts`: Çok parçalı ccTLD ve hosting etki alanlarını içeren genişletilmiş Public Suffix List phishing tespiti.
  * `background.ts`: Mandatory domain-matching kapısı, origin-bound transient taslak bellek, şema doğrulaması.
  * `content.ts`: Form-bound refill sızıntı koruması, güvenli IDN/punycode muafiyet mantığı.

### Katman 4: Android / Mobil Güvenlik (`gen/android/` & `src/lib/android*`)
* **Android KeyStore Entegrasyonu:**
  * AndroidKeyStore AES-256-GCM wrapping, `unlockedDeviceRequired(true)`, `FLAG_SECURE` pencere koruması, FileProvider kapsam sınırlandırması.

---

## 3. Tehdit Modeli ve Güvenlik Sınırları

| Tehdit | Beklenen Savunma Mekanizması |
|---|---|
| **Kayıp/Çalınan Veritabanı (Offline Saldırı)** | 32-64 MiB Argon2id + 160-bit Secret Key birleşimi (kullanıcı parolası zayıf olsa bile kırılması hesaplama açısından imkansız). |
| **Zararlı Web Sayfası / Phishing** | Eklenti tarafında eTLD+1 eşleşmesi, zorunlu domain-mismatch kullanıcı onayı, Shadow DOM izolasyonu, textContent-only rendering. |
| **Aynı Cihazdaki Kötü Amaçlı Süreç (Local IPC)** | Sıkılaştırılmış 0o600 / Windows kısıtlı ACL token dosyası, fail-closed denetimi, tek seferlik dinamik port eşleme. |
| **Tedarik Zinciri / Zararlı Güncelleme** | Minisign şifreli imzalı güncelleme paketleri, Tauri updater bütünlük doğrulaması, SRI manifesti. |
| **Bellek Dökümü (Memory Dump)** | Zeroize/ZeroizeOnDrop trait'leri, WASM zeroizer arena, kilitte React component unmount. |

---

## 4. Önerilen Denetim Metodolojisi

1. **Beyaz Kutu (White-box) Kaynak Kod İncelemesi:** Kriptografik anahtar türetme, IV yönetimi, bellek temizleme ve IPC el sıkışma mantığı.
2. **Statik ve Dinamik Analiz:** Eklenti mesajlaşma akışlarının fuzzer ile test edilmesi, WebAuthn PRF ve Android KeyStore köprülerinin doğrulanması.
3. **Penetrasyon Testi (Local IPC & Extension Bridge):** Tarayıcı context script'lerinden yetki yükseltme veya native host manipülasyon denemeleri.

---

## 5. Raporlama ve Şeffaflık Taahhüdü

Denetim tamamlandığında:
- Bulgular önem sırasına göre remediate edilecektir.
- Yönetici özeti ve teknik bulgular kamuya açık olarak depoda ve resmi web sitesinde yayımlanacaktır.
