/* One-shot update of the legal pages' content keys (privacy-* / terms-*)
 * in the English and Turkish dictionaries, to match the expanded 8-section
 * policies shipped in privacy.html and terms.html.
 *
 *   node scripts/update-legal-content.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const I18N = path.join(root, 'assets', 'js', 'i18n');

const MAIL = '<a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>';

const content = {
  en: {
    'privacy-updated': 'Last updated: October 2026 · Available in 12 languages.',
    'privacy-h2-1': '1. Summary',
    'privacy-p1-1': 'This website collects no personal data about you: no cookies, no analytics, no advertising, no third-party tracking. The KalderaShield application never sees and never transmits your vault data — everything stays on your device. Below we explain everything in detail, including the short-lived technical records inherent to any hosting infrastructure and your rights.',
    'privacy-h2-2': '2. Your vault data: never collected',
    'privacy-p1-2': 'KalderaShield\'s zero-knowledge, offline-first design means the passwords, usernames, notes, passkeys and attachments stored in your vault are <strong>never collected, processed or shared under any circumstances</strong>. Your data is stored only on your device, encrypted with keys derived from your master password. We never hold a copy of your master password or the keys derived from it.',
    'privacy-h2-3': '3. This website: cookieless and tracking-free',
    'privacy-p1-3': 'This website uses <strong>no tracking cookies, no advertising cookies, no fingerprinting and no analytics scripts.</strong> Visitor behaviour is not measured; no third-party requests are made. The only data stored on the site is your interface language preference, kept in your browser\'s localStorage. This data never leaves your device.',
    'privacy-h2-4': '4. Hosting and server records',
    'privacy-p1-4': 'This site is served from infrastructure we administer ourselves. Like any web server, it may keep short-lived technical access records — request time, requested address and the connecting network address — to keep the service available and prevent abuse. These records are not used to build profiles, are not shared with third parties for advertising or analytics, and are automatically deleted after a short retention period.',
    'privacy-h2-5': '5. Third-party services',
    'privacy-p1-5': 'Application and extension packages are distributed via GitHub Releases; during a download, GitHub/Microsoft\'s own privacy practices apply and no data is transmitted to us. The <code>install.sh</code> script reads the version number and SHA-256 digests from GitHub Releases solely for integrity verification. When you contact us by email, your message passes through your email provider\'s systems; beyond delivering a reply, it is processed for no other purpose.',
    'privacy-h2-6': '6. Your rights',
    'privacy-p1-6': 'Personal data is processed only in limited cases — for example when you email us. In that case you have the right to learn about, access, correct, delete and object to the processing of your data under Article 11 of Turkey\'s KVKK (Law No. 6698) and, in the European Union, the GDPR. Send requests to ' + MAIL + '; they are answered within 30 days at the latest.',
    'privacy-h2-7': '7. Children\'s privacy',
    'privacy-p1-7': 'This site and application are not directed at children under 13, and no data is knowingly collected from them.',
    'privacy-h2-8': '8. Policy changes and contact',
    'privacy-p1-8': 'This policy is updated when the application or the hosting infrastructure changes; the update date is shown at the top of the page. The data controller is the KalderaShield project owner. Privacy questions: ' + MAIL,

    'terms-updated': 'Last updated: October 2026 · Available in 12 languages.',
    'terms-h2-1': '1. Acceptance and scope',
    'terms-p1-1': 'These terms govern your use of the KalderaShield software (desktop application, Android application and browser extension) and of this website. Anyone who downloads, installs or uses the software is deemed to have accepted these terms. The software is provided under the Apache License 2.0; where these terms and the licence conflict, the licence text prevails.',
    'terms-h2-2': '2. Licence',
    'terms-p1-2': 'KalderaShield is released as open source under the <strong>Apache License 2.0</strong>. You may use, study, modify and redistribute the software under the licence terms. The full licence text is available in the <a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE" rel="noopener noreferrer">GitHub repository</a>.',
    'terms-h2-3': '3. No warranty and limitation of liability',
    'terms-p1-3': 'The software is provided "AS IS", without warranty of any kind, express or implied — including warranties of merchantability, fitness for a particular purpose and non-infringement. To the maximum extent permitted by law, the KalderaShield owner is not liable for any damages arising from the use of, or inability to use, the software or this website — including direct, indirect, incidental, special or consequential damages.',
    'terms-h2-4': '4. Master password and data loss',
    'terms-p1-4': 'KalderaShield does not know your master password or recovery key. By zero-knowledge design, if those are lost there is <strong>no recovery mechanism that can restore access to your vault</strong>. Safely backing up your master password and 24-word recovery key, and keeping at least one encrypted backup, is your responsibility.',
    'terms-h2-5': '5. Downloads and verification',
    'terms-p1-5': 'Install packages are published on GitHub Releases. The SHA-256 digest and signatures of every published file are shared on the release page; verifying integrity before installing is recommended. The integrity of packages obtained from third-party sources cannot be guaranteed.',
    'terms-h2-6': '6. Third-party services',
    'terms-p1-6': 'Optional sync uploads only the encrypted payload to WebDAV/S3 storage that you configure and own; that storage\'s security and privacy practices are governed by your provider\'s terms. Downloads are hosted on GitHub Releases, where GitHub\'s own terms apply.',
    'terms-h2-7': '7. Acceptable use and trademark',
    'terms-p1-7': 'You may not use the software or this website for any unlawful purpose, and you may not use the KalderaShield name or logo in a way that could be confused with official releases without permission. The "KalderaShield" name and logo are the property of their owner.',
    'terms-h2-8': '8. Changes, governing law and contact',
    'terms-p1-8': 'These terms may be updated from time to time; the current version takes effect when published on this page. These terms are governed by the laws of Turkey. Questions: ' + MAIL,
  },
  tr: {
    'privacy-updated': 'Son güncelleme: Ekim 2026 · 12 dilde sunulur.',
    'privacy-h2-1': '1. Özet',
    'privacy-p1-1': 'Bu web sitesi sizin hakkınızda hiçbir kişisel veri toplamaz: çerez yok, analitik yok, reklam yok, üçüncü taraf izleme yok. KalderaShield uygulaması kasanızdaki verileri asla görmez ve asla iletmez; her şey cihazınızda kalır. Aşağıda her şeyi ayrıntılarıyla açıklıyoruz: barındırma altyapısının doğasında olan kısa süreli teknik kayıtlar ve haklarınız dâhil.',
    'privacy-h2-2': '2. Kasa veriniz: asla toplanmaz',
    'privacy-p1-2': 'KalderaShield, sıfır-bilgi ve çevrimdışı öncelikli tasarımı gereği kasanızda sakladığınız şifreleri, kullanıcı adlarını, notları, passkey\'leri ve ekleri <strong>hiçbir koşulda toplamaz, işlemez ve paylaşmaz</strong>. Verileriniz yalnızca cihazınızda, sizin ana parolanızdan türetilen anahtarlarla şifreli olarak saklanır. Ana parolanızın veya türetilen anahtarların bir kopyası bizde asla bulunmaz.',
    'privacy-h2-3': '3. Bu web sitesi: çerezsiz ve izlemesiz',
    'privacy-p1-3': 'Bu web sitesi <strong>izleme çerezi, reklam çerezi, parmak izi (fingerprinting) veya analitik betiği kullanmaz.</strong> Ziyaretçi davranışı ölçülmez; üçüncü taraf istekleri yapılmaz. Sitede depolanan tek veri, arayüz dil tercihinizin hatırlanması için tarayıcınızın yerel depolamasında (localStorage) tutulan dil kodudur. Bu veri cihazınızdan çıkmaz.',
    'privacy-h2-4': '4. Barındırma ve sunucu kayıtları',
    'privacy-p1-4': 'Bu site, kendi yönettiğimiz altyapıdan yayınlanır. Herhangi bir web sunucusu gibi, hizmetin kullanılabilirliğini sağlamak ve kötüye kullanımı önlemek için kısa süreli teknik erişim kayıtları tutulabilir: istek zamanı, talep edilen adres ve bağlantı kuran ağ adresi gibi. Bu kayıtlar profil oluşturmak için kullanılmaz, reklam veya analitik amacıyla üçüncü taraflarla paylaşılmaz ve kısa bir saklama süresinden sonra otomatik olarak silinir.',
    'privacy-h2-5': '5. Üçüncü taraf hizmetler',
    'privacy-p1-5': 'Uygulama ve eklenti paketleri GitHub Releases üzerinden dağıtılır; indirme sırasında GitHub/Microsoft\'un kendi gizlilik uygulamaları geçerlidir ve bu sırada bize hiçbir veri iletilmez. <code>install.sh</code> betiği, sürüm numarasını ve SHA-256 özetlerini yalnızca bütünlük doğrulaması için GitHub Releases\'ten okur. Bize e-posta ile ulaştığınızda iletişiminiz e-posta sağlayıcınızın sistemlerinden geçer; yanıt vermenin dışında hiçbir amaçla işlenmez.',
    'privacy-h2-6': '6. Haklarınız',
    'privacy-p1-6': 'Kişisel veriler yalnızca sınırlı durumlarda — örneğin bize e-posta gönderdiğinizde — işlenir. Bu durumda, Türkiye\'de 6698 sayılı KVKK m.11, Avrupa Birliği\'nde GDPR uyarınca verilerinizi öğrenme, erişme, düzeltme, silme ve işlemeye itiraz etme haklarına sahipsiniz. Taleplerinizi ' + MAIL + ' adresine iletebilirsiniz; en geç 30 gün içinde yanıtlanır.',
    'privacy-h2-7': '7. Çocukların gizliliği',
    'privacy-p1-7': 'Bu site ve uygulama 13 yaşın altındaki çocuklara yönelik değildir; bu yaştan küçük kullanıcılardan bilinçli olarak veri toplanmaz.',
    'privacy-h2-8': '8. Politika değişiklikleri ve iletişim',
    'privacy-p1-8': 'Bu politika, uygulama veya barındırma altyapısı değiştiğinde güncellenir; güncelleme tarihi sayfanın başında yer alır. Veri sorumlusu KalderaShield proje sahibidir. Gizlilik sorularınız için: ' + MAIL,

    'terms-updated': 'Son güncelleme: Ekim 2026 · 12 dilde sunulur.',
    'terms-h2-1': '1. Kabul ve kapsam',
    'terms-p1-1': 'Bu şartlar, KalderaShield yazılımının (masaüstü uygulaması, Android uygulaması ve tarayıcı eklentisi) ve bu web sitesinin kullanımınızı düzenler. Yazılımı indiren, kuran veya kullanan herkes bu şartları kabul etmiş sayılır. Yazılım Apache License 2.0 altında sağlanır; bu şartlarla lisans arasında çelişki olması hâlinde lisans metni geçerlidir.',
    'terms-h2-2': '2. Lisans',
    'terms-p1-2': 'KalderaShield, <strong>Apache License 2.0</strong> koşullarıyla kaynak kodu açık olarak yayımlanır. Yazılımı lisans koşullarına uygun şekilde kullanabilir, inceleyebilir, değiştirebilir ve dağıtabilirsiniz. Tam lisans metnine <a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE" rel="noopener noreferrer">GitHub deposundan</a> ulaşabilirsiniz.',
    'terms-h2-3': '3. Garanti yokluğu ve sorumluluğun sınırı',
    'terms-p1-3': 'Yazılım "OLDUĞU GİBİ" sağlanır; ticari elverişlilik, belirli bir amaca uygunluk ve ihlal etmeme taahhütleri dâhil, zımni hiçbir garanti içermez. Yasaların izin verdiği azami ölçüde, yazılımın veya web sitesinin kullanımından ya da kullanılamamasından doğan hiçbir zarardan — doğrudan, dolaylı, arızi, özel veya sonuçsal dâhil — KalderaShield\'ın sahibi sorumlu tutulamaz.',
    'terms-h2-4': '4. Ana parola ve veri kaybı',
    'terms-p1-4': 'KalderaShield ana parolanızı veya kurtarma anahtarınızı bilmez. Sıfır-bilgi tasarım gereği, bu bilgilerin kaybı hâlinde kasanıza erişimi geri getirebilecek <strong>bir kurtarma mekanizması mevcut değildir</strong>. Ana parolanızı ve 24 kelimelik kurtarma anahtarınızı güvenli şekilde yedeklemek ve en az bir şifreli yedek tutmak sizin sorumluluğunuzdadır.',
    'terms-h2-5': '5. İndirmeler ve doğrulama',
    'terms-p1-5': 'Kurulum paketleri GitHub Releases üzerinden sunulur. Yayınlanan her dosyanın SHA-256 özeti ve imzaları sürüm sayfasında paylaşılır; kurulum öncesi bütünlük doğrulaması yapmanız önerilir. Üçüncü taraf kaynaklardan indirilen paketlerin bütünlüğü garanti edilemez.',
    'terms-h2-6': '6. Üçüncü taraf hizmetler',
    'terms-p1-6': 'İsteğe bağlı eşitleme, yalnızca şifreli yükü sizin yapılandırıp sahiplendiğiniz WebDAV/S3 depolamasına gönderir; o depolamanın güvenlik ve gizlilik uygulamaları sağlayıcınızın şartlarına tabidir. İndirmeler GitHub Releases\'te barındırılır ve GitHub\'ın kendi şartları geçerlidir.',
    'terms-h2-7': '7. Kabul edilebilir kullanım ve marka',
    'terms-p1-7': 'Yazılımı ve web sitesini yasaya aykırı herhangi bir amaçla kullanamazsınız; "KalderaShield" adını ve logosunu, ürünün resmi sürümleriyle karıştırılabilecek biçimde izinsiz kullanamazsınız. "KalderaShield" adı ve logosu sahibinin mülkiyetindedir.',
    'terms-h2-8': '8. Değişiklikler, uygulanacak hukuk ve iletişim',
    'terms-p1-8': 'Bu şartlar zaman zaman güncellenebilir; güncel hâli bu sayfada yayımlandığı anda geçerli olur. Bu şartlar Türk hukukuna tabidir. Sorularınız için: ' + MAIL,
  },
};

for (const [locale, entries] of Object.entries(content)) {
  const file = path.join(I18N, locale + '.json');
  const dict = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [k, v] of Object.entries(entries)) dict[k] = v;
  fs.writeFileSync(file, JSON.stringify(dict, null, 2) + '\n', 'utf8');
  console.log(locale + '.json guncellendi (' + Object.keys(entries).length + ' anahtar)');
}
