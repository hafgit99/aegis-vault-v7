document.addEventListener('DOMContentLoaded', () => {

  /* ═══════════════════════════════════════════
     SAFE LOCALSTORAGE UTILITY
     ═══════════════════════════════════════════ */
  const safeLocalStorage = {
    getItem(key) {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        console.warn('localStorage reading blocked:', e);
        return null;
      }
    },
    setItem(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        console.warn('localStorage writing blocked:', e);
      }
    }
  };

  /* ═══════════════════════════════════════════
     TRANSLATIONS DICTIONARY (EN, TR, ZH)
     ═══════════════════════════════════════════ */
  const translations = {
    tr: {
      "nav-security": "Güvenlik",
      "nav-features": "Özellikler",
      "nav-comparison": "Karşılaştırma",
      "nav-demo": "Şifre Testi",
      "nav-download": "İndir",
      "nav-cta": "İndir",
      "hero-badge": "<span class=\"live-dot\"></span> Sürüm 7.0.1 — Yayında",
      "hero-title": "Verileriniz Sadece<br><span class=\"gradient-text\">Sizin Cihazınızda</span> Güvende.",
      "hero-desc": "AegisVault 7, internet bağlantısına veya üçüncü taraf bulut sağlayıcılarına ihtiyaç duymayan, sıfır-bilgi (zero-knowledge) güvenlik mimarisine sahip yerel ve açık kaynaklı şifre yöneticisidir.",
      "hero-btn-dl": "Yükleyiciyi İndir",
      "hero-btn-git": "GitHub'da İncele",
      "hero-platform": "İşletim sisteminiz algılanıyor...",
      "float-badge-title-enc": "Şifreleme",
      "float-badge-title-status": "Durum",
      "float-badge-val-status": "Çevrimdışı Kasa",
      "trust-label-tests": "Test Başarılı",
      "trust-label-strength": "Şifreleme Gücü",
      "trust-label-leaks": "Veri Sızıntısı",
      "trust-label-open": "Açık Kaynak",
      "sec-eyebrow": "Güvenlik Mimarisi",
      "sec-title": "Sarsılmaz Kriptografik Koruma",
      "sec-desc": "Verileriniz, en üst düzey kriptografik algoritmalarla doğrudan sizin cihazınızda şifrelenir. Ana şifreniz olmadan veritabanınıza erişilmesi teorik olarak imkansızdır.",
      "sec-c1-title": "AES-256-GCM",
      "sec-c1-desc": "Her bir veri kaydı (şifreler, kartlar, notlar), kimlik doğrulamalı ve bütünlük kontrollü AES-GCM 256-bit şifreleme algoritması ile izole şekilde korunur.",
      "sec-c1-tag": "Askeri Düzey",
      "sec-c2-title": "Argon2id KDF",
      "sec-c2-desc": "Master şifreniz, kaba kuvvet ve donanımsal brute-force saldırılarına karşı endüstri standardı olan bellek-zorluk odaklı Argon2id algoritmasıyla türetilir.",
      "sec-c2-tag": "Anahtar Türetme",
      "sec-c3-title": "Sıfır Bilgi",
      "sec-c3-desc": "Cihazınızın dışına şifrelenmemiş veri veya anahtar asla sızmaz. Tüm doğrulama ve şifre çözme işlemleri tamamen tarayıcınızın/Tauri'nin güvenli sandbox'ında gerçekleşir.",
      "sec-c3-tag": "Zero-Knowledge",
      "sim-title": "Argon2id KDF <span class=\"gradient-text\">Zorluk Hesaplayıcı</span>",
      "sim-desc": "Master şifrenizin türetilme zorluğunu simüle edin. AegisVault'un kullandığı Argon2id parametrelerini artırarak kaba kuvvet saldırılarına karşı direnci canlı olarak gözlemleyin.",
      "sim-lbl-mem": "Ayrılan Bellek (Memory)",
      "sim-lbl-iter": "Yineleme Sayısı (Iterations)",
      "sim-metric-cost": "GPU Saldırı Maliyeti",
      "sim-metric-delay": "Türetim Gecikmesi (CPU)",
      "sim-info-note": "💡 AegisVault varsayılan olarak <strong>128 MB Bellek</strong> ve <strong>4 Yineleme</strong> kullanır. Bu premium ayarlar, tarayıcınızda veya Tauri içinde hissedilir bir gecikme yaratmadan saldırganların GPU cihazlarındaki kırma hızını 50,000 kattan fazla yavaşlatır.",
      "flow-title": "Aegis Kriptografi İşleyiş Akışı",
      "flow-s1-title": "Giriş Şifresi",
      "flow-s1-desc": "Master şifreniz girilir ve anında byte dizisine dönüştürülür.",
      "flow-s2-title": "Argon2id KDF",
      "flow-s2-desc": "128MB / 4 passes KDF ile KEK (Key Encryption Key) üretilir.",
      "flow-s3-title": "DEK Çözme",
      "flow-s3-desc": "KEK kullanılarak AES-GCM ile şifrelenmiş veritabanı anahtarı (DEK) çözülür.",
      "flow-s4-title": "SQLite / OPFS",
      "flow-s4-desc": "Çözülen DEK, OPFS altındaki SQLite veritabanına sorgu atmak için WebCrypto'da tutulur.",
      "flow-s5-title": "Hafıza Temizliği",
      "flow-s5-desc": "Kilitlenme anında şifre ve KEK hafızadan tamamen silinir (Zeroize Uint8Array).",
      "feat-eyebrow": "Özellikler",
      "feat-title": "Güçlü, Esnek ve Tavizsiz",
      "feat-desc": "Günlük işlerinizi kolaylaştırırken en sıkı güvenlik sınırlarından asla vazgeçmeyen mimari.",
      "feat-c1-title": "Local-First: SQLite & OPFS Sandbox",
      "feat-c1-desc": "Bilgileriniz uzak sunucularda değil, tarayıcınızın veya Tauri desktop uygulamasının özel sandboxed dosya sisteminde (Origin Private File System) doğrudan SQLite veritabanında saklanır. Ağ kopukluklarından etkilenmez, verileriniz tamamen yereldir.",
      "feat-c2-title": "Güvenli Eklenti Entegrasyonu",
      "feat-c2-desc": "Chrome ve Firefox eklentileriyle tam entegrasyon. Rakiplerin aksine yerel WebSocket yerine <strong>Native Messaging</strong> protokolüyle Tauri masaüstü katmanına doğrudan bağlanır. Sisteminizde dışarıya açık hiçbir port veya dinleme soketi açılmaz.",
      "feat-c3-title": "Air-Gap Ağ Politikası",
      "feat-c3-desc": "Uygulama, yerel bir sandbox içinde çalışır ve beklenmeyen tüm dış istekleri bloklar. İnternet erişimi olmadan maksimum izolasyon sağlar.",
      "feat-c4-title": "Dahili TOTP Doğrulayıcı",
      "feat-c4-desc": "Ekstra 2FA uygulamalarına gerek kalmadan, RFC 6238 standartlarında anlık zamana dayalı tek kullanımlık geçici kodlar üretin ve doldurun.",
      "feat-c5-title": "Biyometrik Kilit Desteği",
      "feat-c5-desc": "Windows Hello ve mobil biyometrik API'ler aracılığıyla şifre kasasının kilidini parmak izi veya yüz tanıma ile güvenle ve hızla açın.",
      "comp-eyebrow": "Karşılaştırma Matrisi",
      "comp-title": "Neden AegisVault Farklı?",
      "comp-desc": "AegisVault 7'yi piyasadaki popüler bulut tabanlı ve geleneksel offline rakipleriyle objektif kriterlere göre karşılaştırın.",
      "comp-th-criteria": "Güvenlik & Mimari Kriteri",
      "comp-th-aegis": "AegisVault 7",
      "comp-th-cloud": "Bulut Şifre Yöneticileri",
      "comp-th-offline": "Geleneksel Offline Sistemler",
      "comp-r1-c1": "Depolama Mimarisi",
      "comp-r1-c2": "Yerel Sandbox (SQLite & OPFS)",
      "comp-r1-c3": "Merkezi Bulut Veritabanı",
      "comp-r1-c4": "Düz Yerel Dosya (Sistem Bağımlı)",
      "comp-r2-c1": "KDF Tipi & Direnç",
      "comp-r2-c2": "Argon2id (128MB / 4 passes)",
      "comp-r2-c3": "Düşük Iterasyonlu PBKDF2",
      "comp-r2-c4": "AES-KDF veya Standart Argon2d",
      "comp-r3-c1": "Açık Port / WebSocket Saldırı Yüzeyi",
      "comp-r3-c2": "Yok (Native Messaging)",
      "comp-r3-c3": "Yok (Web API)",
      "comp-r3-c4": "Var (Port 19455/Localhost)",
      "comp-r4-c1": "Hafızadaki Parola Güvenliği",
      "comp-r4-c2": "Uint8Array Sıfırlama (Zeroize)",
      "comp-r4-c3": "Bilinmiyor (Çöp Toplayıcı)",
      "comp-r4-c4": "Bilinmiyor / Değişken",
      "comp-r5-c1": "Ağ Erişim Yetkisi",
      "comp-r5-c2": "Dinamik Whitelist'li Air-Gap (Opsiyonel E2EE Sync)",
      "comp-r5-c3": "Sürekli Çevrimiçi",
      "comp-r5-c4": "Kullanıcı Kontrolünde",
      "comp-r6-c1": "IV / Nonce Üretimi",
      "comp-r6-c2": "SP 800-38D Sayaç Tabanlı",
      "comp-r6-c3": "Rastgele (Çakışma Riski)",
      "comp-r6-c4": "Rastgele veya Statik",
      "demo-eyebrow": "Canlı Demo",
      "demo-title": "Aegis Guard ile Şifrenizi Test Edin",
      "demo-desc": "AegisVault 7'nin dahili \"Aegis Guard\" güvenlik denetim algoritmasını canlı olarak deneyin. Şifrenizin kırılma entropisini hesaplayın.",
      "demo-left-title": "Şifre <span class=\"gradient-text\">Denetleyici</span>",
      "demo-label-pwd": "Test Edilecek Şifre",
      "demo-metric-class": "Güvenlik Sınıfı",
      "demo-metric-entropy": "Entropi Değeri",
      "demo-metric-crack": "Tahmini Kırma Süresi",
      "demo-checklist-title": "Aegis Guard Önerileri",
      "demo-chk-len": "En az 12 karakter uzunluğunda",
      "demo-chk-upper": "Büyük harf (A-Z) içeriyor",
      "demo-chk-lower": "Küçük harf (a-z) içeriyor",
      "demo-chk-num": "Rakam (0-9) içeriyor",
      "demo-chk-spec": "Özel karakter (!@#$%^&*) içeriyor",
      "demo-note": "Aegis Guard, şifre gücünü basit uzunluğun ötesinde, olası karakter havuzu kombinasyonlarına (Entropi) göre hesaplar.",
      "dl-eyebrow": "İndirme Merkezi",
      "dl-title": "AegisVault 7'yi İndirin",
      "dl-desc": "Cihazınıza en uygun AegisVault sürümünü seçin ve tam dijital bağımsızlığınızı bugün başlatın.",
      "dl-tab-desktop": "Masaüstü",
      "dl-tab-extensions": "Eklentiler",
      "dl-tab-mobile": "Mobil",
      "dl-c1-title": "Windows (x64)",
      "dl-c1-desc": "Tauri tabanlı yerel yürütülebilir MSI veya EXE kurulum dosyası.",
      "dl-c1-link1": "AegisVault_7.0.1_x64.msi <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"><polyline points=\"12 5 19 12 12 19\"></svg>",
      "dl-c1-link2": "Taşınabilir Sürüm (.exe) <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"><polyline points=\"12 5 19 12 12 19\"></svg>",
      "dl-c2-title": "macOS (Universal)",
      "dl-c2-desc": "Apple Silicon (M1/M2/M3) ve Intel işlemciler için evrensel DMG paketi.",
      "dl-c2-link1": "AegisVault_7.0.1_universal.dmg <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"><polyline points=\"12 5 19 12 12 19\"></svg>",
      "dl-c3-title": "Linux",
      "dl-c3-desc": "Debian/Ubuntu için DEB veya evrensel AppImage formatı.",
      "dl-c3-link1": "AegisVault_7.0.1_amd64.deb <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"><polyline points=\"12 5 19 12 12 19\"></svg>",
      "dl-c3-link2": "AegisVault_7.0.1.AppImage <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"><polyline points=\"12 5 19 12 12 19\"></svg>",
      "dl-cli-header": "Windows Winget Kurulum",
      "dl-cli-copy": "Kopyala",
      "dl-c4-title": "Google Chrome",
      "dl-c4-desc": "Chrome Web Mağazası üzerinden tek tıkla kurulum.",
      "dl-c4-link1": "Chrome Web Mağazası <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"><polyline points=\"12 5 19 12 12 19\"></svg>",
      "dl-c5-title": "Mozilla Firefox",
      "dl-c5-desc": "Firefox Eklenti Mağazası (AMO) üzerinden imzalı kurulum.",
      "dl-c5-link1": "Firefox Eklentileri <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"><polyline points=\"12 5 19 12 12 19\"></svg>",
      "dl-c6-title": "Android",
      "dl-c6-desc": "Güvenli Android Keystore entegrasyonu ile yerel doldurma servisi.",
      "dl-c6-span": "Çok Yakında (Google Play / APK)",
      "dl-c7-title": "iOS",
      "dl-c7-desc": "Apple Keychain ve FaceID entegrasyonlu yerel iOS sürümü.",
      "dl-c7-span": "Çok Yakında (App Store)",
      "footer-brand-desc": "Sıfır bilgi (zero-knowledge) ve yerel öncelikli şifreleme prensipleriyle geliştirilmiş, açık kaynaklı yeni nesil şifre kasası.",
      "footer-col1-title": "Ürün",
      "footer-col2-title": "Güvenlik",
      "footer-col3-title": "Bağlantılar",
      "footer-link-audit": "Audit Raporu",
      "footer-link-crypto": "Kriptografi Detayları",
      "footer-link-source": "Açık Kaynak Kod",
      "footer-link-terms": "Kullanım Şartları",
      "footer-link-privacy": "Gizlilik Politikası",
      "footer-link-support": "Destek Al",
      "footer-copy": "&copy; 2026 AegisVault. Tüm Hakları Saklıdır.",
      "footer-link-cookies": "Çerez Tercihleri",
      "cookie-title": "Çerez Tercihleri",
      "cookie-desc": "AegisVault, yerel dil ve tema ayarlarınızı cihazınızda saklamak için çerezleri ve yerel depolamayı kullanır. Gizliliğinize saygı duyuyor ve verilerinizi asla izlemiyoruz.",
      "cookie-opt-essential-title": "Zorunlu Çerezler",
      "cookie-opt-essential-desc": "Dil tercihi, tema seçimi ve temel işlevler için gereklidir. Kapatılamaz.",
      "cookie-opt-always-active": "Her Zaman Aktif",
      "cookie-opt-analytics-title": "Analitik Çerezler",
      "cookie-opt-analytics-desc": "Web sitesi performansını ve sayfa ziyaret istatistiklerini anonim olarak analiz etmemizi sağlar.",
      "cookie-opt-marketing-title": "Pazarlama Çerezleri",
      "cookie-opt-marketing-desc": "Özelleştirilmiş duyurular ve kampanya bildirimleri sunmak için kullanılır.",
      "cookie-btn-save": "Seçilenleri Kaydet",
      "cookie-btn-accept": "Tümünü Kabul Et",
      "qlt-eyebrow": "Kalite & Test Güvencesi",
      "qlt-title": "Sıkı Test ve %95+ Kod Kapsamı",
      "qlt-desc": "AegisVault 7'nin tüm kriptografik işlemleri, veri taşıma protokolleri ve arayüz durumları 750'den fazla otomatik birim testi ile sürekli denetlenir.",
      "qlt-metric-statements": "İfadeler",
      "qlt-metric-branches": "Dallar",
      "qlt-metric-functions": "Fonksiyonlar",
      "qlt-card1-title": "Kod Kapsamı (Statements)",
      "qlt-card1-desc": "Yürütülebilir tüm kod satırlarının ve talimatlarının testlerde çalıştırılma oranı.",
      "qlt-card2-title": "Karar Dalları (Branches)",
      "qlt-card2-desc": "Kod içindeki tüm mantıksal if-else ve switch koşullarının test edilme oranı.",
      "qlt-card3-title": "Fonksiyon Testi (Functions)",
      "qlt-card3-desc": "Uygulama genelindeki tüm metod ve yardımcı fonksiyonların test edilme oranı.",
      "qlt-board-badge": "Birim Testleri (Vitest)",
      "qlt-board-pass": "Başarılı Test",
      "qlt-board-summary": "Test Dosyaları: 101 passed · Test Sayısı: 754 passed · Süre: 24.32s",
      "qlt-more-tests": "... 96 test dosyası daha başarıyla tamamlandı.",
      "terms-title": "Kullanım Şartları",
      "terms-content": "<p><strong>1. Kabul Edilmesi</strong><br>AegisVault 7 tescilli ve yerel öncelikli (local-first) bir şifre yöneticisidir. Bu web sitesini veya uygulamayı kullanarak, bu koşulları kabul etmiş olursunuz.</p><p><strong>2. Sorumluluk Sınırları</strong><br>AegisVault sıfır-bilgi (zero-knowledge) güvenlik mimarisiyle çalışır. Master şifreniz veya anahtarlarınız sunucularımıza gönderilmez veya saklanmaz. Şifrenizi kaybetmeniz durumunda verilerinize erişimi kurtarmamız teknik olarak imkansızdır. Veri yedeklerinizin ve anahtar güvenliğinin sorumluluğu tamamen size aittir.</p><p><strong>3. Garanti Yoktur</strong><br>Yazılım \"olduğu gibi\" sunulmaktadır. Kullanımdan doğabilecek doğrudan veya dolaylı veri kaybı ya da güvenlik ihlali gibi zararlardan AegisVault geliştiricileri sorumlu tutulamaz.</p><p><strong>4. Mülkiyet ve Lisans (Tüm Hakları Saklıdır)</strong><br>AegisVault 7 yazılımının tüm fikri mülkiyet ve telif hakları geliştiriciye aittir. Kullanıcılara yalnızca kişisel kullanım için sınırlı, devredilemez ve ticari olmayan bir kullanım lisansı verilir. Yazılımın kaynak kodlarının veya dosyalarının geliştiricinin yazılı izni olmaksızın kopyalanması, değiştirilmesi, dağıtılması, satılması veya tersine mühendislik işlemlerine tabi tutulması kesinlikle yasaktır.</p>",
      "privacy-title": "Gizlilik Politikası",
      "privacy-content": "<p><strong>1. Veri Toplamama İlkesi</strong><br>AegisVault 7 gizlilik odaklı tasarlanmıştır. Hiçbir kişisel veri, şifre, kullanıcı hesabı veya kullanım analitiği toplamıyoruz. Cihazınızdan dışarıya hiçbir şifrelenmemiş veri sızmaz.</p><p><strong>2. Yerel Şifreli Depolama</strong><br>Şifre kasanız, cihazınızın yerel güvenli sandbox dosya sisteminde (Origin Private File System / OPFS) askeri düzey AES-256-GCM ve Argon2id algoritmasıyla şifrelenmiş bir SQLite veritabanı olarak saklanır.</p><p><strong>3. Çerezler ve Yerel Depolama</strong><br>Bu web sitesi, yalnızca dil ve tema (Aydınlık/Karanlık) tercihlerinizi cihazınızda saklamak için yerel depolamayı (localStorage) kullanır. Üçüncü taraf takip veya reklam çerezleri kullanılmamaktadır.</p><p><strong>4. Ağ Erişimi</strong><br>Uygulama, ağ erişimini sınırlandıran \"Air-Gap\" ağ politikası ile çalışır. İnternet erişimi olmadan yerel olarak güvenle kullanılabilir.</p>",
      // Dynamic strings
      "pass": " Geçiş",
      "billion-times": " Milyar Kat",
      "trillion-times": " Trilyon Kat",
      "instant": "Anında",
      "sec": " sn",
      "min": " dk",
      "hr": " saat",
      "day": " gün",
      "years": " yıl",
      "million-years": " milyon yıl",
      "billion-years": " milyar yıl",
      "trillion-years": " trilyon yıl",
      "v-weak": "Çok Zayıf",
      "weak": "Zayıf",
      "medium": "Orta",
      "strong": "Güçlü",
      "excellent": "Mükemmel",
      "copied": "Kopyalandı!",
      "copy": "Kopyala",
      "placeholder": "Şifrenizi buraya girin...",
      "detected-os": "sisteminiz algılandı",
      "detecting-os": "İşletim sisteminiz algılanıyor..."
    },
    en: {
      "nav-security": "Security",
      "nav-features": "Features",
      "nav-comparison": "Comparison",
      "nav-demo": "Password Audit",
      "nav-download": "Download",
      "nav-cta": "Download",
      "hero-badge": "<span class=\"live-dot\"></span> Version 7.0.1 — Live",
      "hero-title": "Your Data Is Safe<br>Only <span class=\"gradient-text\">On Your Device</span>.",
      "hero-desc": "AegisVault 7 is a local-first and open-source password manager with a zero-knowledge security architecture, requiring no internet connection or third-party cloud providers.",
      "hero-btn-dl": "Download Installer",
      "hero-btn-git": "Explore on GitHub",
      "hero-platform": "Detecting your operating system...",
      "float-badge-title-enc": "Encryption",
      "float-badge-title-status": "Status",
      "float-badge-val-status": "Offline Vault",
      "trust-label-tests": "Tests Passed",
      "trust-label-strength": "Encryption Strength",
      "trust-label-leaks": "Data Leaks",
      "trust-label-open": "Open Source",
      "sec-eyebrow": "Security Architecture",
      "sec-title": "Unshakable Cryptographic Protection",
      "sec-desc": "Your data is encrypted directly on your device using top-tier cryptographic algorithms. Accessing your database without your master password is theoretically impossible.",
      "sec-c1-title": "AES-256-GCM",
      "sec-c1-desc": "Each data record (passwords, cards, notes) is isolated and protected by the authenticated and integrity-checked AES-GCM 256-bit symmetric encryption algorithm.",
      "sec-c1-tag": "Military Grade",
      "sec-c2-title": "Argon2id KDF",
      "sec-c2-desc": "Your master password is derived using the memory-hard Argon2id KDF, which is the industry standard against hardware cracking and brute-force attacks.",
      "sec-c2-tag": "Key Derivation",
      "sec-c3-title": "Zero Knowledge",
      "sec-c3-desc": "Plaintext data or keys never leave your local device. All verification and decryption occur entirely within your browser or Tauri's secure local sandbox.",
      "sec-c3-tag": "Zero-Knowledge",
      "sim-title": "Argon2id KDF <span class=\"gradient-text\">Workload Calculator</span>",
      "sim-desc": "Simulate the derivation difficulty of your master password. Increase the Argon2id parameters used by AegisVault to observe resistance against brute-force attacks live.",
      "sim-lbl-mem": "Allocated Memory (Memory)",
      "sim-lbl-iter": "Iterations (Passes)",
      "sim-metric-cost": "GPU Attack Cost",
      "sim-metric-delay": "Derivation Delay (CPU)",
      "sim-info-note": "💡 AegisVault defaults to <strong>128 MB Memory</strong> and <strong>4 Iterations</strong>. These premium parameters multiply the cracking cost on attackers' GPU rigs by over 50,000x without causing noticeable delay on standard client CPUs.",
      "flow-title": "Aegis Cryptographic Flow",
      "flow-s1-title": "Master Password",
      "flow-s1-desc": "Your master password is typed in and immediately parsed into a byte array.",
      "flow-s2-title": "Argon2id KDF",
      "flow-s2-desc": "The 128MB / 4 passes KDF derives the KEK (Key Encryption Key).",
      "flow-s3-title": "Decrypt DEK",
      "flow-s3-desc": "Using KEK, the AES-GCM encrypted database key (DEK) is decrypted.",
      "flow-s4-title": "SQLite / OPFS",
      "flow-s4-desc": "The decrypted DEK is held in WebCrypto to query the sandboxed SQLite DB inside OPFS.",
      "flow-s5-title": "Memory Cleanup",
      "flow-s5-desc": "On lock, the password and KEK are fully zeroized in RAM (Uint8Array.fill(0)).",
      "feat-eyebrow": "Features",
      "feat-title": "Powerful, Flexible, and Uncompromising",
      "feat-desc": "An architecture that simplifies daily tasks without compromising strict security boundaries.",
      "feat-c1-title": "Local-First: SQLite & OPFS Sandbox",
      "feat-c1-desc": "Your data is stored in your browser's sandboxed Origin Private File System (OPFS) using SQLite, not on remote cloud servers. Fully functional offline, with absolute data ownership.",
      "feat-c2-title": "Secure Browser Integration",
      "feat-c2-desc": "Complete integration with Chrome and Firefox. Unlike others, it uses <strong>Native Messaging</strong> to bind directly to the Tauri Rust core. No open local ports or WebSocket vulnerabilities.",
      "feat-c3-title": "Air-Gap Network Policy",
      "feat-c3-desc": "The app runs inside a strictly sandboxed container that blocks all unexpected outbound networking. Maximum isolation from leaks.",
      "feat-c4-title": "Built-in TOTP Authenticator",
      "feat-c4-desc": "Generate and auto-fill temporary time-based dynamic 2FA codes aligned with RFC 6238 without requiring external apps.",
      "feat-c5-title": "Biometric Unlock Support",
      "feat-c5-desc": "Quickly unlock your vault using native biometric hardware via Windows Hello, FaceID, or fingerprint scanners.",
      "comp-eyebrow": "Comparison Matrix",
      "comp-title": "Why AegisVault is Different",
      "comp-desc": "Compare AegisVault 7's core security metrics against standard cloud-based managers and traditional offline solutions.",
      "comp-th-criteria": "Security & Architectural Criteria",
      "comp-th-aegis": "AegisVault 7",
      "comp-th-cloud": "Cloud-Based Managers",
      "comp-th-offline": "Traditional Offline Tools",
      "comp-r1-c1": "Storage Architecture",
      "comp-r1-c2": "Local Sandbox (SQLite & OPFS)",
      "comp-r1-c3": "Centralized Cloud Database",
      "comp-r1-c4": "Local Binary File (OS Dependent)",
      "comp-r2-c1": "KDF Workload & Resistance",
      "comp-r2-c2": "Argon2id (128MB / 4 passes)",
      "comp-r2-c3": "Low Iterations PBKDF2",
      "comp-r2-c4": "AES-KDF or Light Argon2d",
      "comp-r3-c1": "Local Port / WebSocket Attack Surface",
      "comp-r3-c2": "None (Native Messaging)",
      "comp-r3-c3": "None (Web API)",
      "comp-r3-c4": "Yes (Port 19455/Localhost)",
      "comp-r4-c1": "In-Memory Plaintext Protection",
      "comp-r4-c2": "Uint8Array Wiping (Zeroize)",
      "comp-r4-c3": "Variable (GC/Immutable Strings)",
      "comp-r4-c4": "Variable / Client Dependent",
      "comp-r5-c1": "Network Access Policies",
      "comp-r5-c2": "Air-Gap with Dynamic Whitelisting (Optional E2EE Sync)",
      "comp-r5-c3": "Permanent Remote Sync",
      "comp-r5-c4": "User / Firewall Dependent",
      "comp-r6-c1": "IV / Nonce Generation Standard",
      "comp-r6-c2": "SP 800-38D Counter-Based",
      "comp-r6-c3": "Random (Collision Risks)",
      "comp-r6-c4": "Random or Static",
      "demo-eyebrow": "Live Demo",
      "demo-title": "Audit Your Password with Aegis Guard",
      "demo-desc": "Test AegisVault 7's built-in \"Aegis Guard\" security audit engine live. Calculate your master password's cracking entropy.",
      "demo-left-title": "Password <span class=\"gradient-text\">Auditor</span>",
      "demo-label-pwd": "Password to Audit",
      "demo-metric-class": "Security Class",
      "demo-metric-entropy": "Entropy Value",
      "demo-metric-crack": "Est. Crack Time",
      "demo-checklist-title": "Aegis Guard Checklist",
      "demo-chk-len": "At least 12 characters long",
      "demo-chk-upper": "Contains uppercase (A-Z)",
      "demo-chk-lower": "Contains lowercase (a-z)",
      "demo-chk-num": "Contains number (0-9)",
      "demo-chk-spec": "Contains special char (!@#$%^&*)",
      "demo-note": "Aegis Guard evaluates password strength based on algorithmic entropy (character sets) rather than simple text length.",
      "dl-eyebrow": "Download Center",
      "dl-title": "Get AegisVault 7",
      "dl-desc": "Select the ideal client package for your operating system and claim absolute data sovereignty today.",
      "dl-tab-desktop": "Desktop",
      "dl-tab-extensions": "Extensions",
      "dl-tab-mobile": "Mobile",
      "dl-c1-title": "Windows (x64)",
      "dl-c1-desc": "Tauri-based native installer MSI or standalone portable executable.",
      "dl-c1-link1": "AegisVault_7.0.1_x64.msi <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"><polyline points=\"12 5 19 12 12 19\"></svg>",
      "dl-c1-link2": "Portable Executive (.exe) <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"><polyline points=\"12 5 19 12 12 19\"></svg>",
      "dl-c2-title": "macOS (Universal)",
      "dl-c2-desc": "Universal DMG installer bundle supporting Apple Silicon (M1/M2/M3) and Intel CPUs.",
      "dl-c2-link1": "AegisVault_7.0.1_universal.dmg <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"><polyline points=\"12 5 19 12 12 19\"></svg>",
      "dl-c3-title": "Linux",
      "dl-c3-desc": "Native Debian package or standalone AppImage file.",
      "dl-c3-link1": "AegisVault_7.0.1_amd64.deb <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"><polyline points=\"12 5 19 12 12 19\"></svg>",
      "dl-c3-link2": "AegisVault_7.0.1.AppImage <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"><polyline points=\"12 5 19 12 12 19\"></svg>",
      "dl-cli-header": "Windows Winget Install",
      "dl-cli-copy": "Copy",
      "dl-c4-title": "Google Chrome",
      "dl-c4-desc": "One-click safe installation from the Chrome Web Store.",
      "dl-c4-link1": "Chrome Web Store <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"><polyline points=\"12 5 19 12 12 19\"></svg>",
      "dl-c5-title": "Mozilla Firefox",
      "dl-c5-desc": "AMO signed extension package for secure browser filling.",
      "dl-c5-link1": "Firefox Add-ons <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"><polyline points=\"12 5 19 12 12 19\"></svg>",
      "dl-c6-title": "Android",
      "dl-c6-desc": "Native autofill service backed by hardware Keystore.",
      "dl-c6-span": "Coming Soon (Play Store / APK)",
      "dl-c7-title": "iOS",
      "dl-c7-desc": "Secure iOS client backed by Apple Keychain and FaceID.",
      "dl-c7-span": "Coming Soon (App Store)",
      "footer-brand-desc": "Next-generation secure vault developed with zero-knowledge, offline-first architectural principles.",
      "footer-col1-title": "Product",
      "footer-col2-title": "Security",
      "footer-col3-title": "Links",
      "footer-link-audit": "Audit Report",
      "footer-link-crypto": "Cryptography Specs",
      "footer-link-source": "Source Code",
      "footer-link-terms": "Terms of Use",
      "footer-link-privacy": "Privacy Policy",
      "footer-link-support": "Support Desk",
      "footer-copy": "&copy; 2026 AegisVault. All Rights Reserved.",
      "footer-link-cookies": "Cookie Preferences",
      "cookie-title": "Cookie Preferences",
      "cookie-desc": "AegisVault uses cookies and local storage to store your local language and theme preferences on your device. We respect your privacy and never track or sell your data.",
      "cookie-opt-essential-title": "Essential Cookies",
      "cookie-opt-essential-desc": "Required for language preference, theme choice, and core features. Cannot be turned off.",
      "cookie-opt-always-active": "Always Active",
      "cookie-opt-analytics-title": "Analytics Cookies",
      "cookie-opt-analytics-desc": "Allows anonymous measurement of web traffic and performance characteristics.",
      "cookie-opt-marketing-title": "Marketing Cookies",
      "cookie-opt-marketing-desc": "Used to present custom announcements and feature updates.",
      "cookie-btn-save": "Save Preferences",
      "cookie-btn-accept": "Accept All",
      "qlt-eyebrow": "Quality & Test Assurance",
      "qlt-title": "Rigorously Tested with 95%+ Coverage",
      "qlt-desc": "All cryptographic operations, data migration protocols, and user interface states in AegisVault 7 are continuously validated by over 750 automated unit tests.",
      "qlt-metric-statements": "Statements",
      "qlt-metric-branches": "Branches",
      "qlt-metric-functions": "Functions",
      "qlt-card1-title": "Statement Coverage",
      "qlt-card1-desc": "The percentage of executable code statements executed during test suites.",
      "qlt-card2-title": "Branch Coverage",
      "qlt-card2-desc": "The percentage of logical if-else decision paths validated by tests.",
      "qlt-card3-title": "Function Coverage",
      "qlt-card3-desc": "The percentage of declared JavaScript/TypeScript functions fully tested.",
      "qlt-board-badge": "Unit Tests (Vitest)",
      "qlt-board-pass": "Tests Passed",
      "qlt-board-summary": "Test Files: 101 passed · Test Count: 754 passed · Duration: 24.32s",
      "qlt-more-tests": "... 96 more test files completed successfully.",
      "terms-title": "Terms of Use",
      "terms-content": "<p><strong>1. Acceptance of Terms</strong><br>AegisVault 7 is a proprietary, local-first credentials manager. By using this website or application, you agree to comply with these terms.</p><p><strong>2. Responsibility & Key Custody</strong><br>AegisVault operates on a zero-knowledge security architecture. Your master password and cryptographic keys are never sent to or stored on our servers. If you lose your master password, it is technically impossible for us to recover your data. You are solely responsible for maintaining backup copies of your database.</p><p><strong>3. Disclaimer of Warranty</strong><br>The software is provided \"as is\", without warranty of any kind. The developers shall not be liable for any direct or indirect data loss, security breach, or damages arising from the use of this software.</p><p><strong>4. Proprietary License (All Rights Reserved)</strong><br>All intellectual property rights and copyrights for AegisVault 7 belong solely to the developer. Users are granted a limited, non-transferable, and non-commercial license for personal use only. Copying, modifying, redistributing, selling, sublicensing, decompiling, or reverse-engineering the software or its source code without prior written consent from the copyright holder is strictly prohibited.</p>",
      "privacy-title": "Privacy Policy",
      "privacy-content": "<p><strong>1. Non-Collection of Personal Data</strong><br>AegisVault 7 is built with privacy by design. We do not collect, monitor, track, or share any personal information, passwords, vault metadata, or usage analytics.</p><p><strong>2. Local Encrypted Storage</strong><br>Your credentials database is stored purely locally on your device's sandboxed Origin Private File System (OPFS) as an encrypted SQLite database using AES-256-GCM and Argon2id KDF.</p><p><strong>3. Local Storage & Cookies Usage</strong><br>This landing page uses browser local storage (localStorage) exclusively to persist your theme choice and language selection. No third-party tracking, profiling, or advertising cookies are utilized.</p><p><strong>4. Network Isolation</strong><br>The application enforces an \"Air-Gap\" network policy, meaning it restricts outbound telemetry and operates completely isolated from external networks.</p>",
      // Dynamic strings
      "pass": " Passes",
      "billion-times": " Billionx",
      "trillion-times": " Trillionx",
      "instant": "Instant",
      "sec": " sec",
      "min": " min",
      "hr": " hr",
      "day": " days",
      "years": " years",
      "million-years": " million years",
      "billion-years": " billion years",
      "trillion-years": " trillion years",
      "v-weak": "Very Weak",
      "weak": "Weak",
      "medium": "Medium",
      "strong": "Strong",
      "excellent": "Excellent",
      "copied": "Copied!",
      "copy": "Copy",
      "placeholder": "Enter your password here...",
      "detected-os": "system detected",
      "detecting-os": "Detecting your operating system..."
    },
    zh: {
      "nav-security": "安全架构",
      "nav-features": "核心功能",
      "nav-comparison": "对比矩阵",
      "nav-demo": "密码审计",
      "nav-download": "获取下载",
      "nav-cta": "下载",
      "hero-badge": "<span class=\"live-dot\"></span> 版本 7.0.1 — 已发布",
      "hero-title": "您的敏感数据<br>仅在<span class=\"gradient-text\">您的设备上</span>安全。",
      "hero-desc": "AegisVault 7 是一款本地优先且开源的密码和凭据管理器。采用零知识安全架构设计，无需任何互联网连接或第三方云服务提供商。",
      "hero-btn-dl": "下载安装程序",
      "hero-btn-git": "GitHub 源码库",
      "hero-platform": "正在检测您的操作系统...",
      "float-badge-title-enc": "加密技术",
      "float-badge-title-status": "运行状态",
      "float-badge-val-status": "本地物理隔离",
      "trust-label-tests": "单元测试通过",
      "trust-label-strength": "加密强度",
      "trust-label-leaks": "数据泄露概率",
      "trust-label-open": "开源代码",
      "sec-eyebrow": "安全架构",
      "sec-title": "坚不可摧的密码学防护",
      "sec-desc": "您的数据使用顶级密码学算法直接在本地设备上进行加密。在没有主密码的情况下，解密数据库在数学上是完全不可能的。",
      "sec-c1-title": "AES-256-GCM",
      "sec-c1-desc": "数据库中的每一行数据（密码、卡片、笔记）都使用经过身份验证且具有完整性校验的 AES-256-GCM 对称算法进行单独加密保护。",
      "sec-c1-tag": "军工级对称加密",
      "sec-c2-title": "Argon2id KDF",
      "sec-c2-desc": "主密码采用防 ASIC 芯片及硬件暴力破解的行业标准 Argon2id 算法进行强硬的密钥拉伸推导。",
      "sec-c2-tag": "密钥派生算法",
      "sec-c3-title": "零知识体系",
      "sec-c3-desc": "明文数据、主密码及密钥绝不会离开本地。所有加密、解密及凭证校验均在本地 Tauri 或浏览器沙箱中执行。",
      "sec-c3-tag": "零知识证明",
      "sim-title": "Argon2id KDF <span class=\"gradient-text\">复杂度模拟器</span>",
      "sim-desc": "实时模拟主密码的拉伸推导难度。通过调整 AegisVault 的 Argon2id 参数，直观观察其对暴力破解攻击的防御倍数。",
      "sim-lbl-mem": "分配内存大小 (Memory)",
      "sim-lbl-iter": "迭代次数 (Iterations)",
      "sim-metric-cost": "GPU 暴力破解难度",
      "sim-metric-delay": "解密拉伸延迟 (CPU)",
      "sim-info-note": "💡 AegisVault 默认配置为 <strong>128 MB 内存</strong> 及 <strong>4 次迭代</strong>。这些高级参数能阻滞和惩罚 GPU 算力集群高达 50,000 倍以上，而标准主控 CPU 仅有约 280 毫秒 of 延迟。",
      "flow-title": "Aegis 密码学数据流向",
      "flow-s1-title": "主密码输入",
      "flow-s1-desc": "用户输入主密码，并在内存中即时转换为字节序列 (Uint8Array)。",
      "flow-s2-title": "Argon2id KDF",
      "flow-s2-desc": "执行 128MB / 4轮推导，派生出 KEK (密钥加密密钥)。",
      "flow-s3-title": "解密数据库密钥",
      "flow-s3-desc": "使用 KEK 解密 AES-GCM 封装的数据库加密密钥 (DEK)。",
      "flow-s4-title": "SQLite / OPFS",
      "flow-s4-desc": "解密后的 DEK 存放在 WebCrypto 容器中，用于安全读写 OPFS 沙箱内的 SQLite 文件。",
      "flow-s5-title": "内存清零",
      "flow-s5-desc": "锁定瞬间，主密码及 KEK 所在的内存区域立即执行零值填充 (Zeroize)。",
      "feat-eyebrow": "核心功能",
      "feat-title": "强悍、灵活且绝不妥协",
      "feat-desc": "在提供无缝的日常自动填充与存储体验的同时，坚守最高标准的安全红线。",
      "feat-c1-title": "本地优先：SQLite 与 OPFS 沙箱",
      "feat-c1-desc": "数据存放于现代浏览器 Origin Private File System 隔离沙箱内的 SQLite 库中，不依赖任何第三方远程云服务。断网无忧，绝对拥有权。",
      "feat-c2-title": "无缝且安全的浏览器集成",
      "feat-c2-desc": "适配 Chrome 与 Firefox。与竞品不同的是，它通过 <strong>Native Messaging</strong> 直接与 Tauri 桌面端会话交互，无需开启任何本地端口或面临 WebSocket 监听攻击风险。",
      "feat-c3-title": "物理隔离网络策略",
      "feat-c3-desc": "应用默认运行在无网沙箱中，严格过滤并阻断非预期的网络请求，杜绝任何隐蔽通道泄露路径。",
      "feat-c4-title": "内置 TOTP 双重验证器",
      "feat-c4-desc": "遵循 RFC 6238 规范，自动算写和一键填充双重验证 (2FA) 动态码，无需依赖 Google Authenticator 等外部应用。",
      "feat-c5-title": "原生生物特征解锁",
      "feat-c5-desc": "集成 Windows Hello、FaceID 或指纹模块，通过底层安全硬件接口秒级解锁加密库。",
      "comp-eyebrow": "对比矩阵",
      "comp-title": "为什么选择 AegisVault？",
      "comp-desc": "通过客观、严苛的安全架构标准，将 AegisVault 7 与典型云端及传统离线工具进行对比。",
      "comp-th-criteria": "安全与架构评估维度",
      "comp-th-aegis": "AegisVault 7",
      "comp-th-cloud": "云端密码管理器",
      "comp-th-offline": "传统离线管理器",
      "comp-r1-c1": "数据存储架构",
      "comp-r1-c2": "本地沙箱 (SQLite & OPFS)",
      "comp-r1-c3": "中心化云端数据库",
      "comp-r1-c4": "本地二进制文件 (依赖系统权限)",
      "comp-r2-c1": "KDF 类型及抗破性",
      "comp-r2-c2": "Argon2id (128MB / 4 passes)",
      "comp-r2-c3": "低迭代次数 PBKDF2",
      "comp-r2-c4": "AES-KDF 或轻量级 Argon2d",
      "comp-r3-c1": "本地开放端口 / 监听面",
      "comp-r3-c2": "无 (Native Messaging)",
      "comp-r3-c3": "无 (Web API 交互)",
      "comp-r3-c4": "存在端口监听 (Port 19455)",
      "comp-r4-c1": "内存明文驻留防泄露",
      "comp-r4-c2": "Uint8Array 瞬时零值覆盖 (Zeroize)",
      "comp-r4-c3": "未知 (依赖宿主垃圾回收机制)",
      "comp-r4-c4": "未知 / 客户端行为不一",
      "comp-r5-c1": "应用网络访问限制",
      "comp-r5-c2": "动态白名单物理隔离 (可选 E2EE 同步)",
      "comp-r5-c3": "永久保持联网长连接",
      "comp-r5-c4": "用户定义 / 依赖外部防火墙",
      "comp-r6-c1": "IV / Nonce 派生随机性",
      "comp-r6-c2": "NIST SP 800-38D 计数器标准",
      "comp-r6-c3": "常规伪随机数 (有碰撞隐患)",
      "comp-r6-c4": "常规随机数 或 静态硬编码",
      "demo-eyebrow": "在线演示",
      "demo-title": "Aegis Guard 密码安全审计",
      "demo-desc": "体验 AegisVault 7 独创的 \"Aegis Guard\" 安全审计算法。实时测算主密码的熵值及暴力破解的时间级别。",
      "demo-left-title": "密码 <span class=\"gradient-text\">安全审计</span>",
      "demo-label-pwd": "待测密码字符串",
      "demo-metric-class": "安全级别",
      "demo-metric-entropy": "信息熵估值",
      "demo-metric-crack": "抗破解时间评估",
      "demo-checklist-title": "Aegis Guard 优化指标",
      "demo-chk-len": "长度至少 12 位",
      "demo-chk-upper": "包含大写字母 (A-Z)",
      "demo-chk-lower": "包含小写字母 (a-z)",
      "demo-chk-num": "包含数字字符 (0-9)",
      "demo-chk-spec": "包含特殊字符 (!@#$%^&*)",
      "demo-note": "Aegis Guard 依靠信息熵模型（即实际字符空间与长度乘积）来量化破译成本，而非简单的长度判断。",
      "dl-eyebrow": "获取渠道",
      "dl-title": "下载 AegisVault 7",
      "dl-desc": "选择适配您硬件平台的客户端包，立刻开启自主、隔离 of 数字资产保护。",
      "dl-tab-desktop": "桌面版",
      "dl-tab-extensions": "浏览器插件",
      "dl-tab-mobile": "移动端",
      "dl-c1-title": "Windows (x64)",
      "dl-c1-desc": "基于 Tauri 开发的原生 MSI 安装包或绿色版单文件程序。",
      "dl-c1-link1": "AegisVault_7.0.1_x64.msi <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"><polyline points=\"12 5 19 12 12 19\"></svg>",
      "dl-c1-link2": "绿色版程序 (.exe) <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"><polyline points=\"12 5 19 12 12 19\"></svg>",
      "dl-c2-title": "macOS (Universal)",
      "dl-c2-desc": "通用 DMG 安装包，兼容 Apple Silicon M 系列芯片及 Intel CPU。",
      "dl-c2-link1": "AegisVault_7.0.1_universal.dmg <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"><polyline points=\"12 5 19 12 12 19\"></svg>",
      "dl-c3-title": "Linux",
      "dl-c3-desc": "Debian/Ubuntu 的 DEB 文件或通用 AppImage 单文件。",
      "dl-c3-link1": "AegisVault_7.0.1_amd64.deb <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"><polyline points=\"12 5 19 12 12 19\"></svg>",
      "dl-c3-link2": "AegisVault_7.0.1.AppImage <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"><polyline points=\"12 5 19 12 12 19\"></svg>",
      "dl-cli-header": "Windows Terminal (winget) 命令行安装",
      "dl-cli-copy": "复制",
      "dl-c4-title": "Google Chrome",
      "dl-c4-desc": "一键前往 Chrome Web Store 官方应用店安装。",
      "dl-c4-link1": "谷歌浏览器商店 <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"><polyline points=\"12 5 19 12 12 19\"></svg>",
      "dl-c5-title": "Mozilla Firefox",
      "dl-c5-desc": "从 Firefox AMO 官方扩展库获取签名插件。",
      "dl-c5-link1": "火狐浏览器商店 <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"><polyline points=\"12 5 19 12 12 19\"></svg>",
      "dl-c6-title": "Android",
      "dl-c6-desc": "集成系统级 AutofillService 并与底层 Keystore 硬件绑定的原生版本。",
      "dl-c6-span": "敬请期待 (Google Play / APK)",
      "dl-c7-title": "iOS",
      "dl-c7-desc": "集成 iOS FaceID 接口与 Keychain 本地存储的苹果移动端版本。",
      "dl-c7-span": "敬请期待 (App Store)",
      "footer-brand-desc": "零知识、本地优先架构理念下开发的新一代高强度离线口令保管箱。",
      "footer-col1-title": "产品",
      "footer-col2-title": "安全审计",
      "footer-col3-title": "快速链接",
      "footer-link-audit": "独立审计报告",
      "footer-link-crypto": "密码学技术说明",
      "footer-link-source": "开源源码仓库",
      "footer-link-terms": "使用服务条款",
      "footer-link-privacy": "隐私保护政策",
      "footer-link-support": "客户支持反馈",
      "footer-copy": "&copy; 2026 AegisVault。保留所有权利。",
      "footer-link-cookies": "Cookie 偏好设置",
      "cookie-title": "Cookie 偏好设置",
      "cookie-desc": "AegisVault 使用 Cookie 和本地存储在您的设备上保存本地语言和主题首选项。我们尊重您的隐私，绝不跟踪或出售您的数据。",
      "cookie-opt-essential-title": "必要 Cookie",
      "cookie-opt-essential-desc": "语言偏好、主题选择和核心功能正常运行所必需。无法关闭。",
      "cookie-opt-always-active": "始终激活",
      "cookie-opt-analytics-title": "分析 Cookie",
      "cookie-opt-analytics-desc": "用于匿名统计和分析网站流量与页面性能。",
      "cookie-opt-marketing-title": "营销 Cookie",
      "cookie-opt-marketing-desc": "用于向您展示定制的公告和最新功能通知。",
      "cookie-btn-save": "保存设置",
      "cookie-btn-accept": "接受全部",
      "qlt-eyebrow": "质量与测试保障",
      "qlt-title": "严苛测试与 95%+ 代码覆盖率",
      "qlt-desc": "AegisVault 7 中的所有加密操作、数据迁移协议以及用户界面状态，均通过 750 多个自动单元测试进行持续验证。",
      "qlt-metric-statements": "语句",
      "qlt-metric-branches": "分支",
      "qlt-metric-functions": "函数",
      "qlt-card1-title": "语句覆盖率 (Statements)",
      "qlt-card1-desc": "单元测试套件执行期间运行的可执行代码语句的百分比。",
      "qlt-card2-title": "分支覆盖率 (Branches)",
      "qlt-card2-desc": "经测试验证的 if-else 逻辑判定和决策分支路径百分比。",
      "qlt-card3-title": "函数覆盖率 (Functions)",
      "qlt-card3-desc": "应用中所有声明的 JavaScript/TypeScript 函数被完整执行测试的百分比。",
      "qlt-board-badge": "单元测试 (Vitest)",
      "qlt-board-pass": "通过测试",
      "qlt-board-summary": "测试套件：101 通过 · 测试案例：754 通过 · 耗时：24.32 秒",
      "qlt-more-tests": "... 另外 96 个测试套件已成功运行完毕。",
      "terms-title": "使用条款",
      "terms-content": "<p><strong>1. 条款确认</strong><br>AegisVault 7 常见于专有的、本地优先的密码及凭据管理器。使用本网站或应用程序即表示您同意并接受本服务条款。</p><p><strong>2. 密钥自托管责任</strong><br>AegisVault 基于零知识安全架构构建。您的主密码和加密密钥绝不会发送或存储在我们的服务器上。如果您丢失了主密码，我们在技术上无法恢复您的任何数据。您须自行承担备份数据库的全部责任。</p><p><strong>3. 免责声明</strong><br>本软件按“原样”提供，不提供任何明示或暗示的保证。对于因使用本软件而导致的任何直接或间接数据丢失、安全漏洞或损失，开发者概不承担任何责任。</p><p><strong>4. 专有许可（保留所有权利）</strong><br>AegisVault 7 软件的所有知识产权及版权均归开发者所有。用户仅获得受限制的、不可转让的、非商业性的个人使用许可。严禁在未经版权持有人事先书面同意的情况下复制、修改、分发、销售、分许可、编译或反向工程本软件及其源代码。</p>",
      "privacy-title": "隐私权政策",
      "privacy-content": "<p><strong>1. 无数据收集原则</strong><br>AegisVault 7 采用隐私设计。我们绝不收集、监控、跟踪或分享您的任何个人信息、主密码、密码库元数据或任何使用行为分析指标。</p><p><strong>2. 本地物理加密存储</strong><br>您的密码保险箱数据库完全保存在您本地设备的 Origin Private File System (OPFS) 浏览器隔离沙箱中，使用 AES-256-GCM 和 Argon2id 算法进行本地加密。</p><p><strong>3. 本地存储与 Cookie 规则</strong><br>本网站使用浏览器本地存储 (localStorage) 仅为了保存您的语言偏好和主题（亮色/暗色）首选项。绝无任何第三方定位跟踪、用户画像分析或广告投放 Cookie。</p><p><strong>4. 网络物理隔离</strong><br>本应用强制执行“Air-Gap”物理隔离网络安全策略，限制任何隐蔽的外发请求，并完全在没有网络访问的环境下安全工作。</p>",
      // Dynamic strings
      "pass": " 次迭代",
      "billion-times": " 十亿倍",
      "trillion-times": " 万亿倍",
      "instant": "立即破解",
      "sec": " 秒",
      "min": " 分钟",
      "hr": " 小时",
      "day": " 天",
      "years": " 年",
      "million-years": " 百万年",
      "billion-years": " 十亿年",
      "trillion-years": " 万亿年",
      "v-weak": "极度脆弱",
      "weak": "较弱",
      "medium": "中等强度",
      "strong": "高强度",
      "excellent": "极其坚固",
      "copied": "已复制!",
      "copy": "复制",
      "placeholder": "在这里输入您的密码...",
      "detected-os": "检测到您的系统",
      "detecting-os": "正在检测您的操作系统..."
    }
  };

  /* ═══════════════════════════════════════════
     LANGUAGE SYSTEM CONTROLLER
     ═══════════════════════════════════════════ */
  const langBtn = document.getElementById('lang-btn');
  const langDropdownMenu = document.getElementById('lang-dropdown-menu');
  const activeLangText = document.getElementById('active-lang-text');
  const langMenuItems = document.querySelectorAll('.lang-menu-item');

  // Determine browser fallback or load from localStorage
  const getBrowserLang = () => {
    try {
      const userLang = navigator.language || navigator.userLanguage;
      const code = userLang.toLowerCase().split('-')[0];
      return ['en', 'tr', 'zh'].includes(code) ? code : 'en';
    } catch (e) {
      return 'en';
    }
  };

  let currentLang = safeLocalStorage.getItem('lang') || getBrowserLang();

  // Async function to auto-detect language based on IP geolocation (Cloudflare secure trace)
  const detectRegionLanguage = async () => {
    // If the user has already manually set a language preference, do not override it
    if (safeLocalStorage.getItem('lang')) {
      return;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3-second timeout

      const res = await fetch('https://www.cloudflare.com/cdn-cgi/trace', {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error('Network response from Cloudflare was not ok');
      const text = await res.text();
      const lines = text.split('\n');
      const locLine = lines.find(line => line.startsWith('loc='));
      if (locLine) {
        const country = locLine.split('=')[1].trim().toUpperCase();
        let detectedLang = 'en'; // default fallback for other regions
        if (country === 'TR') {
          detectedLang = 'tr';
        } else if (country === 'CN') {
          detectedLang = 'zh';
        }

        if (detectedLang !== currentLang) {
          currentLang = detectedLang;
          translatePage();
        }
      }
    } catch (err) {
      console.warn('IP-based language detection failed, utilizing browser fallback:', err);
    }
  };

  // Helper to translate key
  const t = (key) => {
    return (translations[currentLang] && translations[currentLang][key]) || key;
  };

  // Switch translations on UI
  const translatePage = () => {
    try {
      // Set html lang attribute
      document.documentElement.setAttribute('lang', currentLang);
      
      // Update active dropdown text
      if (activeLangText) {
        activeLangText.textContent = currentLang.toUpperCase();
      }
      
      // Update dropdown menu active states
      langMenuItems.forEach(item => {
        item.classList.toggle('active', item.dataset.lang === currentLang);
      });

      // Translate all static nodes with data-i18n
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const val = t(key);
        if (val !== key) {
          el.innerHTML = val;
        }
      });

      // Update password input placeholder
      const pwdInputEl = document.getElementById('pwd-input');
      if (pwdInputEl) {
        pwdInputEl.placeholder = t('placeholder');
      }

      // Refresh OS detection label translation
      updateOSLabel();

      // Re-run dynamic calculators with translated labels
      updateKDFSimulator();
      if (pwdInputEl && pwdInputEl.value) {
        pwdInputEl.dispatchEvent(new Event('input'));
      }


    } catch (err) {
      console.error('Translation error:', err);
    }
  };

  // Toggle Language Dropdown
  if (langBtn && langDropdownMenu) {
    langBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = langBtn.getAttribute('aria-expanded') === 'true';
      langBtn.setAttribute('aria-expanded', !isExpanded);
      langDropdownMenu.classList.toggle('show');
    });

    // Close dropdown when selecting language
    langMenuItems.forEach(item => {
      item.addEventListener('click', () => {
        const selectedLang = item.dataset.lang;
        currentLang = selectedLang;
        safeLocalStorage.setItem('lang', selectedLang);
        
        translatePage();
        
        langBtn.setAttribute('aria-expanded', 'false');
        langDropdownMenu.classList.remove('show');
      });
    });

    // Close language dropdown if clicking outside
    document.addEventListener('click', (e) => {
      if (!langBtn.contains(e.target)) {
        langBtn.setAttribute('aria-expanded', 'false');
        langDropdownMenu.classList.remove('show');
      }
    });
  }

  /* ═══════════════════════════════════════════
     THEME CONTROLLER (LIGHT/DARK)
     ═══════════════════════════════════════════ */
  try {
    const htmlEl = document.documentElement;
    const themeToggleBtn = document.getElementById('theme-toggle');
    
    const savedTheme = safeLocalStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
    
    htmlEl.setAttribute('data-theme', initialTheme);

    window.currentParticleColor = initialTheme === 'light' ? 'rgba(71, 85, 105,' : 'rgba(148, 163, 184,';
    window.currentConnectionColor = initialTheme === 'light' ? 'rgba(79, 70, 229,' : 'rgba(99, 102, 241,';

    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        const activeTheme = htmlEl.getAttribute('data-theme');
        const targetTheme = activeTheme === 'light' ? 'dark' : 'light';
        
        htmlEl.setAttribute('data-theme', targetTheme);
        safeLocalStorage.setItem('theme', targetTheme);
        
        window.currentParticleColor = targetTheme === 'light' ? 'rgba(71, 85, 105,' : 'rgba(148, 163, 184,';
        window.currentConnectionColor = targetTheme === 'light' ? 'rgba(79, 70, 229,' : 'rgba(99, 102, 241,';
      });
    }
  } catch (err) {
    console.error('Theme controller initialization failed:', err);
  }

  /* ═══════════════════════════════════════════
     PARTICLE SYSTEM (THEME AWARE)
     ═══════════════════════════════════════════ */
  try {
    const canvas = document.getElementById('particle-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      let particles = [];
      let w, h, mouse = { x: -1000, y: -1000 };

      const resize = () => {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
      };
      resize();
      window.addEventListener('resize', resize);

      window.addEventListener('mousemove', e => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
      });

      window.addEventListener('mouseleave', () => {
        mouse.x = -1000;
        mouse.y = -1000;
      });

      class Particle {
        constructor() { this.reset(); }
        reset() {
          this.x = Math.random() * w;
          this.y = Math.random() * h;
          this.size = Math.random() * 1.5 + 0.5;
          this.speedX = (Math.random() - 0.5) * 0.25;
          this.speedY = (Math.random() - 0.5) * 0.25;
          this.opacity = Math.random() * 0.35 + 0.1;
        }
        update() {
          this.x += this.speedX;
          this.y += this.speedY;
          
          const dx = mouse.x - this.x;
          const dy = mouse.y - this.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            this.x -= dx * 0.006;
            this.y -= dy * 0.006;
            this.opacity = Math.min(this.opacity + 0.02, 0.55);
          } else {
            this.opacity += (0.15 - this.opacity) * 0.005;
          }
          
          if (this.x < 0 || this.x > w || this.y < 0 || this.y > h) this.reset();
        }
        draw() {
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
          const colorPart = window.currentParticleColor || 'rgba(148, 163, 184,';
          ctx.fillStyle = `${colorPart} ${this.opacity})`;
          ctx.fill();
        }
      }

      const count = Math.min(Math.floor((w * h) / 13000), 100);
      for (let i = 0; i < count; i++) particles.push(new Particle());

      const drawConnections = () => {
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 110) {
              ctx.beginPath();
              ctx.moveTo(particles[i].x, particles[i].y);
              ctx.lineTo(particles[j].x, particles[j].y);
              const colorConn = window.currentConnectionColor || 'rgba(99, 102, 241,';
              ctx.strokeStyle = `${colorConn} ${0.05 * (1 - dist / 110)})`;
              ctx.lineWidth = 0.45;
              ctx.stroke();
            }
          }
        }
      };

      const animate = () => {
        ctx.clearRect(0, 0, w, h);
        particles.forEach(p => { p.update(); p.draw(); });
        drawConnections();
        requestAnimationFrame(animate);
      };
      animate();
    }
  } catch (err) {
    console.error('Particle system canvas animation failed:', err);
  }

  /* ═══════════════════════════════════════════
     NAVBAR SCROLL EFFECT
     ═══════════════════════════════════════════ */
  try {
    const nav = document.getElementById('main-nav');
    window.addEventListener('scroll', () => {
      if (nav) {
        nav.classList.toggle('scrolled', window.scrollY > 50);
      }
    });
  } catch (err) {
    console.error('Navbar scroll listener binding failed:', err);
  }

  /* ═══════════════════════════════════════════
     SCROLL REVEAL (IntersectionObserver)
     ═══════════════════════════════════════════ */
  try {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.reveal, .reveal-children').forEach(el => revealObserver.observe(el));
  } catch (err) {
    console.error('Scroll reveal observer failed:', err);
  }

  /* ═══════════════════════════════════════════
     COUNTER ANIMATION (trust strip)
     ═══════════════════════════════════════════ */
  try {
    const animateCounter = (el) => {
      const target = parseInt(el.dataset.count, 10);
      const suffix = el.dataset.suffix || '';
      const duration = 2000;
      const start = performance.now();
      
      const tick = (now) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 4); // easeOutQuart
        const current = Math.round(eased * target);
        
        let localizedSuffix = suffix;
        if (suffix === ' Bulut') {
          localizedSuffix = currentLang === 'en' ? ' Cloud' : (currentLang === 'zh' ? ' 云端' : ' Bulut');
        }
        
        el.textContent = current.toLocaleString(currentLang === 'zh' ? 'zh-CN' : (currentLang === 'tr' ? 'tr-TR' : 'en-US')) + localizedSuffix;
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.querySelectorAll('[data-count]').forEach(animateCounter);
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    const trustStrip = document.getElementById('trust-strip');
    if (trustStrip) counterObserver.observe(trustStrip);
  } catch (err) {
    console.error('Trust strip counters animator failed:', err);
  }

  /* ═══════════════════════════════════════════
     CARD MOUSE GLOW TRACKING
     ═══════════════════════════════════════════ */
  try {
    document.querySelectorAll('.card').forEach(card => {
      card.addEventListener('mousemove', e => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
        card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
      });
    });
  } catch (err) {
    console.error('Card mouse glow hover trackers failed:', err);
  }

  /* ═══════════════════════════════════════════
     PLATFORM DETECTION
     ═══════════════════════════════════════════ */
  const platformLabel = document.getElementById('platform-label');
  let osName = 'Windows';
  try {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) osName = 'Android';
    else if (/iPad|iPhone|iPod/.test(ua)) osName = 'iOS';
    else if (/Macintosh|Mac OS X/i.test(ua)) osName = 'macOS';
    else if (/Linux/i.test(ua)) osName = 'Linux';
  } catch (err) {
    console.warn('OS checking error:', err);
  }

  function updateOSLabel() {
    if (platformLabel) {
      platformLabel.textContent = `${osName} ${t('detected-os')}`;
    }
  }

  /* ═══════════════════════════════════════════
     INTERACTIVE KDF SIMULATOR LOGIC
     ═══════════════════════════════════════════ */
  const memSlider = document.getElementById('sim-mem-slider');
  const iterSlider = document.getElementById('sim-iter-slider');
  const memVal = document.getElementById('sim-mem-val');
  const iterVal = document.getElementById('sim-iter-val');
  const costVal = document.getElementById('sim-cost-val');
  const delayVal = document.getElementById('sim-delay-val');

  function updateKDFSimulator() {
    try {
      if (!memSlider || !iterSlider) return;
      
      const mem = parseInt(memSlider.value, 10);
      const iter = parseInt(iterSlider.value, 10);
      
      if (memVal) memVal.textContent = `${mem} MiB`;
      if (iterVal) iterVal.textContent = `${iter}${t('pass')}`;
      
      const costFactor = (mem * iter * 134.2) / 10; 
      let costText = '';
      if (costFactor >= 1000) {
        costText = `${(costFactor / 1000).toFixed(1)}${t('trillion-times')}`;
      } else {
        costText = `${costFactor.toFixed(1)}${t('billion-times')}`;
      }
      
      const estimatedDelay = Math.round(55 + (mem * iter * 0.45));
      
      if (costVal) costVal.textContent = costText;
      if (delayVal) delayVal.textContent = `~${estimatedDelay} ms`;
    } catch (err) {
      console.error('KDF workload simulation rendering failed:', err);
    }
  }

  try {
    if (memSlider && iterSlider) {
      memSlider.addEventListener('input', updateKDFSimulator);
      iterSlider.addEventListener('input', updateKDFSimulator);
    }
  } catch (err) {
    console.error('KDF slider events binding failed:', err);
  }

  /* ═══════════════════════════════════════════
     AEGIS GUARD PASSWORD STRENGTH AUDITOR
     ═══════════════════════════════════════════ */
  const pwdInput = document.getElementById('pwd-input');
  const pwdToggle = document.getElementById('pwd-toggle');
  
  const vpsScoreNum = document.getElementById('vps-score-num');
  const vpsProgressBar = document.getElementById('vps-progress-bar');
  const metricScore = document.getElementById('metric-score');
  const metricEntropy = document.getElementById('metric-entropy');
  const metricCrack = document.getElementById('metric-crack');
  
  const chkLen = document.getElementById('chk-len');
  const chkUpper = document.getElementById('chk-upper');
  const chkLower = document.getElementById('chk-lower');
  const chkNum = document.getElementById('chk-num');
  const chkSpec = document.getElementById('chk-spec');

  try {
    if (pwdToggle && pwdInput) {
      pwdToggle.addEventListener('click', () => {
        const isPassword = pwdInput.type === 'password';
        pwdInput.type = isPassword ? 'text' : 'password';
        pwdToggle.innerHTML = isPassword
          ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
          : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
      });
    }
  } catch (err) {
    console.error('Password toggle click binding failed:', err);
  }

  const resetMetrics = () => {
    if (vpsScoreNum) vpsScoreNum.textContent = '—';
    if (vpsProgressBar) {
      vpsProgressBar.style.strokeDashoffset = '251.2';
      vpsProgressBar.style.stroke = 'rgba(255, 255, 255, 0.1)';
    }
    if (metricScore) { metricScore.textContent = '—'; metricScore.style.color = ''; }
    if (metricEntropy) metricEntropy.textContent = `0 bit`;
    if (metricCrack) { metricCrack.textContent = '—'; metricCrack.style.color = ''; }
    
    [chkLen, chkUpper, chkLower, chkNum, chkSpec].forEach(el => {
      if (el) el.classList.remove('checked');
    });
  };

  const analyzePassword = (pwd) => {
    let pool = 0;
    const checks = {
      len: pwd.length >= 12,
      upper: /[A-Z]/.test(pwd),
      lower: /[a-z]/.test(pwd),
      num: /[0-9]/.test(pwd),
      spec: /[^a-zA-Z0-9]/.test(pwd)
    };

    if (checks.lower) pool += 26;
    if (checks.upper) pool += 26;
    if (checks.num) pool += 10;
    if (checks.spec) pool += 33;
    if (pool === 0) pool = 1;

    const entropy = Math.round(pwd.length * Math.log2(pool));
    const GPU_RATE = 1e11;
    const attempts = Math.pow(2, entropy);
    const secs = attempts / GPU_RATE;

    let timeText = t('instant');
    if (secs >= 1) {
      if (secs < 60) timeText = `${Math.round(secs)}${t('sec')}`;
      else if (secs < 3600) timeText = `${Math.round(secs / 60)}${t('min')}`;
      else if (secs < 86400) timeText = `${Math.round(secs / 3600)}${t('hr')}`;
      else if (secs < 31536000) timeText = `${Math.round(secs / 86400)}${t('day')}`;
      else {
        const years = secs / 31536000;
        if (years > 1e12) timeText = `${(years / 1e12).toFixed(1)}${t('trillion-years')}`;
        else if (years > 1e9) timeText = `${(years / 1e9).toFixed(1)}${t('billion-years')}`;
        else if (years > 1e6) timeText = `${(years / 1e6).toFixed(1)}${t('million-years')}`;
        else timeText = `${Math.round(years).toLocaleString(currentLang === 'zh' ? 'zh-CN' : (currentLang === 'tr' ? 'tr-TR' : 'en-US'))}${t('years')}`;
      }
    }

    let vps = 0;
    if (pwd.length > 0) {
      vps += Math.min(pwd.length * 4, 45);
      let criteriaMet = 0;
      if (checks.upper) criteriaMet++;
      if (checks.lower) criteriaMet++;
      if (checks.num) criteriaMet++;
      if (checks.spec) criteriaMet++;
      vps += criteriaMet * 10;
      
      if (entropy >= 80) vps += 15;
      else if (entropy >= 50) vps += 10;
      else if (entropy >= 30) vps += 5;
      
      vps = Math.min(vps, 100);
    }

    let scoreName = t('v-weak');
    let themeColor = 'var(--accent-rose)'; // Red
    
    if (vps >= 90 && pwd.length >= 12) {
      scoreName = t('excellent');
      themeColor = 'var(--accent-emerald)'; // Emerald
    } else if (vps >= 70) {
      scoreName = t('strong');
      themeColor = 'var(--accent-cyan)'; // Cyan
    } else if (vps >= 50) {
      scoreName = t('medium');
      themeColor = 'var(--accent-amber)'; // Amber
    } else if (vps >= 30) {
      scoreName = t('weak');
      themeColor = 'var(--accent-rose)'; // Rose
    }

    return { entropy, timeText, scoreName, themeColor, vps, checks };
  };

  const renderPasswordMetrics = (res) => {
    if (vpsScoreNum) vpsScoreNum.textContent = res.vps;
    
    if (vpsProgressBar) {
      const offset = 251.2 - (251.2 * res.vps) / 100;
      vpsProgressBar.style.strokeDashoffset = offset;
      vpsProgressBar.style.stroke = res.themeColor;
    }

    if (metricScore) {
      metricScore.textContent = res.scoreName;
      metricScore.style.color = res.themeColor;
    }
    if (metricEntropy) metricEntropy.textContent = `${res.entropy} bit`;
    if (metricCrack) {
      metricCrack.textContent = res.timeText;
      metricCrack.style.color = res.themeColor;
    }

    if (chkLen) chkLen.classList.toggle('checked', res.checks.len);
    if (chkUpper) chkUpper.classList.toggle('checked', res.checks.upper);
    if (chkLower) chkLower.classList.toggle('checked', res.checks.lower);
    if (chkNum) chkNum.classList.toggle('checked', res.checks.num);
    if (chkSpec) chkSpec.classList.toggle('checked', res.checks.spec);
  };

  try {
    if (pwdInput) {
      pwdInput.addEventListener('input', e => {
        const val = e.target.value;
        if (!val) {
          resetMetrics();
        } else {
          const result = analyzePassword(val);
          renderPasswordMetrics(result);
        }
      });
      // Initialize empty state
      resetMetrics();
    }
  } catch (err) {
    console.error('Password input auditor binding failed:', err);
  }

  /* ═══════════════════════════════════════════
     DOWNLOAD CENTER TAB TOGGLING
     ═══════════════════════════════════════════ */
  try {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.download-panel-content');

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        tabPanels.forEach(panel => {
          panel.classList.remove('active');
          if (panel.id === `tab-${targetTab}`) {
            panel.classList.add('active');
          }
        });
      });
    });
  } catch (err) {
    console.error('Downloads tab switcher logic failed:', err);
  }

  /* ═══════════════════════════════════════════
      winget CLI COPY BUTTON ACTION
     ═══════════════════════════════════════════ */
  try {
    const copyBtn = document.getElementById('cli-copy-btn');
    const copyBtnText = document.getElementById('copy-btn-text');

    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const codeSnippet = 'winget install AegisVault.AegisVault7';
        navigator.clipboard.writeText(codeSnippet).then(() => {
          if (copyBtnText) copyBtnText.textContent = t('copied');
          copyBtn.style.borderColor = 'var(--accent-emerald)';
          copyBtn.style.color = 'var(--accent-emerald)';
          
          setTimeout(() => {
            if (copyBtnText) copyBtnText.textContent = t('copy');
            copyBtn.style.borderColor = '';
            copyBtn.style.color = '';
          }, 2000);
        }).catch(err => {
          console.error('Kopyalama hatası: ', err);
        });
      });
    }
  } catch (err) {
    console.error('CLI Copy to clipboard failed:', err);
  }

  /* ═══════════════════════════════════════════
     MOBILE NAVIGATION TOGGLE
     ═══════════════════════════════════════════ */
  try {
    const mobileToggle = document.getElementById('nav-mobile-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (mobileToggle && navLinks) {
      mobileToggle.addEventListener('click', () => {
        const isExpanded = mobileToggle.getAttribute('aria-expanded') === 'true';
        mobileToggle.setAttribute('aria-expanded', !isExpanded);
        
        if (navLinks.style.display === 'flex') {
          navLinks.style.display = '';
        } else {
          navLinks.style.display = 'flex';
          navLinks.style.flexDirection = 'column';
          navLinks.style.position = 'absolute';
          navLinks.style.top = '100%';
          navLinks.style.left = '0';
          navLinks.style.right = '0';
          navLinks.style.background = 'var(--bg-surface)';
          navLinks.style.padding = '1.5rem';
          navLinks.style.borderBottom = '1px solid var(--glass-border)';
        }
      });
      
      navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
          navLinks.style.display = '';
          mobileToggle.setAttribute('aria-expanded', 'false');
        });
      });
    }
  } catch (err) {
    console.error('Mobile navigation toggle failed:', err);
  }

  // Run translation rendering on load
  translatePage();

  // Trigger non-blocking IP region detection
  detectRegionLanguage();

  /* ═══════════════════════════════════════════
     COOKIE CONSENT MANAGER
     ═══════════════════════════════════════════ */
  try {
    const cookieBanner = document.getElementById('cookie-banner');
    const saveBtn = document.getElementById('cookie-save-btn');
    const acceptAllBtn = document.getElementById('cookie-accept-all-btn');
    const analyticsCheckbox = document.getElementById('cookie-opt-analytics');
    const marketingCheckbox = document.getElementById('cookie-opt-marketing');
    const settingsLink = document.getElementById('cookie-settings-link');

    // Check if consent has already been given
    const consent = safeLocalStorage.getItem('cookie_consent');

    const showBanner = () => {
      if (cookieBanner) {
        cookieBanner.classList.add('show');
      }
    };

    const hideBanner = () => {
      if (cookieBanner) {
        cookieBanner.classList.remove('show');
      }
    };

    if (!consent) {
      // Delay showing the banner slightly for better entry animation feel
      setTimeout(showBanner, 1000);
    } else {
      // Apply saved preferences to checkboxes if consent exists
      try {
        const prefs = JSON.parse(consent);
        if (analyticsCheckbox) analyticsCheckbox.checked = !!prefs.analytics;
        if (marketingCheckbox) marketingCheckbox.checked = !!prefs.marketing;
      } catch (e) {
        console.warn('Error parsing cookie consent preferences:', e);
      }
    }

    if (acceptAllBtn) {
      acceptAllBtn.addEventListener('click', () => {
        if (analyticsCheckbox) analyticsCheckbox.checked = true;
        if (marketingCheckbox) marketingCheckbox.checked = true;
        
        const prefs = {
          essential: true,
          analytics: true,
          marketing: true,
          timestamp: new Date().toISOString()
        };
        safeLocalStorage.setItem('cookie_consent', JSON.stringify(prefs));
        hideBanner();
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const prefs = {
          essential: true,
          analytics: analyticsCheckbox ? analyticsCheckbox.checked : false,
          marketing: marketingCheckbox ? marketingCheckbox.checked : false,
          timestamp: new Date().toISOString()
        };
        safeLocalStorage.setItem('cookie_consent', JSON.stringify(prefs));
        hideBanner();
      });
    }

    if (settingsLink) {
      settingsLink.addEventListener('click', (e) => {
        e.preventDefault();
        showBanner();
      });
    }
  } catch (err) {
    console.error('Cookie consent manager initialization failed:', err);
  }



});
