/* Adds the "how it works" timeline copy to all twelve locales.
 *
 *   node scripts/add-how-i18n.cjs
 *
 * Written as a script rather than as hand edits because the set has to land in
 * twelve files identically: audit-i18n.cjs compares every locale against en.json
 * for key parity, writing-system contamination and leftover template syntax, and
 * a key added to one dictionary and forgotten in another fails the build with a
 * finding that names the file rather than the mistake.
 *
 * Constraints the values below respect, all enforced by that audit:
 *   - No markup. site.js decides innerHTML vs textContent on whether a value
 *     contains a tag, and audit-i18n.cjs compares the tag set against en.json, so
 *     a stray <strong> in one language would be a finding.
 *   - No braces and no SCREAMING_SNAKE tokens, which the audit reads as template
 *     leftovers left by an unsubstituted build.
 *   - No foreign script. Russian carries no Han, Arabic no Cyrillic, and so on.
 *     Product names, standards and API identifiers stay in Latin, which the
 *     audit allows everywhere.
 */
const fs = require('fs');
const path = require('path');

const I18N = path.resolve(__dirname, '..', 'assets', 'js', 'i18n');
const LANGS = ['tr', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar'];

const PACKS = {
  en: {
    'how-eyebrow': 'How it works',
    'how-title': 'Four steps from a master password to an encrypted vault',
    'how-desc': 'Nothing on this page contacts a server. Every step runs on the device you are reading it on.',
    'how-step1-title': 'You choose a master password',
    'how-step1-desc': 'It never leaves this device in any form, and there is no reset link, because there is no account to reset.',
    'how-step2-title': 'Argon2id derives the key',
    'how-step2-desc': 'The password is stretched into a key with Argon2id, then HKDF-SHA256 splits it into an isolated key for each record.',
    'how-step3-title': 'Every record is sealed with AES-256-GCM',
    'how-step3-desc': 'The vault file on disk holds ciphertext and its authentication tag. Reading one without the key fails rather than returning a wrong value.',
    'how-step4-title': 'You unlock it locally',
    'how-step4-desc': 'Biometrics, a security key or the 24-word recovery kit release the key again on this device. No network request is involved.',
    'how-cta': 'Read the threat model',
  },

  tr: {
    'how-eyebrow': 'Nasıl çalışır',
    'how-title': 'Ana paroladan şifreli kasaya dört adım',
    'how-desc': 'Buradaki hiçbir adım bir sunucuya bağlanmaz. Her adım, bu sayfayı okuduğunuz cihazda çalışır.',
    'how-step1-title': 'Ana parolanızı siz belirlersiniz',
    'how-step1-desc': 'Hiçbir biçimde bu cihazdan çıkmaz ve sıfırlama bağlantısı yoktur, çünkü sıfırlanacak bir hesap yoktur.',
    'how-step2-title': 'Argon2id anahtarı türetir',
    'how-step2-desc': 'Parola Argon2id ile anahtara esnetilir, ardından HKDF-SHA256 ile kayıt başına izole bir anahtara ayrılır.',
    'how-step3-title': 'Her kayıt AES-256-GCM ile mühürlenir',
    'how-step3-desc': 'Diskteki kasa dosyası yalnızca şifreli metni ve doğrulama etiketini içerir. Anahtarsız okuma yanlış değer döndürmek yerine başarısız olur.',
    'how-step4-title': 'Yerelde açarsınız',
    'how-step4-desc': 'Biyometri, güvenlik anahtarı veya 24 kelimelik kurtarma kiti anahtarı yine bu cihazda serbest bırakır. Hiçbir ağ isteği yoktur.',
    'how-cta': 'Tehdit modelini okuyun',
  },

  de: {
    'how-eyebrow': 'So funktioniert es',
    'how-title': 'In vier Schritten vom Master-Passwort zur verschlüsselten Tresor',
    'how-desc': 'Nichts auf dieser Seite kontaktiert einen Server. Jeder Schritt läuft auf dem Gerät, auf dem Sie das lesen.',
    'how-step1-title': 'Sie wählen ein Master-Passwort',
    'how-step1-desc': 'Es verlässt dieses Gerät in keiner Form, und es gibt keinen Zurücksetzen-Link, weil es kein Konto zum Zurücksetzen gibt.',
    'how-step2-title': 'Argon2id leitet den Schlüssel ab',
    'how-step2-desc': 'Das Passwort wird mit Argon2id zu einem Schlüssel gestreckt, dann mit HKDF-SHA256 in einen isolierten Schlüssel pro Datensatz getrennt.',
    'how-step3-title': 'Jeder Datensatz wird mit AES-256-GCM versiegelt',
    'how-step3-desc': 'Die Tresordatei auf der Festplatte enthält nur Chiffretext und sein Authentifizierungstag. Ein Lesen ohne Schlüssel schlägt fehl, statt einen falschen Wert zu liefern.',
    'how-step4-title': 'Sie entsperren ihn lokal',
    'how-step4-desc': 'Biometrie, ein Sicherheitsschlüssel oder das 24-Wörter-Wiederherstellungssetz gibt den Schlüssel erneut auf diesem Gerät frei. Es ist keine Netzwerkanfrage beteiligt.',
    'how-cta': 'Das Bedrohungsmodell lesen',
  },

  fr: {
    'how-eyebrow': 'Comment ça marche',
    'how-title': 'Quatre étapes entre le mot de passe principal et le coffre chiffré',
    'how-desc': "Rien sur cette page ne contacte un serveur. Chaque étape s'exécute sur l'appareil que vous consultez.",
    'how-step1-title': 'Vous choisissez un mot de passe principal',
    'how-step1-desc': "Il ne quitte jamais cet appareil, sous aucune forme, et il n'y a aucun lien de réinitialisation, puisqu'il n'y a aucun compte à réinitialiser.",
    'how-step2-title': 'Argon2id dérive la clé',
    'how-step2-desc': "Le mot de passe est étiré en clé avec Argon2id, puis HKDF-SHA256 le sépare en une clé isolée par enregistrement.",
    'how-step3-title': 'Chaque enregistrement est scellé avec AES-256-GCM',
    'how-step3-desc': "Le fichier du coffre sur le disque ne contient que du texte chiffré et son tag d'authentification. Une lecture sans la clé échoue au lieu de renvoyer une valeur fausse.",
    'how-step4-title': 'Vous le déverrouillez localement',
    'how-step4-desc': "La biométrie, une clé de sécurité ou le kit de récupération de 24 mots libèrent à nouveau la clé sur cet appareil. Aucune requête réseau n'intervient.",
    'how-cta': 'Lire le modèle de menace',
  },

  es: {
    'how-eyebrow': 'Cómo funciona',
    'how-title': 'Cuatro pasos de la contraseña maestra a la bóveda cifrada',
    'how-desc': 'Nada en esta página contacta con un servidor. Cada paso se ejecuta en el dispositivo desde el que la está leyendo.',
    'how-step1-title': 'Usted elige una contraseña maestra',
    'how-step1-desc': 'Nunca sale de este dispositivo de ninguna forma, y no hay enlace de restablecimiento, porque no hay ninguna cuenta que restablecer.',
    'how-step2-title': 'Argon2id deriva la clave',
    'how-step2-desc': 'La contraseña se estira hasta convertirse en clave con Argon2id y luego HKDF-SHA256 la separa en una clave aislada por registro.',
    'how-step3-title': 'Cada registro se sella con AES-256-GCM',
    'how-step3-desc': 'El archivo de la bóveda en disco solo contiene texto cifrado y su etiqueta de autenticación. Leerlo sin la clave falla en lugar de devolver un valor incorrecto.',
    'how-step4-title': 'Usted lo desbloquea localmente',
    'how-step4-desc': 'La biometría, una llave de seguridad o el kit de recuperación de 24 palabras liberan la clave de nuevo en este dispositivo. No interviene ninguna petición de red.',
    'how-cta': 'Leer el modelo de amenazas',
  },

  it: {
    'how-eyebrow': 'Come funziona',
    'how-title': 'Quattro passaggi dalla password principale alla cassaforte cifrata',
    'how-desc': 'Nulla in questa pagina contatta un server. Ogni passaggio viene eseguito sul dispositivo che sta leggendo.',
    'how-step1-title': 'Scegli la password principale',
    'how-step1-desc': 'Non lascia mai questo dispositivo in nessuna forma e non esiste un link di reimpostazione, perché non c’è alcun account da reimpostare.',
    'how-step2-title': 'Argon2id deriva la chiave',
    'how-step2-desc': 'La password viene allungata in una chiave con Argon2id, poi HKDF-SHA256 la separa in una chiave isolata per ogni record.',
    'how-step3-title': 'Ogni record è sigillato con AES-256-GCM',
    'how-step3-desc': 'Il file della cassaforte su disco contiene solo testo cifrato e il suo tag di autenticazione. Leggerlo senza la chiave fallisce invece di restituire un valore sbagliato.',
    'how-step4-title': 'Lo sblocchi in locale',
    'how-step4-desc': 'Biometria, una chiave di sicurezza o il kit di recupero da 24 parole liberano di nuovo la chiave su questo dispositivo. Non è coinvolta alcuna richiesta di rete.',
    'how-cta': 'Leggi il modello di minaccia',
  },

  pt: {
    'how-eyebrow': 'Como funciona',
    'how-title': 'Quatro passos da senha mestra para o cofre cifrado',
    'how-desc': 'Nada nesta página entra em contato com um servidor. Cada passo acontece no dispositivo em que você está lendo.',
    'how-step1-title': 'Você escolhe uma senha mestra',
    'how-step1-desc': 'Ela nunca sai deste dispositivo, de forma alguma, e não existe link de redefinição, porque não há conta a redefinir.',
    'how-step2-title': 'O Argon2id deriva a chave',
    'how-step2-desc': 'A senha é esticada em uma chave com o Argon2id e depois o HKDF-SHA256 a separa em uma chave isolada por registro.',
    'how-step3-title': 'Cada registro é selado com AES-256-GCM',
    'how-step3-desc': 'O arquivo do cofre em disco guarda apenas texto cifrado e sua tag de autenticação. Ler sem a chave falha em vez de devolver um valor errado.',
    'how-step4-title': 'Você o desbloqueia localmente',
    'how-step4-desc': 'Biometria, uma chave de segurança ou o kit de recuperação de 24 palavras liberam a chave novamente neste dispositivo. Nenhuma requisição de rede é envolvida.',
    'how-cta': 'Leia o modelo de ameaça',
  },

  ru: {
    'how-eyebrow': 'Как это работает',
    'how-title': 'Четыре шага от мастер-пароля к зашифрованному хранилищу',
    'how-desc': 'На этой странице нет ни одного обращения к серверу. Каждый шаг выполняется на том устройстве, с которого вы читаете.',
    'how-step1-title': 'Вы сами выбираете мастер-пароль',
    'how-step1-desc': 'Он ни в каком виде не покидает это устройство, и ссылки для сброса нет, потому что нет учётной записи, которую можно сбросить.',
    'how-step2-title': 'Argon2id получает ключ',
    'how-step2-desc': 'Пароль растягивается в ключ алгоритмом Argon2id, а затем HKDF-SHA256 разделяет его на отдельный ключ для каждой записи.',
    'how-step3-title': 'Каждая запись запечатывается алгоритмом AES-256-GCM',
    'how-step3-desc': 'Файл хранилища на диске содержит только шифротекст и его тег аутентификации. Чтение без ключа завершается ошибкой, а не возвращает неверное значение.',
    'how-step4-title': 'Вы открываете его локально',
    'how-step4-desc': 'Биометрия, ключ безопасности или набор восстановления из 24 слов снова освобождают ключ на этом устройстве. Никаких сетевых запросов не происходит.',
    'how-cta': 'Прочитать модель угроз',
  },

  ja: {
    'how-eyebrow': 'しくみ',
    'how-title': 'マスターパスワードから暗号化パスワード保管庫まで、4つのステップ',
    'how-desc': 'このページでサーバーに接続する処理はありません。すべてのステップは、いま読んでいる端末上で実行されます。',
    'how-step1-title': 'マスターパスワードを決める',
    'how-step1-desc': 'どのような形でも端末の外へ出ません。リセットするアカウントがないので、リセット用のリンクもありません。',
    'how-step2-title': 'Argon2id が鍵を導出する',
    'how-step2-desc': 'パスワードは Argon2id で鍵まで引き伸ばされ、続けて HKDF-SHA256 が記録ごとに独立した鍵へ分割します。',
    'how-step3-title': 'すべての記録を AES-256-GCM で封じる',
    'how-step3-desc': 'ディスク上の保管ファイルには暗号文と認証タグしか含まれません。鍵なしで読むと、誤った値を返すのではなく失敗します。',
    'how-step4-title': '端末うえで解除する',
    'how-step4-desc': '生体認証、セキュリティキー、24語のリカバリーキットが、この端末でふたたび鍵を解放します。ネットワーク通信は介在しません。',
    'how-cta': '脅威モデルを読む',
  },

  ko: {
    'how-eyebrow': '작동 방식',
    'how-title': '마스터 비밀번호에서 암호화된 보관함까지 네 단계',
    'how-desc': '이 페이지의 어떤 단계도 서버에 연결되지 않습니다. 모든 단계는 지금 읽고 있는 기기에서 실행됩니다.',
    'how-step1-title': '마스터 비밀번호를 직접 정합니다',
    'how-step1-desc': '어떤 형태으로도 이 기기 밖으로 나가지 않으며, 초기화할 계정이 없으므로 초기화 링크도 없습니다.',
    'how-step2-title': 'Argon2id가 키를 도출합니다',
    'how-step2-desc': '비밀번호는 Argon2id로 키까지 늘린 뒤 HKDF-SHA256이 레코드마다 고립된 키로 나누어 줍니다.',
    'how-step3-title': '모든 레코드는 AES-256-GCM으로 봉인됩니다',
    'how-step3-desc': '디스크의 보관함 파일에는 암호문과 인증 태그만 들어 있습니다. 키 없이 읽으면 잘못된 값을 돌려주는 대신 실패합니다.',
    'how-step4-title': '기기에서 직접 잠금을 해제합니다',
    'how-step4-desc': '생체 인식, 보안 키, 24단어 복구 키트가 이 기기에서 다시 키를 풀어 줍니다. 네트워크 요청은 개입하지 않습니다.',
    'how-cta': '위협 모델 읽기',
  },

  zh: {
    'how-eyebrow': '工作原理',
    'how-title': '从主密码到加密密码库的四步',
    'how-desc': '本页面的任何步骤都不会连接服务器。每一步都在你正在阅读的这台设备上运行。',
    'how-step1-title': '由你设置主密码',
    'how-step1-desc': '它不会以任何形式离开这台设备，也没有重置链接，因为根本没有可重置的账户。',
    'how-step2-title': 'Argon2id 派生密钥',
    'how-step2-desc': '密码先由 Argon2id 拉伸成密钥，再由 HKDF-SHA256 拆分为每条记录各自独立的密钥。',
    'how-step3-title': '每条记录都用 AES-256-GCM 封装',
    'how-step3-desc': '磁盘上的密码库文件只保存密文及其认证标签。没有密钥的读取会直接失败，而不是返回错误的结果。',
    'how-step4-title': '在本机解锁',
    'how-step4-desc': '生物识别、安全密钥或 24 词恢复套件都会在这台设备上再次释放密钥，全程不涉及任何网络请求。',
    'how-cta': '阅读威胁模型',
  },

  ar: {
    'how-eyebrow': 'كيف يعمل',
    'how-title': 'أربع خطوات من كلمة المرور الرئيسية إلى الخزنة المشفّرة',
    'how-desc': 'لا يتصل أي جزء من هذه الصفحة بخادم. كل خطوة تعمل على الجهاز الذي تقرأ منه الآن.',
    'how-step1-title': 'أنت تختار كلمة المرور الرئيسية',
    'how-step1-desc': 'لا تغادر هذا الجهاز بأي شكل من الأشكال، ولا يوجد رابط لإعادة التعيين، لأنه لا يوجد حساب لإعادته.',
    'how-step2-title': 'الخوارزمية Argon2id تشتق المفتاح',
    'how-step2-desc': 'تمتد كلمة المرور إلى مفتاح بواسطة Argon2id، ثم تفصلها HKDF-SHA256 إلى مفتاح معزول لكل سجل.',
    'how-step3-title': 'كل سجل يُختم بتشفير AES-256-GCM',
    'how-step3-desc': 'يحتوي ملف الخزنة على القرص على النص المشفّر ووسم المصادقة الخاص به فقط. القراءة من دون المفتاح تفشل بدل أن تُرجع قيمة خاطئة.',
    'how-step4-title': 'تفتح القفل محليًا',
    'how-step4-desc': 'تحرّك القياسات الحيوية أو مفتاح الأمان أو مجموعة الاسترداد ذات 24 كلمة تحرّر المفتاح مجددًا على هذا الجهاز. لا يشارك أي طلب شبكي في ذلك.',
    'how-cta': 'اقرأ نموذج التهديد',
  },
};

// Defensive: a typo in a key above would otherwise write twelve files with
// twelve different silent typos, which the audit would then report as a
// missing key rather than as the mistake.
const expectedKeys = Object.keys(PACKS.en);
for (const [lang, pack] of Object.entries(PACKS)) {
  const keys = Object.keys(pack);
  if (keys.length !== expectedKeys.length || keys.some((k, i) => k !== expectedKeys[i])) {
    throw new Error(`${lang}.json pack does not match en.json's key set`);
  }
}

let written = 0;
for (const lang of LANGS) {
  const file = path.join(I18N, lang + '.json');
  const dict = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(PACKS[lang])) {
    if (dict[key] !== undefined) {
      throw new Error(`${lang}.json already defines ${key}; refusing to overwrite a key in use`);
    }
    dict[key] = value;
  }
  fs.writeFileSync(file, JSON.stringify(dict, null, 2) + '\n', 'utf8');
  console.log(`${lang}.json: +${Object.keys(PACKS[lang]).length} anahtar`);
  written++;
}
console.log(`${written} dil guncellendi (${expectedKeys.length} anahtar).`);