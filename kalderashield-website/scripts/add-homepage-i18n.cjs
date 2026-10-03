/* Adds the homepage-copy keys introduced by the 2026 site rework.
 *
 * Run once. The script merges rather than overwrites: existing entries in
 * en.json / tr.json (legal pages, the download hub) are left untouched, and a
 * key that is already present is reported instead of being replaced.
 *
 *   node scripts/add-homepage-i18n.cjs
 */
const fs = require('fs');
const path = require('path');

const I18N = path.resolve(__dirname, '..', 'assets', 'js', 'i18n');

const EN = {
  'nav-products': 'Product',
  'trust-license': 'License',
  'trust-i18n': 'Languages',
  'trust-typescript': 'TypeScript',
  'trust-tests': 'Tests',
  'trust-coverage': 'Line coverage',
  'trust-audit': 'Third-party audit',
  'trust-audit-val': 'Not yet completed',

  'prod-eyebrow': 'The product',
  'prod-title': 'One vault, six jobs',
  'prod-lead': 'Everything below runs on your own device. None of it depends on a company continuing to operate a server.',
  'prod-1-title': 'Password vault',
  'prod-1-desc': 'Logins, payment cards, identities, secure keys and notes. Every record is encrypted on its own key, so one cracked record never exposes the rest.',
  'prod-2-title': 'Autofill',
  'prod-2-desc': 'The browser extension matches sites by eTLD+1 using the full Mozilla Public Suffix List, so a shared host never gets the wrong credential.',
  'prod-3-title': 'Passkeys and 2FA',
  'prod-3-desc': 'Store WebAuthn passkeys and TOTP secrets. Built-in codes generate locally and are stored encrypted, never shown to a server.',
  'prod-4-title': 'History and trash',
  'prod-4-desc': 'Password history per item, versioned encrypted snapshots, and a trash that holds deleted records for 15 days before anything is destroyed.',
  'prod-5-title': 'Import and backup',
  'prod-5-desc': 'Bring over a Bitwarden, LastPass, 1Password, Chrome or generic CSV/JSON export, and export an encrypted backup you can restore anywhere.',
  'prod-6-title': 'Optional sync',
  'prod-6-desc': 'Off by default. If you want multi-device access you can point it at your own WebDAV or S3 storage — the server only ever receives ciphertext.',
  'prod-note': 'Each area above gets its own page in the next phase of this site.',

  'feat-a-tag': 'Security audit',
  'feat-a-title': 'Find weak, reused and breached passwords',
  'feat-a-desc': 'The audit scores your whole vault and separates the problems: too-short passwords, passwords shared between accounts, passwords that appear in a known breach dataset, accounts with no second factor, links still using plain HTTP, and records untouched for over a year.',
  'feat-b-tag': 'Passkeys and portability',
  'feat-b-title': 'Passkeys, imports and an air-gap you can inspect',
  'feat-b-desc': 'Create WebAuthn passkeys bound to your platform authenticator, import from other managers, and export an Argon2id plus AES-GCM protected backup. The blocked-network panel shows every outbound request the air-gap policy refused.',
  'feat-c-tag': 'Unlock',
  'feat-c-title': 'Unlock with biometrics or a hardware key — and still recover',
  'feat-c-desc': 'Windows Hello, Touch ID, Face ID, Android biometrics or a FIDO2 key such as YubiKey can stand in for the master password. Hardware binding only removes friction: vault access always derives from master password plus secret key via Argon2id, and a 24-word recovery key is available if you forget both.',
  'feat-d-tag': 'Backups',
  'feat-d-title': 'Versioned backups and travel-back-in-time',
  'feat-d-desc': 'Automatic snapshots are encrypted before they are written and pruned at a retention limit you choose. Optional sync encrypts on-device with AES-256-GCM before anything leaves it, so the storage provider never holds the decryption key.',
  'feat-e-tag': 'Generator',
  'feat-e-title': 'Character passwords or Diceware phrases',
  'feat-e-desc': 'Generate random-character passwords with the character classes you choose, or roll a memorable Diceware phrase. Strength is measured locally as the password is produced.',
  'feat-f-tag': 'Trash',
  'feat-f-title': 'Deletion is recoverable for 15 days',
  'feat-f-desc': 'Deleting an entry moves it to an encrypted local trash instead of destroying it. Restore it or delete it permanently, any time within the retention window.',

  'sec-1-title': 'Key derivation',
  'sec-1-desc': 'New desktop and Android vaults use 64 MiB of memory, 4 iterations and 2 lanes; web builds use 32 MiB, 3 iterations and 1 lane. The parameters are stored with the vault, so an existing vault keeps the strength it was created with.',
  'sec-2-title': 'Per-item key isolation',
  'sec-2-desc': 'Every record gets its own 256-bit key, derived through WebCrypto HKDF-SHA256 with the item id as salt. Breaking one record does not reveal any other record in the vault.',
  'sec-3-title': 'Masked database columns',
  'sec-3-desc': 'Sensitive columns in the local SQLite database hold a static placeholder token instead of plaintext. Titles, usernames, passwords and notes exist only inside the AES-256-GCM payload.',
  'sec-4-title': 'Hardware-bound convenience unlock',
  'sec-4-desc': 'Biometric and security-key unlock wraps the vault key using PBKDF2-SHA256 and AES-GCM inside a non-exportable keystore: TPM 2.0 via Windows Hello, Secure Enclave on macOS, AndroidKeyStore on Android. Losing the authenticator costs convenience, not access.',
  'sec-threat-btn': 'Read the threat model',

  'ver-eyebrow': 'Verification',
  'ver-title': 'Check what you install',
  'ver-lead': 'Trust is easier when you can verify. Every release publishes the artifacts you need to confirm you are running the exact build the project published.',
  'ver-1-title': 'SHA-256 digests',
  'ver-1-desc': 'Every release asset is published with a SHA-256 checksum so you can confirm the bytes you downloaded match the ones that were published.',
  'ver-2-title': 'Signed builds',
  'ver-2-desc': 'Desktop packages are signed and the auto-updater verifies the signature before applying anything it downloads.',
  'ver-3-title': 'Release gates',
  'ver-3-desc': 'Desktop and Android releases pass an 18-step automated gate before a build is published, covering types, tests and packaging.',
  'ver-4-title': 'OpenSSF Scorecard',
  'ver-4-desc': 'The repository publishes OpenSSF Best Practices and Scorecard badges alongside CodeQL and CI results, so supply-chain signals are visible without asking.',
  'ver-5-title': 'Public advisories',
  'ver-5-desc': 'Vulnerabilities can be reported privately through GitHub security advisories; the policy and contact live in security.txt.',
  'ver-6-title': 'Honest audit status',
  'ver-6-desc': 'No independent third-party audit has been completed yet. The scope document is preparation material, not an audit result, and this page does not claim otherwise.',

  'comp-row-server': 'Requires a server',
  'comp-no': 'No',
  'comp-yes': 'Yes',
  'comp-row-account': 'Requires an account',
  'comp-row-where': 'Where your data lives',
  'comp-own-device': 'Your device',
  'comp-their-server': "The vendor's server",
  'comp-row-offline': 'Works with no network',
  'comp-full': 'Fully',
  'comp-row-source': 'Open source',
  'comp-varies': 'Varies',
  'comp-row-price': 'Cost',
  'comp-free': 'Free, Apache-2.0',
  'comp-subscription': 'Subscription',
  'comp-row-audit': 'Completed third-party audit',
  'comp-row-vendor': 'If the vendor disappears',
  'comp-keeps': 'Your vault keeps working',
  'comp-loses': 'Access depends on the vendor',

  'cta-dl': 'Download KalderaShield',
  'cta-src': 'Read the source',

  'hero-shot-alt': 'The KalderaShield vault showing folders, saved items and a payment card with a security assessment.',
  'feat-a-alt': 'Security Audit screen showing a score, weak and reused password counts, pwned password checks and insecure HTTP links.',
  'feat-b-alt': 'Passkey management, blocked network requests, encrypted backup export and universal import panels.',
  'feat-c-alt': 'Auto-lock duration, device lock and FIDO2 security key options, recovery key and password hint settings.',
  'feat-d-alt': 'Versioned encrypted backups with automatic snapshots, storage migration and end-to-end encrypted sync settings.',
  'feat-e-alt': 'Password generator with character based and Diceware word based modes.',
  'feat-f-alt': 'Trash bin showing deleted records are kept for 15 days before permanent cleanup.',
};

