/* Syncs the copy that the 2026 rework deliberately reworded.
 *
 * A key that already existed kept its stored translation, so the page rendered
 * the previous wording instead of the new one. These entries are intentional
 * rewrites rather than drift, so they are overwritten here.
 */
const fs = require('fs');
const path = require('path');

const I18N = path.resolve(__dirname, '..', 'assets', 'js', 'i18n');

const EN = {
  'hero-title': 'Your data never leaves <span class="gradient-text">your own device</span>.',
  'hero-desc': 'KalderaShield is an offline-first, zero-knowledge password manager. There is no account, no server and no third party: your vault is encrypted and decrypted on the hardware you already own.',
  'hero-btn-git': 'View source on GitHub',
  'hero-tagline-3': 'Your hardware.',
  'feat-title': 'Security you can audit, not just trust',
  'feat-desc': 'Every claim below is visible in the running product, and the code behind it is public.',
  'sec-title': 'How the encryption actually works',
  'sec-desc': 'Vault data is encrypted on your device. Protection depends on your master password strength, the KDF parameters recorded in your vault, the security of the device and how you use the application. No cryptographic design promises absolute protection against every attack.',
  'comp-title': 'Where KalderaShield differs',
  'comp-th-criteria': 'Criterion',
  'comp-th-cloud': 'Cloud managers',
  'comp-th-offline': 'Offline tools',
  'comp-notyet': 'Not yet',
  'faq-title': 'Questions worth answering plainly',
  'footer-brand-desc': 'A local-first, zero-knowledge password manager built with AES-256-GCM and Argon2id.',
  'faq-q5': 'Do I need an account?',
  'faq-a5': 'No. There is no sign-up, no email address and no server-side account. You choose a master password and a secret key on your own device, and the vault is created there.',
  'faq-q6': 'Can I move my passwords from another manager?',
  'faq-a6': 'Yes. The universal importer accepts Bitwarden, LastPass, 1Password, Chrome CSV and JSON exports, and the whole import is processed on your device.',
};

const TR = {
  'hero-title': 'Verileriniz asla <span class="gradient-text">kendi cihazınızdan</span> çıkmaz.',
  'hero-desc': 'KalderaShield çevrimdışı öncelikli, sıfır-bilgi şifre yöneticisidir. Hesap yok, sunucu yok, üçüncü taraf yok: kasanız, hâlihazırda sahip olduğunuz donanımda şifrelenir ve çözülür.',
  'hero-btn-git': 'Kaynağı GitHub’da görün',
  'hero-tagline-3': 'Kendi donanımınız.',
  'feat-title': 'Güvenmekle kalmayın, denetleyin',
  'feat-desc': 'Aşağıdaki her iddia çalışan üründe görünür ve arkasındaki kod herkese açıktır.',
  'sec-title': 'Şifreleme aslında nasıl çalışıyor',
  'sec-desc': 'Kasa verileri cihazınızda şifrelenir. Koruma; ana parolanızın gücüne, kasanızda kayıtlı KDF parametrelerine, cihazın güvenliğine ve uygulamayı nasıl kullandığınıza bağlıdır. Hiçbir kriptografik tasarım her saldırı senaryosuna karşı mutlak koruma vaat etmez.',
  'comp-title': 'KalderaShield nerede farklı',
  'comp-th-criteria': 'Ölçüt',
  'comp-th-cloud': 'Bulut yöneticileri',
  'comp-th-offline': 'Çevrimdışı araçlar',
  'comp-notyet': 'Henüz değil',
  'faq-title': 'Dürüstçe yanıtlanması gereken sorular',
  'footer-brand-desc': 'AES-256-GCM ve Argon2id ile güçlendirilmiş, yerel öncelikli ve sıfır-bilgi şifre yöneticisi.',
  'faq-q5': 'Hesap açmam gerekiyor mu?',
  'faq-a5': 'Hayır. Kayıt yok, e-posta adresi yok, sunucu tarafında hesap yok. Kendi cihazınızda bir ana parola ve bir secret key belirler, kasa orada oluşturulur.',
  'faq-q6': 'Şifrelerimi başka bir yöneticiden taşıyabilir miyim?',
  'faq-a6': 'Evet. Evrensel içe aktarım; Bitwarden, LastPass, 1Password, Chrome CSV ve JSON dışa aktarımlarını kabul eder ve içe aktarımın tamamı cihazınızda işlenir.',
};

for (const [lang, pack] of [['en', EN], ['tr', TR]]) {
  const file = path.join(I18N, lang + '.json');
  const dict = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(pack)) dict[key] = value;
  fs.writeFileSync(file, JSON.stringify(dict, null, 2) + '\n', 'utf8');
  console.log(`${lang}.json guncellendi (${Object.keys(pack).length} anahtar)`);
}
