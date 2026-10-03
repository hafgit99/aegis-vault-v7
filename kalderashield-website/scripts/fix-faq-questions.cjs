/* Restores the two FAQ entries that already existed in every dictionary and
 * adds the two genuinely new questions as q7/q8.
 *
 * The rework had mapped its own questions onto faq-q5 / faq-q6, which the
 * dictionaries already used for "open source" and "supported platforms". Those
 * are better questions than the ones they replaced, so they were put back.
 */
const fs = require('fs');
const path = require('path');

const I18N = path.resolve(__dirname, '..', 'assets', 'js', 'i18n');

const PACK = {
  tr: {
    'faq-q5': 'KalderaShield açık kaynak mı?',
    'faq-a5': 'Evet. Tüm istemci Apache-2.0 lisansıyla herkese açık bir GitHub deposunda yayımlanır; masaüstü, Android ve tarayıcı eklentisi derlemeleri de aynı kaynaktan üretilir.',
    'faq-q6': 'Hangi platformlar destekleniyor?',
    'faq-a6': 'Windows, Linux ve macOS masaüstü sürümleri, Android ve Chrome, Edge, Firefox ile Safari için tarayıcı eklentileri.',
    'faq-q7': 'Hesap açmam gerekiyor mu?',
    'faq-a7': 'Hayır. Kayıt yok, e-posta adresi yok, sunucu tarafında hesap yok. Kendi cihazınızda bir ana parola ve bir secret key belirler, kasa orada oluşturulur.',
    'faq-q8': 'Şifrelerimi başka bir yöneticiden taşıyabilir miyim?',
    'faq-a8': 'Evet. Evrensel içe aktarım; Bitwarden, LastPass, 1Password, Chrome CSV ve JSON dışa aktarımlarını kabul eder ve içe aktarımın tamamı cihazınızda işlenir.',
  },
  en: {
    'faq-q5': 'Is KalderaShield open source?',
    'faq-a5': 'Yes. The entire client is published under the Apache-2.0 licence in a public GitHub repository, and the desktop, Android and browser extension builds are produced from that same source.',
    'faq-q6': 'Which platforms are supported?',
    'faq-a6': 'Windows, Linux and macOS desktop builds, Android, and browser extensions for Chrome, Edge, Firefox and Safari.',
    'faq-q7': 'Do I need an account?',
    'faq-a7': 'No. There is no sign-up, no email address and no server-side account. You choose a master password and a secret key on your own device, and the vault is created there.',
    'faq-q8': 'Can I move my passwords from another manager?',
    'faq-a8': 'Yes. The universal importer accepts Bitwarden, LastPass, 1Password, Chrome CSV and JSON exports, and the whole import is processed on your device.',
  },
  de: {
    'faq-q7': 'Brauche ich ein Konto?',
    'faq-a7': 'Nein. Es gibt keine Registrierung, keine E-Mail-Adresse und kein Konto auf der Serverseite. Sie legen Masterpasswort und Secret Key auf Ihrem eigenen Gerät fest, und der Tresor wird dort erstellt.',
    'faq-q8': 'Kann ich meine Passwörter von einem anderen Manager übernehmen?',
    'faq-a8': 'Ja. Der Universalimport akzeptiert Exporte von Bitwarden, LastPass, 1Password sowie Chrome-CSV und JSON, und der gesamte Import wird auf Ihrem Gerät verarbeitet.',
  },
  fr: {
    'faq-q7': 'Dois-je créer un compte ?',
    'faq-a7': 'Non. Aucune inscription, aucune adresse e-mail, aucun compte côté serveur. Vous choisissez un mot de passe principal et une clé secrète sur votre propre appareil, et le coffre y est créé.',
    'faq-q8': 'Puis-je importer mes mots de passe depuis un autre gestionnaire ?',
    'faq-a8': "Oui. L'import universel accepte les exports Bitwarden, LastPass, 1Password ainsi que CSV et JSON de Chrome, et l'ensemble du traitement s'effectue sur votre appareil.",
  },
  es: {
    'trust-typescript': 'TypeScript',
    'faq-q7': '¿Necesito una cuenta?',
    'faq-a7': 'No. Sin registro, sin dirección de correo y sin cuenta en el servidor. Tú eliges una contraseña maestra y una clave secreta en tu propio dispositivo, y la bóveda se crea ahí.',
    'faq-q8': '¿Puedo migrar mis contraseñas desde otro gestor?',
    'faq-a8': 'Sí. El importador universal acepta exportaciones de Bitwarden, LastPass, 1Password y CSV/JSON de Chrome, y toda la importación se procesa en tu dispositivo.',
  },
};

for (const [locale, pack] of Object.entries(PACK)) {
  const file = path.join(I18N, locale + '.json');
  const dict = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(pack)) dict[key] = value;
  fs.writeFileSync(file, JSON.stringify(dict, null, 2) + '\n', 'utf8');
  console.log(`${locale}.json -> ${Object.keys(pack).length} anahtar guncellendi (toplam ${Object.keys(dict).length})`);
}
