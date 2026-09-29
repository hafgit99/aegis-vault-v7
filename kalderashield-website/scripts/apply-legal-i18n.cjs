// One-off: adds the legal-page body keys to all twelve locales and corrects the
// "presented in Turkish and English" claim, which stopped being true.
//
//   node scripts/apply-legal-i18n.cjs
//
// Kept in the tree on purpose. The legal body is the one place where a
// half-applied change is invisible: the pages still render, the key-parity
// check still passes for the keys that made it, and the only symptom is that
// some languages fall back to the Turkish markup. Re-running this is how a new
// key gets all twelve, and the audit gates the result.

const fs = require('fs');
const path = require('path');

const I18N_DIR = path.resolve(__dirname, '..', 'assets', 'js', 'i18n');

// Markup must survive translation: applyText switches to innerHTML when the
// value contains a tag, so a dropped <strong> silently loses emphasis rather
// than breaking the page. Each language keeps the same tags as English.
const TRANSLATIONS = {
  'privacy-h2-1': {
    en: '1. Your vault data: never collected',
    tr: '1. Kasa Veriniz: Asla Toplanmaz',
    de: '1. Ihre Tresordaten: werden niemals erhoben',
    fr: '1. Données de votre coffre : jamais collectées',
    es: '1. Datos de tu bóveda: nunca se recopilan',
    it: '1. I dati della tua cassaforte: non vengono mai raccolti',
    pt: '1. Os dados do seu cofre: nunca são coletados',
    ar: '١. بيانات خزنتك: لا تُجمع أبدًا',
    ja: '1. 保管庫のデータ: 一切収集されません',
    ko: '1. 보관함 데이터: 수집되지 않습니다',
    ru: '1. Данные хранилища: никогда не собираются',
    zh: '1. 保管库数据：绝不收集',
  },
  'privacy-p1-1': {
    en: "KalderaShield's zero-knowledge, offline-first design means the passwords, usernames, notes, passkeys and attachments stored in your vault are <strong>never collected, processed or shared</strong>. They stay on your device, encrypted with keys derived from your master password. We never hold a copy of your master password or any derived key.",
    tr: 'KalderaShield, sıfır-bilgi ve çevrimdışı öncelikli tasarımı gereği kasanızda sakladığınız şifreleri, kullanıcı adlarını, notları, passkey\'leri ve ekleri <strong>hiçbir koşulda toplamaz, işlemez ve paylaşmaz</strong>. Verileriniz yalnızca cihazınızda, sizin ana parolanızdan türetilen anahtarlarla şifreli olarak saklanır. Ana parolanızın veya türetilen anahtarların bir kopyası bizde asla bulunmaz.',
    de: 'Das Zero-Knowledge- und Offline-first-Design von KalderaShield bedeutet, dass die in Ihrer Tresor gespeicherten Passwörter, Benutzernamen, Notizen, Passkeys und Anhänge <strong>niemals erhoben, verarbeitet oder geteilt werden</strong>. Sie verbleiben auf Ihrem Gerät und sind mit Schlüsseln verschlüsselt, die aus Ihrem Master-Passwort abgeleitet werden. Wir besitzen niemals eine Kopie Ihres Master-Passworts oder eines abgeleiteten Schlüssels.',
    fr: "La conception à connaissance nulle et hors ligne de KalderaShield signifie que les mots de passe, identifiants, notes, clés d'accès et pièces jointes stockés dans votre coffre sont <strong>jamais collectés, traités ni partagés</strong>. Ils restent sur votre appareil, chiffrés par des clés dérivées de votre mot de passe principal. Nous ne détenons jamais de copie de votre mot de passe principal ni d'aucune clé dérivée.",
    es: 'El diseño de conocimiento cero y sin conexión de KalderaShield implica que las contraseñas, usuarios, notas, claves de acceso y archivos de tu bóveda <strong>nunca se recopilan, procesan ni comparten</strong>. Permanecen en tu dispositivo, cifrados con claves derivadas de tu contraseña maestra. Nunca conservamos una copia de tu contraseña maestra ni de ninguna clave derivada.',
    it: 'La progettazione a conoscenza zero e offline-first di KalderaShield implica che le password, i nomi utente, le note, le passkey e gli allegati archiviati nella tua cassaforte <strong>non vengono mai raccolti, elaborati o condivisi</strong>. Restano sul tuo dispositivo, cifrati con chiavi derivate dalla tua password principale. Non conserviamo mai una copia della tua password principale né di alcuna chiave derivata.',
    pt: 'O design de conhecimento zero e offline-first do KalderaShield significa que as senhas, nomes de usuário, notas, chaves de acesso e anexos guardados no seu cofre <strong>nunca são coletados, processados ou compartilhados</strong>. Eles permanecem no seu dispositivo, criptografados com chaves derivadas da sua senha mestra. Nunca guardamos uma cópia da sua senha mestra nem de qualquer chave derivada.',
    ar: 'يعني التصميم القائم على المعرفة الصفرية والعمل دون اتصال في KalderaShield أن كلمات المرور وأسماء المستخدم والملاحظات ومفاتيح المرور والمرفقات المخزَّنة في خزنتك <strong>لا تُجمع ولا تُعالَج ولا تُشارَك مطلقًا</strong>. فهي تبقى على جهازك، مشفَّرة بمفاتيح مشتقّة من كلمة المرور الرئيسية. ولا نحتفظ أبدًا بنسخة من كلمة المرور الرئيسية أو من أي مفتاح مشتق.',
    ja: 'KalderaShield のゼロ知識・オフラインファースト設計により、保管庫に保存されたパスワード、ユーザー名、メモ、パスキー、添付ファイルは<strong>一切収集・処理・共有されません</strong>。データはデバイス上にのみ保持され、マスターパスワードから導出された鍵で暗号化されます。当社があなたのマスターパスワードや導出鍵のコピーを保存することは決してありません。',
    ko: 'KalderaShield의 제로 지식·오프라인 우선 설계에 따라 보관함에 저장된 비밀번호, 사용자 이름, 메모, 패스키, 첨부 파일은 <strong>수집, 처리 또는 공유되지 않습니다</strong>. 데이터는 기기 안에만 보관되며 마스터 비밀번호에서 파생된 키로 암호화됩니다. 당사는 마스터 비밀번호나 파생 키의 사본을 보유하지 않습니다.',
    ru: 'Проектирование KalderaShield на основе принципов «нулевого знания» и работы без сети означает, что пароли, имена пользователей, заметки, ключи доступа и вложения, хранящиеся в вашем хранилище, <strong>никогда не собираются, не обрабатываются и не передаются</strong>. Они остаются на вашем устройстве и зашифрованы ключами, полученными из вашего мастер-пароля. Мы никогда не храним копию вашего мастер-пароля или какого-либо производного ключа.',
    zh: 'KalderaShield 采用零知识、离线优先的设计，因此保管库中保存的密码、用户名、备注、通行密钥和附件<strong>绝不会被收集、处理或共享</strong>。数据仅保存在你的设备上，并使用由主密码派生的密钥加密。我们绝不保存你的主密码或任何派生密钥的副本。',
  },
  'privacy-h2-2': {
    en: '2. This website: cookieless and tracking-free',
    tr: '2. Web Sitesi: Çerezsiz ve İzlemesiz',
    de: '2. Diese Website: cookiefrei und ohne Tracking',
    fr: '2. Ce site web : sans cookies ni pistage',
    es: '2. Este sitio web: sin cookies ni seguimiento',
    it: '2. Questo sito web: senza cookie né tracciamento',
    pt: '2. Este site: sem cookies e sem rastreamento',
    ar: '٢. هذا الموقع: بلا ملفات تعريف ارتباط وبلا تتبع',
    ja: '2. このウェブサイト: Cookie なし・追跡なし',
    ko: '2. 이 웹사이트: 쿠키 없음, 추적 없음',
    ru: '2. Этот сайт: без cookie и слежки',
    zh: '2.本网站：无 Cookie、无跟踪',
  },
  'privacy-p1-2': {
    en: 'This site uses <strong>no tracking cookies, no advertising cookies, no fingerprinting and no analytics scripts</strong>. Visitor behaviour is not measured and no third-party requests are made. The only data stored is your interface language preference, kept in your browser\'s local storage — it never leaves your device.',
    tr: 'Bu web sitesi <strong>izleme çerezi, reklam çerezi, parmak izi (fingerprinting) veya analitik betiği kullanmaz.</strong> Ziyaretçi davranışı ölçülmez; üçüncü taraf istekleri yapılmaz. Sitede depolanan tek veri, arayüz dil tercihinizin hatırlanması için tarayıcınızın yerel depolamasında (localStorage) tutulan dil kodudur. Bu veri cihazınızdan çıkmaz.',
    de: 'Diese Website verwendet <strong>keine Tracking-Cookies, keine Werbe-Cookies, kein Fingerprinting und keine Analyse-Skripte</strong>. Besucherverhalten wird nicht gemessen, und es werden keine Anfragen an Drittanbieter gestellt. Die einzige gespeicherte Angabe ist Ihre bevorzugte Oberflächensprache, die im lokalen Speicher Ihres Browsers liegt — sie verlässt Ihr Gerät nie.',
    fr: 'Ce site n\'utilise <strong>aucun cookie de pistage, aucun cookie publicitaire, aucun pistage par empreinte et aucun script d\'analyse</strong>. Le comportement des visiteurs n\'est pas mesuré et aucune requête vers des tiers n\'est effectuée. La seule donnée enregistrée est votre langue d\'interface, conservée dans le stockage local de votre navigateur — elle ne quitte jamais votre appareil.',
    es: 'Este sitio web <strong>no utiliza cookies de seguimiento, cookies publicitarios, técnicas de huella digital ni scripts de analítica</strong>. No se mide el comportamiento de los visitantes ni se realizan solicitudes a terceros. El único dato almacenado es tu preferencia de idioma de interfaz, guardada en el almacenamiento local de tu navegador: nunca sale de tu dispositivo.',
    it: 'Questo sito web <strong>non utilizza cookie di tracciamento, cookie pubblicitari, fingerprinting né script di analisi</strong>. Il comportamento dei visitatori non viene misurato e non vengono effettuate richieste a terze parti. L\'unico dato memorizzato è la lingua dell\'interfaccia, conservata nella memoria locale del browser e che non lascia mai il tuo dispositivo.',
    pt: 'Este site <strong>não utiliza cookies de rastreamento, cookies publicitários, impressão digital nem scripts de análise</strong>. O comportamento dos visitantes não é medido e nenhuma requisição a terceiros é feita. O único dado armazenado é a sua preferência de idioma da interface, guardada no armazenamento local do navegador — nunca sai do seu dispositivo.',
    ar: 'لا يستخدم هذا الموقع <strong>ملفات تعريف ارتباط للتتبع، ولا ملفات إعلانية، ولا بصمة جهاز، ولا نصوص تحليلية</strong>. لا يتم قياس سلوك الزوار، ولا تُرسل أي طلبات إلى أطراف ثالثة. البيانات الوحيدة المخزَّنة هي تفضيلك للغة الواجهة، ويُحفظ في التخزين المحلي لمتصفحك ولا يغادر جهازك أبدًا.',
    ja: 'このサイトは<strong>追跡用 Cookie、広告用 Cookie、指紋収集、分析スクリプトのいずれも使用しません</strong>。訪問者の行動は計測されず、第三者へのリクエストも行われません。保存されるデータは表示言語の設定のみです。これはブラウザのローカルストレージに保持され、端末の外には出ません。',
    ko: '이 사이트는 <strong>추적 쿠키, 광고 쿠키, 지문 인식, 분석 스크립트를 전혀 사용하지 않습니다</strong>. 방문자 행동을 측정하지 않으며 제3자 요청도 보내지 않습니다. 저장되는 유일한 데이터는 인터페이스 언어 설정으로, 브라우저의 로컬 저장소에 보관되어 기기를 벗어나지 않습니다.',
    ru: 'Сайт <strong>не использует отслеживающие и рекламные cookie, снятие цифрового отпечатка и аналитические скрипты</strong>. Поведение посетителей не измеряется, запросов к третьим лицам не выполняется. Единственные сохранённые данные — предпочитаемый язык интерфейса, который хранится в локальном хранилище браузера и никогда не покидает ваше устройство.',
    zh: '本网站<strong>不使用任何跟踪 Cookie、广告 Cookie、指纹识别或分析脚本</strong>。不衡量访客行为，也不向第三方发起请求。唯一保存的数据是界面语言偏好，存放在你浏览器的本地存储中，绝不会离开你的设备。',
  },
  'privacy-h2-3': {
    en: '3. Downloads and GitHub',
    tr: '3. İndirmeler ve GitHub',
    de: '3. Downloads und GitHub',
    fr: '3. Téléchargements et GitHub',
    es: '3. Descargas y GitHub',
    it: '3. Download e GitHub',
    pt: '3. Downloads e GitHub',
    ar: '٣. التنزيلات وGitHub',
    ja: '3. ダウンロードと GitHub',
    ko: '3. 다운로드 및 GitHub',
    ru: '3. Загрузки и GitHub',
    zh: '3. 下载与 GitHub',
  },
  'privacy-p1-3': {
    en: 'Application and extension packages are distributed via GitHub Releases. GitHub/Microsoft\'s own privacy practices apply to those downloads; no data is transmitted to us in the process. The <code>install.sh</code> script reads the release version and SHA-256 digests from GitHub Releases solely for integrity verification.',
    tr: 'Uygulama ve eklenti paketleri GitHub Releases üzerinden dağıtılır. İndirme sırasında GitHub/Microsoft\'un kendi gizlilik uygulamaları geçerlidir; bu sırada bize hiçbir veri iletilmez. <code>install.sh</code> betiği, sürüm numarasını ve SHA-256 özetlerini yalnızca bütünlük doğrulaması için GitHub Releases\'ten okur.',
    de: 'Anwendungs- und Erweiterungspakete werden über GitHub Releases verteilt. Für diese Downloads gelten die eigenen Datenschutzrichtlinien von GitHub/Microsoft; dabei werden keine Daten an uns übermittelt. Das Skript <code>install.sh</code> liest die Versionsnummer und die SHA-256-Prüfsummen ausschließlich zur Integritätsprüfung aus den GitHub Releases.',
    fr: 'Les paquets applicatifs et les extensions sont distribués via GitHub Releases. Les pratiques de confidentialité propres à GitHub/Microsoft s\'appliquent à ces téléchargements ; aucune donnée ne nous est transmise. Le script <code>install.sh</code> lit la version et les sommes SHA-256 depuis GitHub Releases uniquement pour vérifier l\'intégrité.',
    es: 'Los paquetes de la aplicación y de las extensiones se distribuyen a través de GitHub Releases. A esas descargas se aplican las prácticas de privacidad propias de GitHub/Microsoft; durante el proceso no se transmite ningún dato a nosotros. El script <code>install.sh</code> lee la versión y los resúmenes SHA-256 de GitHub Releases únicamente para verificar la integridad.',
    it: 'I pacchetti dell\'applicazione e delle estensioni sono distribuiti tramite GitHub Releases. A quei download si applicano le pratiche di privacy di GitHub/Microsoft; durante il processo non viene trasmesso alcun dato a noi. Lo script <code>install.sh</code> legge la versione e le somme SHA-256 da GitHub Releases soltanto per verificare l\'integrità.',
    pt: 'Os pacotes do aplicativo e das extensões são distribuídos pelo GitHub Releases. As práticas de privacidade do próprio GitHub/Microsoft aplicam-se a esses downloads; durante o processo nenhum dado é transmitido a nós. O script <code>install.sh</code> lê a versão e os resumos SHA-256 do GitHub Releases somente para verificação de integridade.',
    ar: 'تُوزَّع حزم التطبيق والإضافات عبر GitHub Releases. تنطبق ممارسات الخصوصية الخاصة بـ GitHub/Microsoft على تلك التنزيلات، ولا تُنقل أي بيانات إلينا أثناء ذلك. يقرأ السكربت <code>install.sh</code> رقم الإصدار وبصمات SHA-256 من GitHub Releases لأغراض التحقق من السلامة فقط.',
    ja: 'アプリケーションと拡張機能のパッケージは GitHub Releases 経由で配布されます。これらのダウンロードには GitHub/Microsoft 自身のプライバシーポリシーが適用され、その過程で私たちにデータが送信されることはありません。<code>install.sh</code> スクリプトは、完全性検証のためにのみリリースバージョンと SHA-256 ダイジェストを GitHub Releases から読み取ります。',
    ko: '애플리케이션과 확장 프로그램 패키지는 GitHub Releases를 통해 배포됩니다. 해당 다운로드에는 GitHub/Microsoft 자체 개인정보 처리방침이 적용되며, 그 과정에서 우리에게 어떤 데이터도 전송되지 않습니다. <code>install.sh</code> 스크립트는 무결성 검증을 위해서만 릴리스 버전과 SHA-256 다이제스트를 GitHub Releases에서 읽습니다.',
    ru: 'Пакеты приложения и расширений распространяются через GitHub Releases. К этим загрузкам применяются собственные правила конфиденциальности GitHub/Microsoft; при этом к нам не передаётся никаких данных. Скрипт <code>install.sh</code> читает номер версии и хеши SHA-256 из GitHub Releases исключительно для проверки целостности.',
    zh: '应用程序和扩展程序包通过 GitHub Releases 分发。这些下载适用 GitHub/Microsoft 自身的隐私实践；过程中不会向我们传输任何数据。<code>install.sh</code> 脚本仅出于完整性校验目的，从 GitHub Releases 读取版本号和 SHA-256 摘要。',
  },
  'privacy-h2-4': {
    en: '4. Contact',
    tr: '4. İletişim',
    de: '4. Kontakt',
    fr: '4. Contact',
    es: '4. Contacto',
    it: '4. Contatti',
    pt: '4. Contato',
    ar: '٤. التواصل',
    ja: '4. お問い合わせ',
    ko: '4. 문의',
    ru: '4. Контакты',
    zh: '4. 联系方式',
  },
  'privacy-p1-4': {
    en: 'Privacy questions: <a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
    tr: 'Gizlilik sorularınız için: <a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
    de: 'Fragen zum Datenschutz: <a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
    fr: 'Questions relatives à la vie privée : <a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
    es: 'Preguntas sobre privacidad: <a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
    it: 'Domande sulla privacy: <a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
    pt: 'Perguntas sobre privacidade: <a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
    ar: 'أسئلة الخصوصية: <a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
    ja: 'プライバシーに関するご質問: <a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
    ko: '개인정보 문의: <a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
    ru: 'Вопросы о конфиденциальности: <a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
    zh: '隐私相关问题：<a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
  },
  'privacy-governing': {
    en: 'In case of any discrepancy, the Turkish text of this policy governs.',
    tr: 'Çeviri ile Türkçe metin arasında bir farklılık olması hâlinde Türkçe metin esas alınır.',
    de: 'Bei Abweichungen ist der türkische Text dieser Richtlinie maßgeblich.',
    fr: 'En cas de divergence, le texte turc de cette politique fait foi.',
    es: 'En caso de discrepancia, prevalece el texto en turco de esta política.',
    it: 'In caso di discordanza, fa fede il testo turco di questa informativa.',
    pt: 'Em caso de divergência, prevalece o texto em turco desta política.',
    ar: 'في حال وجود اختلاف، يُعتدّ بالنص التركي من هذه السياسة.',
    ja: '相違がある場合は、本ポリシーのトルコ語正文が優先します。',
    ko: '다를 경우 이 정책문의 터키어 본문이 우선합니다.',
    ru: 'При расхождениях приоритет имеет турецкий текст настоящей политики.',
    zh: '如有差异，以本政策的土耳其语文本为准。',
  },
  'privacy-updated': {
    en: 'Last updated: September 2026 · Available in 12 languages.',
    tr: 'Son güncelleme: Eylül 2026 · 12 dilde sunulur.',
    de: 'Zuletzt aktualisiert: September 2026 · In 12 Sprachen verfügbar.',
    fr: 'Dernière mise à jour : septembre 2026 · Disponible en 12 langues.',
    es: 'Última actualización: septiembre de 2026 · Disponible en 12 idiomas.',
    it: 'Ultimo aggiornamento: settembre 2026 · Disponibile in 12 lingue.',
    pt: 'Última atualização: setembro de 2026 · Disponível em 12 idiomas.',
    ar: 'آخر تحديث: سبتمبر ٢٠٢٦ · متاح بـ ١٢ لغة.',
    ja: '最終更新: 2026年9月 · 12言語で提供。',
    ko: '마지막 업데이트: 2026년 9월 · 12개 언어로 제공됩니다.',
    ru: 'Последнее обновление: сентябрь 2026 · Доступно на 12 языках.',
    zh: '最后更新：2026 年 9 月 · 提供 12 种语言。',
  },

  'terms-h2-1': {
    en: '1. Licence',
    tr: '1. Lisans',
    de: '1. Lizenz',
    fr: '1. Licence',
    es: '1. Licencia',
    it: '1. Licenza',
    pt: '1. Licença',
    ar: '١. الترخيص',
    ja: '1. ライセンス',
    ko: '1. 라이선스',
    ru: '1. Лицензия',
    zh: '1. 许可',
  },
  'terms-p1-1': {
    en: 'KalderaShield is released as open source under the <strong>Apache License 2.0</strong>. You may use, study, modify and distribute the software in accordance with the license terms. The full licence text is available in the <a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE" rel="noopener noreferrer">GitHub repository</a>.',
    tr: 'KalderaShield, <strong>Apache License 2.0</strong> koşullarıyla kaynak kodu açık olarak yayımlanır. Yazılımı kullanabilir, inceleyebilir, değiştirebilir ve lisans koşullarına uygun şekilde dağıtabilirsiniz. Tam lisans metnine <a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE" rel="noopener noreferrer">GitHub deposundan</a> ulaşabilirsiniz.',
    de: 'KalderaShield wird unter der <strong>Apache License 2.0</strong> als Open Source veröffentlicht. Sie dürfen die Software gemäß den Lizenzbedingungen verwenden, untersuchen, ändern und weiterverbreiten. Der vollständige Lizenztext steht im <a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE" rel="noopener noreferrer">GitHub-Repository</a>.',
    fr: 'KalderaShield est publié en open source sous la <strong>Licence Apache 2.0</strong>. Vous pouvez utiliser, étudier, modifier et redistribuer le logiciel conformément aux termes de la licence. Le texte complet de la licence est disponible dans le <a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE" rel="noopener noreferrer">dépôt GitHub</a>.',
    es: 'KalderaShield se publica como código abierto bajo la <strong>Licencia Apache 2.0</strong>. Puedes usar, estudiar, modificar y distribuir el software conforme a los términos de la licencia. El texto completo de la licencia está disponible en el <a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE" rel="noopener noreferrer">repositorio de GitHub</a>.',
    it: 'KalderaShield è pubblicato come open source secondo la <strong>Licenza Apache 2.0</strong>. Puoi usare, studiare, modificare e ridistribuire il software conformemente ai termini della licenza. Il testo completo della licenza è disponibile nel <a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE" rel="noopener noreferrer">repository GitHub</a>.',
    pt: 'O KalderaShield é publicado como código aberto sob a <strong>Licença Apache 2.0</strong>. Você pode usar, estudar, modificar e distribuir o software de acordo com os termos da licença. O texto completo da licença está disponível no <a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE" rel="noopener noreferrer">repositório do GitHub</a>.',
    ar: 'يُنشر KalderaShield مفتوح المصدر بموجب <strong>رخصة Apache 2.0</strong>. يمكنك استخدام البرنامج ودراسته وتعديله وتوزيعه وفقًا لشروط الرخصة. النص الكامل للرخصة متاح في <a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE" rel="noopener noreferrer">مستودع GitHub</a>.',
    ja: 'KalderaShield は <strong>Apache License 2.0</strong> の下でオープンソースとして公開されています。ライセンス条項に従って、ソフトウェアを使用・調査・改変・再配布できます。ライセンス全文は <a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE" rel="noopener noreferrer">GitHub リポジトリ</a> にあります。',
    ko: 'KalderaShield는 <strong>Apache License 2.0</strong>에 따라 오픈 소스로 공개됩니다. 라이선스 조건에 따라 소프트웨어를 사용, 조사, 수정, 배포할 수 있습니다. 전체 라이선스 전문은 <a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE" rel="noopener noreferrer">GitHub 저장소</a>에서 확인할 수 있습니다.',
    ru: 'KalderaShield распространяется как программа с открытым исходным кодом на условиях <strong>лицензии Apache 2.0</strong>. Вы можете использовать, изучать, изменять и распространять программу в соответствии с условиями лицензии. Полный текст лицензии доступен в <a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE" rel="noopener noreferrer">репозитории GitHub</a>.',
    zh: 'KalderaShield 依据 <strong>Apache License 2.0</strong> 以开源方式发布。你可以按照许可条款使用、研究、修改和分发本软件。完整许可文本见 <a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE" rel="noopener noreferrer">GitHub 仓库</a>。',
  },
  'terms-h2-2': {
    en: '2. No warranty',
    tr: '2. Sorumluluk Reddi',
    de: '2. Keine Gewährleistung',
    fr: '2. Absence de garantie',
    es: '2. Sin garantía',
    it: '2. Nessuna garanzia',
    pt: '2. Sem garantia',
    ar: '٢. لا ضمان',
    ja: '2. 無保証',
    ko: '2. 보증 없음',
    ru: '2. Без гарантий',
    zh: '2. 免责声明',
  },
  'terms-p1-2': {
    en: 'The software is provided "AS IS" without warranty of any kind, including merchantability and fitness for a particular purpose. <strong>As a password manager, KalderaShield never knows your master password or recovery key; there is no recovery mechanism that can restore access to your vault if those are lost.</strong> Backing up your master password and recovery key securely is your responsibility.',
    tr: 'Yazılım "OLDUĞU GİBİ" sağlanır ve ticari elverişlilik, belirli bir amaca uygunluk ve ihlal etmeme taahhütleri dâhil, zımni hiçbir garanti içermez. <strong>Şifre yöneticisi olarak KalderaShield, ana parolanızı veya kurtarma anahtarınızı bilmez; bu bilgilerin kaybı hâlinde kasanıza erişimi geri getirebilecek bir kurtarma mekanizması mevcut değildir.</strong> Ana parolanızı ve kurtarma anahtarınızı güvenli şekilde yedeklemek sizin sorumluluğunuzdadır.',
    de: 'Die Software wird ohne jede Gewährleistung, einschließlich Marktfähigkeit und Eignung für einen bestimmten Zweck, "WIE VORHANDEN" bereitgestellt. <strong>Als Passwortmanager kennt KalderaShield weder Ihr Master-Passwort noch Ihren Wiederherstellungsschlüssel; es gibt keinen Wiederherstellungsmechanismus, der den Zugriff auf Ihren Tresor wiederherstellen könnte, wenn diese verloren gehen.</strong> Für die sichere Sicherung Ihres Master-Passworts und Wiederherstellungsschlüssels sind Sie selbst verantwortlich.',
    fr: 'Le logiciel est fourni « EN L\'ÉTAT », sans garantie d\'aucune sorte, y compris de commercialisabilité et d\'adéquation à un usage particulier. <strong>En tant que gestionnaire de mots de passe, KalderaShield ne connaît jamais votre mot de passe principal ni votre clé de récupération ; aucun mécanisme ne permet de rétablir l\'accès à votre coffre en cas de perte.</strong> La sauvegarde sécurisée de votre mot de passe principal et de votre clé de récupération relève de votre responsabilité.',
    es: 'El software se ofrece « TAL CUAL » sin garantía de ningún tipo, incluida la comercionalización y la idoneidad para un fin determinado. <strong>Como gestor de contraseñas, KalderaShield nunca conoce tu contraseña maestra ni tu clave de recuperación; no existe ningún mecanismo de recuperación que pueda restaurar el acceso a tu bóveda si se pierden.</strong> La copia de seguridad segura de tu contraseña maestra y tu clave de recuperación es responsabilidad tuya.',
    it: 'Il software è fornito « COSÌ COM\'È », senza garanzie di alcun tipo, incluse la commerciabilità e l\'idoneità a uno scopo specifico. <strong>Come gestore di password, KalderaShield non conosce mai la tua password principale né la tua chiave di ripristino; non esiste alcun meccanismo di recupero che possa ripristinare l\'accesso alla tua cassaforte in caso di perdita.</strong> Il backup sicuro della password principale e della chiave di ripristino è responsabilità tua.',
    pt: 'O software é fornecido « COMO ESTÁ », sem garantia de qualquer espécie, incluindo commercialização e adequação a um fim específico. <strong>Como gestor de senhas, o KalderaShield nunca conhece a sua senha mestra nem a sua chave de recuperação; não existe mecanismo de recuperação que possa restaurar o acesso ao seu cofre caso sejam perdidas.</strong> Fazer backup seguro da sua senha mestra e da sua chave de recuperação é da sua responsabilidade.',
    ar: 'يُقدَّم البرنامج « كما هو » دون أي ضمان، بما في ذلك ضمان القابلية للتسويق والملاءمة لغرض معيّن. <strong>وبصفتك مديرة كلمات مرور، لا يعرف KalderaShield مطلقًا كلمة المرور الرئيسية أو مفتاح الاسترداد لديك؛ ولا توجد آلية استرداد يمكنها إعادة الوصول إلى خزنتك في حال فقدانهما.</strong> والنسخ الاحتياطي الآمن لكلمة المرور الرئيسية ومفتاح الاسترداد مسؤوليتك.',
    ja: '本ソフトウェアは、商用性および特定目的への適合性を含め、いかなる種類の保証も 없이「現状有姿」で提供されます。<strong>パスワードマネージャーとして、KalderaShield はあなたのマスターパスワードもリカバリーキーも一切知りません。それらが失われた場合、保管庫へのアクセスを復旧する手段はありません。</strong>マスターパスワードとリカバリーキーを安全にバックアップすることは利用者の責任です。',
    ko: '본 소프트웨어는 상품성 및 특정 목적에의 적합성을 포함하여 어떠한 보증도 없이 "있는 그대로" 제공됩니다. <strong>비밀번호 관리자로서 KalderaShield는 마스터 비밀번호나 복구 키를 전혀 알지 못하며, 두 정보가 유실될 경우 보관함 접근을 복구할 수 있는 수단이 없습니다.</strong> 마스터 비밀번호와 복구 키를 안전하게 백업하는 것은 사용자의 책임입니다.',
    ru: 'Программное обеспечение предоставляется «КАК ЕСТЬ» без гарантий любого рода, включая товарную пригодность и пригодность для конкретной цели. <strong>Как менеджер паролей, KalderaShield никогда не знает ваш мастер-пароль и ключ восстановления; механизма, который мог бы восстановить доступ к хранилищу при их утрате, не существует.</strong> Ответственность за безопасное резервное копирование мастер-пароля и ключа восстановления лежит на вас.',
    zh: '本软件按「现状」提供，不作任何种类的担保，包括对适销性和特定用途适用性的担保。<strong>作为密码管理器，KalderaShield 绝不掌握你的主密码或恢复密钥；如果它们丢失，不存在任何能够恢复保管库访问的机制。</strong>安全备份主密码和恢复密钥是你的责任。',
  },
  'terms-h2-3': {
    en: '3. Downloads and verification',
    tr: '3. İndirmeler ve Doğrulama',
    de: '3. Downloads und Überprüfung',
    fr: '3. Téléchargements et vérification',
    es: '3. Descargas y verificación',
    it: '3. Download e verifica',
    pt: '3. Downloads e verificação',
    ar: '٣. التنزيلات والتحقق',
    ja: '3. ダウンロードと検証',
    ko: '3. 다운로드 및 검증',
    ru: '3. Загрузки и проверка',
    zh: '3. 下载与校验',
  },
  'terms-p1-3': {
    en: 'Install packages are published on GitHub Releases. The SHA-256 digest and signatures of every file are published on the release page; verifying integrity before installation is recommended. The integrity of packages obtained from third-party sources cannot be guaranteed.',
    tr: 'Kurulum paketleri GitHub Releases üzerinden sunulur. Yayınlanan her dosyanın SHA-256 özeti ve imzaları sürüm sayfasında paylaşılır; kurulum öncesi bütünlük doğrulaması yapmanız önerilir. Üçüncü taraf kaynaklardan indirilen paketlerin bütünlüğü garanti edilemez.',
    de: 'Installationspakete werden auf GitHub Releases veröffentlicht. Der SHA-256-Prüfsumme und die Signaturen jeder Datei sind auf der Release-Seite angegeben; eine Integritätsprüfung vor der Installation wird empfohlen. Die Integrität von Paketen aus Drittquellen kann nicht garantiert werden.',
    fr: 'Les paquets d\'installation sont publiés sur GitHub Releases. La somme SHA-256 et les signatures de chaque fichier sont publiées sur la page de la version ; il est recommandé de vérifier l\'intégrité avant l\'installation. L\'intégrité des paquets provenant de sources tierces ne peut être garantie.',
    es: 'Los paquetes de instalación se publican en GitHub Releases. El resumen SHA-256 y las firmas de cada archivo se publican en la página de la versión; se recomienda verificar la integridad antes de instalar. No puede garantizarse la integridad de los paquetes obtenidos de fuentes de terceros.',
    it: 'I pacchetti di installazione sono pubblicati su GitHub Releases. Il digest SHA-256 e le firme di ogni file sono pubblicati nella pagina della release; si consiglia di verificarne l\'integrità prima dell\'installazione. L\'integrità dei pacchetti provenienti da fonti di terze parti non può essere garantita.',
    pt: 'Os pacotes de instalação são publicados no GitHub Releases. O resumo SHA-256 e as assinaturas de cada arquivo são publicados na página da versão; recomenda-se verificar a integridade antes da instalação. A integridade de pacotes obtidos de fontes de terceiros não pode ser garantida.',
    ar: 'تُنشر حزم التثبيت على GitHub Releases. يُنشر بصمة SHA-256 وتوقيعات كل ملف في صفحة الإصدار؛ ويُوصى بالتحقق من السلامة قبل التثبيت. ولا يمكن ضمان سلامة الحزم التي تم الحصول عليها من مصادر خارجية.',
    ja: 'インストールパッケージは GitHub Releases で公開されています。各ファイルの SHA-256 ダイジェストと署名はリリースページに掲載されており、インストール前に整合性を検証することを推奨します。第三者のソースから取得したパッケージの整合性は保証できません。',
    ko: '설치 패키지는 GitHub Releases에 게시됩니다. 각 파일의 SHA-256 다이제스트와 서명은 릴리스 페이지에 공개되며, 설치 전에 무결성을 확인할 것을 권장합니다. 제3자 출처에서 얻은 패키지의 무결성은 보장할 수 없습니다.',
    ru: 'Установочные пакеты публикуются в GitHub Releases. Хеш SHA-256 и подписи каждого файла публикуются на странице релиза; рекомендуется проверить целостность перед установкой. Целостность пакетов, полученных из сторонних источников, гарантировать нельзя.',
    zh: '安装包发布在 GitHub Releases 上。每个文件的 SHA-256 摘要和签名都会发布在发行页面上，建议在安装前校验完整性。从第三方来源获得的软件包无法保证其完整性。',
  },
  'terms-h2-4': {
    en: '4. Acceptable use',
    tr: '4. Kullanım Koşulları',
    de: '4. Zulässige Nutzung',
    fr: '4. Utilisation acceptable',
    es: '4. Uso aceptable',
    it: '4. Utilizzo accettabile',
    pt: '4. Uso aceitável',
    ar: '٤. الاستخدام المقبول',
    ja: '4. 許容される利用',
    ko: '4. 허용되는 사용',
    ru: '4. Допустимое использование',
    zh: '4. 可接受的使用',
  },
  'terms-p1-4': {
    en: 'You may not use the software or this website for any unlawful purpose, nor use the KalderaShield name or logo in ways that confuse them with unofficial builds. The KalderaShield name and logo are the property of their owner.',
    tr: 'Yazılımı ve web sitesini yasaya aykırı herhangi bir amaçla kullanamaz, kalderashield adını ve logosunu ürünün resmi sürümleriyle karıştırılacak biçimde izinsiz kullanamazsınız. "KalderaShield" adı ve logosu sahibinin mülkiyetindedir.',
    de: 'Sie dürfen die Software oder diese Website nicht für rechtswidrige Zwecke verwenden und den Namen oder das Logo von KalderaShield nicht so nutzen, dass sie mit inoffiziellen Builds verwechselt werden können. Name und Logo von KalderaShield sind Eigentum des jeweiligen Inhabers.',
    fr: 'Vous ne pouvez pas utiliser le logiciel ou ce site web à des fins illégales, ni utiliser le nom ou le logo KalderaShield d\'une manière qui les confondrait avec des versions non officielles. Le nom et le logo KalderaShield appartiennent à leur détenteur.',
    es: 'No puedes usar el software ni este sitio web con fines ilegales, ni usar el nombre o el logotipo de KalderaShield de forma que puedan confundirse con compilaciones no oficiales. El nombre y el logotipo de KalderaShield son propiedad de su titular.',
    it: 'Non puoi utilizzare il software o questo sito web per scopi illeciti né usare il nome o il logo KalderaShield in modo da confonderli con build non ufficiali. Il nome e il logo KalderaShield sono proprietà del rispettivo titolare.',
    pt: 'Você não pode usar o software ou este site para fins ilícita, nem usar o nome ou o logotipo KalderaShield de modo que possam ser confundidos com builds não oficiais. O nome e o logotipo KalderaShield são propriedade de seu titular.',
    ar: 'لا يجوز لك استخدام البرنامج أو هذا الموقع لأي غرض غير قانوني، ولا استخدام اسم KalderaShield أو شعاره بطرق تخلطها مع إصدارات غير رسمية. اسم KalderaShield وشعاره مملوكان لصاحبهما.',
    ja: '本ソフトウェアや本ウェブサイトを違法な目的で使用したり、KalderaShield の名称やロゴを非公式ビルドと混同させるように使用したりすることはできません。KalderaShield の名称およびロゴは、その所有者の財産です。',
    ko: '본 소프트웨어나 이 웹사이트를 불법적인 목적으로 사용하거나, KalderaShield의 이름이나 로고를 비공식 빌드와 혼동되게 사용할 수 없습니다. KalderaShield의 이름과 로고는 해당 권리자의 재산입니다.',
    ru: 'Вы не можете использовать программное обеспечение или этот сайт в незаконных целях, а также использовать название или логотип KalderaShield так, чтобы их можно было спутать с неофициальными сборками. Название и логотип KalderaShield являются собственностью их владельца.',
    zh: '你不得将本软件或本网站用于任何违法目的，也不得以使人将其与非官方版本混淆的方式使用 KalderaShield 的名称或标志。KalderaShield 名称和标志归其所有者所有。',
  },
  'terms-h2-5': {
    en: '5. Contact',
    tr: '5. İletişim',
    de: '5. Kontakt',
    fr: '5. Contact',
    es: '5. Contacto',
    it: '5. Contatti',
    pt: '5. Contato',
    ar: '٥. التواصل',
    ja: '5. お問い合わせ',
    ko: '5. 문의',
    ru: '5. Контакты',
    zh: '5. 联系方式',
  },
  'terms-p1-5': {
    en: 'Questions about these terms: <a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
    tr: 'Şartlar hakkındaki sorularınız için: <a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
    de: 'Fragen zu diesen Bedingungen: <a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
    fr: 'Questions sur ces conditions : <a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
    es: 'Preguntas sobre estos términos: <a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
    it: 'Domande su questi termini: <a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
    pt: 'Perguntas sobre estes termos: <a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
    ar: 'أسئلة حول هذه الشروط: <a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
    ja: '本条件に関するお問い合わせ: <a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
    ko: '본 이용약관에 관한 문의: <a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
    ru: 'Вопросы об этих условиях: <a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
    zh: '关于本条款的问题：<a href="mailto:admin@{{DOMAIN}}">admin@{{DOMAIN}}</a>',
  },
  'terms-governing': {
    en: 'In case of any discrepancy, the Turkish text of these terms governs.',
    tr: 'Çeviri ile Türkçe metin arasında bir farklılık olması hâlinde Türkçe metin esas alınır.',
    de: 'Bei Abweichungen ist der türkische Text dieser Bedingungen maßgeblich.',
    fr: 'En cas de divergence, le texte turc des présentes conditions fait foi.',
    es: 'En caso de discrepancia, prevalece el texto en turco de estos términos.',
    it: 'In caso di discordanza, fa fede il testo turco delle presenti condizioni.',
    pt: 'Em caso de divergência, prevalece o texto em turco destes termos.',
    ar: 'في حال وجود اختلاف، يُعتدّ بالنص التركي من هذه الشروط.',
    ja: '相違がある場合は、本条件のトルコ語正文が優先します。',
    ko: '다를 경우 본 이용약관의 터키어 본문이 우선합니다.',
    ru: 'При расхождениях приоритет имеет турецкий текст настоящих условий.',
    zh: '如有差异，以本条款的土耳其语文本为准。',
  },
  'terms-updated': {
    en: 'Last updated: September 2026 · Available in 12 languages.',
    tr: 'Son güncelleme: Eylül 2026 · 12 dilde sunulur.',
    de: 'Zuletzt aktualisiert: September 2026 · In 12 Sprachen verfügbar.',
    fr: 'Dernière mise à jour : septembre 2026 · Disponible en 12 langues.',
    es: 'Última actualización: septiembre de 2026 · Disponible en 12 idiomas.',
    it: 'Ultimo aggiornamento: settembre 2026 · Disponibile in 12 lingue.',
    pt: 'Última atualização: setembro de 2026 · Disponível em 12 idiomas.',
    ar: 'آخر تحديث: سبتمبر ٢٠٢٦ · متاح بـ ١٢ لغة.',
    ja: '最終更新: 2026年9月 · 12言語で提供。',
    ko: '마지막 업데이트: 2026년 9월 · 12개 언어로 제공됩니다.',
    ru: 'Последнее обновление: сентябрь 2026 · Доступно на 12 языках.',
    zh: '最后更新：2026 年 9 月 · 提供 12 种语言。',
  },
};

const CODES = ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'ru', 'tr', 'zh'];

let applied = 0;
const problems = [];

for (const code of CODES) {
  const file = path.join(I18N_DIR, `${code}.json`);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));

  for (const [key, byLanguage] of Object.entries(TRANSLATIONS)) {
    if (!Object.prototype.hasOwnProperty.call(byLanguage, code)) {
      problems.push(`${code} is missing ${key}`);
      continue;
    }
    json[key] = byLanguage[code];
    applied++;
  }

  // The legal pages reorder nothing: keys are appended in insertion order, and
  // the audit checks the set, not the order. Rewriting with 2-space indent
  // matches what the other locale files already use.
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
}

console.log(`applied ${applied} values across ${CODES.length} locales`);
if (problems.length) {
  problems.forEach((problem) => console.log(`  MISSING ${problem}`));
  process.exit(1);
}