const TR = {
  'nav-products': 'Ürün',
  'trust-license': 'Lisans',
  'trust-i18n': 'Diller',
  'trust-typescript': 'TypeScript',
  'trust-tests': 'Test',
  'trust-coverage': 'Satır kapsamı',
  'trust-audit': 'Bağımsız denetim',
  'trust-audit-val': 'Henüz tamamlanmadı',

  'prod-eyebrow': 'Ürün',
  'prod-title': 'Tek kasa, altı görev',
  'prod-lead': 'Aşağıdakilerin tamamı kendi cihazınızda çalışır. Hiçbiri, bir şirketin sunucuyu çalıştırmaya devam etmesine bağlı değildir.',
  'prod-1-title': 'Şifre kasası',
  'prod-1-desc': 'Girişler, ödeme kartları, kimlikler, güvenli anahtarlar ve notlar. Her kayıt kendi anahtarıyla şifrelenir; bir kaydın ele geçirilmesi diğerlerini açığa çıkarmaz.',
  'prod-2-title': 'Otomatik doldurma',
  'prod-2-desc': 'Tarayıcı eklentisi, tam Mozilla Public Suffix List ile eTLD+1 eşleştirme yapar; böylece ortak bir barındırma alanına yanlış kimlik bilgisi gitmez.',
  'prod-3-title': 'Passkey ve 2FA',
  'prod-3-desc': 'WebAuthn passkey’lerini ve TOTP sırlarını saklayın. Üretilen kodlar yerelde oluşturulur ve şifrelenmiş saklanır, hiçbir sunucuya gösterilmez.',
  'prod-4-title': 'Geçmiş ve çöp',
  'prod-4-desc': 'Kayıt bazında şifre geçmişi, sürümlenmiş şifreli anlık görüntüler ve silinen kayıtları 15 gün boyunca tutan bir çöp kutusu.',
  'prod-5-title': 'İthalat ve yedek',
  'prod-5-desc': 'Bitwarden, LastPass, 1Password, Chrome veya genel CSV/JSON dışa aktarımını taşıyın; şifreli yedeği herhangi bir yerde geri yükleyin.',
  'prod-6-title': 'İsteğe bağlı senkronizasyon',
  'prod-6-desc': 'Varsayılan olarak kapalı. Birden çok cihaz için kendi WebDAV veya S3 depolamanızı kullanabilirsiniz; sunucu yalnızca şifreli veri görür.',
  'prod-note': 'Yukarıdaki alanların her biri, sitenin sonraki aşamasında kendi sayfasını alacak.',

  'feat-a-tag': 'Güvenlik denetimi',
  'feat-a-title': 'Zayıf, tekrarlanan ve ele geçirilmiş şifreleri bulun',
  'feat-a-desc': 'Denetim tüm kasayı puanlar ve sorunları ayırır: çok kısa şifreler, hesaplar arasında paylaşılan şifreler, bilinen bir ihlal veri setinde görünen şifreler, ikinci faktörü olmayan hesaplar, hâlâ düz HTTP kullanan bağlantılar ve bir yıldan uzun süredir dokunulmamış kayıtlar.',
  'feat-b-tag': 'Passkey ve taşınabilirlik',
  'feat-b-title': 'Passkey, ithalat ve denetlenebilir air-gap',
  'feat-b-desc': 'Platform doğrulayıcınıza bağlı WebAuthn passkey oluşturun, başka yöneticilerden içe aktarın, Argon2id ve AES-GCM korumalı şifreli yedek çıkarın. Engellenen ağ paneli, air-gap politikasının reddettiği her giden isteği gösterir.',
  'feat-c-tag': 'Kilit açma',
  'feat-c-title': 'Biyometri veya donanım anahtarıyla açın — yine de kurtarın',
  'feat-c-desc': 'Windows Hello, Touch ID, Face ID, Android biyometrisi veya YubiKey gibi FIDO2 bir anahtar ana parolanın yerini alabilir. Donanım bağlama yalnızca sürtünmeyi azaltır: kasa erişimi her zaman Argon2id ile ana parola ve secret key’den türetilir; ikisini de unutursanız 24 kelimelik kurtarma anahtarı devrede.',
  'feat-d-tag': 'Yedekler',
  'feat-d-title': 'Sürümlü yedekler ve zamanda geri gitme',
  'feat-d-desc': 'Otomatik anlık görüntüler yazılmadan önce şifrelenir ve seçtiğiniz saklama sınırında otomatik olarak temizlenir. İsteğe bağlı senkronizasyonda veriler cihazdan AES-256-GCM ile şifrelenerek çıkar; depolama sağlayıcısı hiçbir zaman çözme anahtarını tutmaz.',
  'feat-e-tag': 'Üretici',
  'feat-e-title': 'Karakterli şifreler veya Diceware cümleleri',
  'feat-e-desc': 'Seçtiğiniz karakter sınıflarıyla rastgele karakter şifreleri üretin ya da akılda kalıcı bir Diceware cümlesi çevirin. Güç, üretildiği anda yerelde ölçülür.',
  'feat-f-tag': 'Çöp kutusu',
  'feat-f-title': 'Silme 15 gün boyunca geri alınabilir',
  'feat-f-desc': 'Bir kaydı silmek onu yok etmek yerine şifreli yerel çöp kutusuna taşır. Saklama süresi içinde geri yükleyin veya kalıcı olarak silin.',

  'sec-1-title': 'Anahtar türetme',
  'sec-1-desc': 'Yeni masaüstü ve Android kasaları 64 MiB bellek, 4 yineleme ve 2 şerit kullanır; web sürümleri 32 MiB, 3 yineleme ve 1 şerit kullanır. Parametreler kasa ile birlikte saklanır, böylece mevcut kasa oluşturulduğu gücü korur.',
  'sec-2-title': 'Kayıt başına anahtar izolasyonu',
  'sec-2-desc': 'Her kayıt, salt olarak itemId kullanılarak WebCrypto HKDF-SHA256 ile türetilen kendi 256-bit anahtarını alır. Bir kaydı kırmak kasadaki başka hiçbir kaydı ele geçirmez.',
  'sec-3-title': 'Maskelenmiş veritabanı sütunları',
  'sec-3-desc': 'Yerel SQLite veritabanındaki hassas sütunlar düz metin yerine sabit bir yer tutucu jeton tutar. Başlıklar, kullanıcı adları, şifreler ve notlar yalnızca AES-256-GCM yükünün içinde bulunur.',
  'sec-4-title': 'Donanıma bağlı kolaylık kilidi',
  'sec-4-desc': 'Biyometrik ve güvenlik anahtarı kilidi, kasa anahtarını dışa aktarılamayan bir anahtar deposunda PBKDF2-SHA256 ve AES-GCM ile sarar: Windows Hello üzerinden TPM 2.0, macOS’ta Secure Enclave, Android’de AndroidKeyStore. Doğrulayıcıyı kaybetmek erişimi değil, kolaylığı kaybettirir.',
  'sec-threat-btn': 'Tehdit modelini okuyun',

  'ver-eyebrow': 'Doğrulama',
  'ver-title': 'Kurduğunuzu denetleyin',
  'ver-lead': 'Güven, doğrulayabildiğinizde daha kolaydır. Her sürüm, yayımlanan derlemenin tam olarak aynısını çalıştırdığınızı teyit etmeniz için gereken dosyaları yayımlar.',
  'ver-1-title': 'SHA-256 özetleri',
  'ver-1-desc': 'Her sürüm varlığı, indirdiğiniz baytların yayımlananlarla aynı olduğunu doğrulamanız için SHA-256 sağlamasıyla birlikte yayımlanır.',
  'ver-2-title': 'İmzalı derlemeler',
  'ver-2-desc': 'Masaüstü paketleri imzalanır ve otomatik güncelleyici, indirdiği her şeyi uygulamadan önce imzayı doğrular.',
  'ver-3-title': 'Sürüm kapıları',
  'ver-3-desc': 'Masaüstü ve Android sürümleri, tipleri, testleri ve paketlemeyi kapsayan 18 adımlık otomatik kapıdan geçmeden yayımlanmaz.',
  'ver-4-title': 'OpenSSF Scorecard',
  'ver-4-desc': 'Depo, CodeQL ve CI sonuçlarının yanında OpenSSF Best Practices ve Scorecard rozetlerini yayımlar; tedarik zinciri sinyalleri sormadan görülebilir.',
  'ver-5-title': 'Herkese açık bildirimler',
  'ver-5-desc': 'Güvenlik açıkları GitHub güvenlik danışmanlıkları üzerinden özel olarak bildirilebilir; politika ve iletişim adresi security.txt dosyasındadır.',
  'ver-6-title': 'Dürüst denetim durumu',
  'ver-6-desc': 'Henüz bağımsız bir üçüncü taraf denetimi tamamlanmadı. Kapsam belgesi hazırlık materyalidir, denetim sonucu değildir; bu sayfa aksi iddia etmez.',

  'comp-row-server': 'Sunucu gereksinimi',
  'comp-no': 'Yok',
  'comp-yes': 'Var',
  'comp-row-account': 'Hesap zorunluluğu',
  'comp-row-where': 'Verinizin bulunduğu yer',
  'comp-own-device': 'Kendi cihazınız',
  'comp-their-server': 'Satıcının sunucusu',
  'comp-row-offline': 'Ağ olmadan çalışma',
  'comp-full': 'Tam',
  'comp-row-source': 'Açık kaynak',
  'comp-varies': 'Değişir',
  'comp-row-price': 'Maliyet',
  'comp-free': 'Ücretsiz, Apache-2.0',
  'comp-subscription': 'Abonelik',
  'comp-row-audit': 'Tamamlanmış bağımsız denetim',
  'comp-row-vendor': 'Satıcı kaybolursa',
  'comp-keeps': 'Kasanız çalışmaya devam eder',
  'comp-loses': 'Erişim satıcıya bağlıdır',

  'cta-dl': 'KalderaShield’i indirin',
  'cta-src': 'Kaynağı okuyun',

  'hero-shot-alt': 'KalderaShield kasası: klasörler, kayıtlı öğeler ve güvenlik değerlendirmesi gösterilen bir ödeme kartı.',
  'feat-a-alt': 'Güvenlik Denetimi ekranı: puan, zayıf ve tekrarlanan şifre sayıları, ele geçirilmiş şifre kontrolleri ve güvensiz HTTP bağlantıları.',
  'feat-b-alt': 'Passkey yönetimi, engellenen ağ istekleri, şifreli yedek dışa aktarımı ve evrensel ithalat panelleri.',
  'feat-c-alt': 'Otomatik kilit süresi, cihaz kilidi ve FIDO2 güvenlik anahtarı seçenekleri, kurtarma anahtarı ve şifre ipucu ayarları.',
  'feat-d-alt': 'Otomatik anlık görüntüler, depolama taşıma ve uçtan uca şifreli senkronizasyon ayarlarıyla sürümlü şifreli yedekler.',
  'feat-e-alt': 'Karakter tabanlı ve Diceware sözcük tabanlı modları olan şifre üretici.',
  'feat-f-alt': 'Çöp kutusu: silinen kayıtların kalıcı temizlikten önce 15 gün tutulduğunu gösterir.',
};

let added = 0;
let skipped = 0;

for (const [lang, pack] of [['en', EN], ['tr', TR]]) {
  const file = path.join(I18N, lang + '.json');
  const dict = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(pack)) {
    if (Object.prototype.hasOwnProperty.call(dict, key)) {
      console.warn(`  ATLANDI (zaten var): ${lang}.${key}`);
      skipped++;
      continue;
    }
    dict[key] = value;
    added++;
  }
  fs.writeFileSync(file, JSON.stringify(dict, null, 2) + '\n', 'utf8');
  console.log(`${lang}.json -> ${Object.keys(dict).length} anahtar`);
}

console.log(`\neklendi: ${added} · atlandi: ${skipped}`);
