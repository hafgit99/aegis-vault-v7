document.addEventListener('DOMContentLoaded', () => {
  const safeLocalStorage = {
    getItem(key) {
      try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    setItem(key, value) {
      try { localStorage.setItem(key, value); } catch (e) { }
    }
  };

  const translations = {
    tr: {
      "back-to-home": "← Ana Sayfa",
      "footer-copy": "&copy; 2026 AegisVault. Tüm Hakları Saklıdır.",
      "terms-title": "Kullanım Şartları",
      "terms-content": "<p><strong>1. Kabul Edilmesi</strong><br>AegisVault 7 tescilli ve yerel öncelikli (local-first) bir şifre yöneticisidir. Bu web sitesini veya uygulamayı kullanarak, bu koşulları kabul etmiş olursunuz.</p><p><strong>2. Sorumluluk Sınırları</strong><br>AegisVault sıfır-bilgi (zero-knowledge) güvenlik mimarisiyle çalışır. Master şifreniz veya anahtarlarınız sunucularımıza gönderilmez veya saklanmaz. Şifrenizi kaybetmeniz durumunda verilerinize erişimi kurtarmamız teknik olarak imkansızdır. Veri yedeklerinizin ve anahtar güvenliğinin sorumluluğu tamamen size aittir.</p><p><strong>3. Garanti Yoktur</strong><br>Yazılım \"olduğu gibi\" sunulmaktadır. Kullanımdan doğabilecek doğrudan veya dolaylı veri kaybı ya da güvenlik ihlali gibi zararlardan AegisVault geliştiricileri sorumludur.</p><p><strong>4. Mülkiyet ve Lisans (Tüm Hakları Saklıdır)</strong><br>AegisVault 7 yazılımının tüm fikri mülkiyet ve telif hakları geliştiriciye aittir. Kullanıcılara yalnızca kişisel kullanım için sınırlı, devredilemez ve ticari olmayan bir kullanım lisansı verilir. Yazılımın kaynak kodlarının veya dosyalarının geliştiricinin yazılı izni olmaksızın kopyalanması, değiştirilmesi, dağıtılması, satılması veya tersine mühendislik işlemlerine tabi tutulması kesinlikle yasaktır.</p>",
      "privacy-title": "Gizlilik Politikası",
      "privacy-content": "<p><strong>1. Veri Toplamama İlkesi</strong><br>AegisVault 7 gizlilik odaklı tasarlanmıştır. Hiçbir kişisel veri, şifre, kullanıcı hesabı veya kullanım analitiği toplamıyoruz. Cihazınızdan dışarıya hiçbir şifrelenmemiş veri sızmaz.</p><p><strong>2. Yerel Şifreli Depolama</strong><br>Şifre kasanız, cihazınızın yerel güvenli sandbox dosya sisteminde (Origin Private File System / OPFS) askeri düzey AES-256-GCM ve Argon2id algoritmasıyla şifrelenmiş bir SQLite veritabanı olarak saklanır.</p><p><strong>3. Çerezler ve Yerel Depolama</strong><br>Bu web sitesi, yalnızca dil ve tema (Aydınlık/Karanlık) tercihlerinizi cihazınızda saklamak için yerel depolamayı (localStorage) kullanır. Üçüncü taraf takip veya reklam çerezleri kullanılmamaktadır.</p><p><strong>4. Ağ Erişimi</strong><br>Uygulama, ağ erişimini sınırlandıran \"Air-Gap\" ağ politikası ile çalışır. İnternet erişimi olmadan yerel olarak güvenle kullanılabilir.</p>"
    },
    en: {
      "back-to-home": "← Main Page",
      "footer-copy": "&copy; 2026 AegisVault. All Rights Reserved.",
      "terms-title": "Terms of Use",
      "terms-content": "<p><strong>1. Acceptance of Terms</strong><br>AegisVault 7 is a proprietary, local-first credentials manager. By using this website or application, you agree to comply with these terms.</p><p><strong>2. Responsibility & Key Custody</strong><br>AegisVault operates on a zero-knowledge security architecture. Your master password and cryptographic keys are never sent to or stored on our servers. If you lose your master password, it is technically impossible for us to recover your data. You are solely responsible for maintaining backup copies of your database.</p><p><strong>3. Disclaimer of Warranty</strong><br>The software is provided \"as is\", without warranty of any kind. The developers shall not be liable for any direct or indirect data loss, security breach, or damages arising from the use of this software.</p><p><strong>4. Proprietary License (All Rights Reserved)</strong><br>All intellectual property rights and copyrights for AegisVault 7 belong solely to the developer. Users are granted a limited, non-transferable, and non-commercial license for personal use only. Copying, modifying, redistributing, selling, sublicensing, decompiling, or reverse-engineering the software or its source code without prior written consent from the copyright holder is strictly prohibited.</p>",
      "privacy-title": "Privacy Policy",
      "privacy-content": "<p><strong>1. Non-Collection of Personal Data</strong><br>AegisVault 7 is built with privacy by design. We do not collect, monitor, track, or share any personal information, passwords, vault metadata, or usage analytics.</p><p><strong>2. Local Encrypted Storage</strong><br>Your credentials database is stored purely locally on your device's sandboxed Origin Private File System (OPFS) as an encrypted SQLite database using AES-256-GCM and Argon2id KDF.</p><p><strong>3. Local Storage & Cookies Usage</strong><br>This landing page uses browser local storage (localStorage) exclusively to persist your theme choice and language selection. No third-party tracking, profiling, or advertising cookies are utilized.</p><p><strong>4. Network Isolation</strong><br>The application enforces an \"Air-Gap\" network policy, meaning it restricts outbound telemetry and operates completely isolated from external networks.</p>"
    },
    zh: {
      "back-to-home": "← 返回主页",
      "footer-copy": "&copy; 2026 AegisVault。保留所有权利。",
      "terms-title": "使用条款",
      "terms-content": "<p><strong>1. 条款确认</strong><br>AegisVault 7 常见于专有的、本地优先的密码及凭据管理器。使用本网站或应用程序即表示您同意并接受本服务条款。</p><p><strong>2. 密钥自托管责任</strong><br>AegisVault 基于零知识安全架构构建。您的主密码和加密密钥绝不会发送或存储在我们的服务器上。如果您丢失了主密码，我们在技术上无法恢复您的任何数据。您须自行承担备份数据库的全部责任。</p><p><strong>3. 免责声明</strong><br>本软件按“原样”提供，不提供任何明示或暗示的保证。对于因使用本软件而导致的任何直接或间接数据丢失、安全漏洞或损失，开发者概不承担任何责任。</p><p><strong>4. 专有许可（保留所有权利）</strong><br>AegisVault 7 软件的所有知识产权及版权均归开发者所有。用户仅获得受限制的、不可转让的、非商业性的个人使用许可。严禁在未经版权持有人事先书面同意的情况下复制、修改、分发、销售、分许可、编译或反向工程本软件及其源代码。</p>",
      "privacy-title": "隐私权政策",
      "privacy-content": "<p><strong>1. 无数据收集原则</strong><br>AegisVault 7 采用隐私设计。我们绝不收集、监控、跟踪或分享您的任何个人信息、主密码、密码库元数据或任何使用行为分析指标。</p><p><strong>2. 本地物理加密存储</strong><br>您的密码保险箱数据库完全保存在您本地设备的 Origin Private File System (OPFS) 浏览器隔离沙箱中，使用 AES-256-GCM 和 Argon2id 算法进行本地加密。</p><p><strong>3. 本地存储与 Cookie 规则</strong><br>本网站使用浏览器本地存储 (localStorage) 仅为了保存您的语言偏好和主题（亮色/暗色）首选项。绝无任何第三方定位跟踪、用户画像分析或广告投放 Cookie。</p><p><strong>4. 网络物理隔离</strong><br>本应用强制执行“Air-Gap”物理隔离网络安全策略，限制任何隐蔽的外发请求，并完全在没有网络访问的环境下安全工作。</p>"
    }
  };

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
  const pageType = window.location.pathname.includes('privacy') ? 'privacy' : 'terms';

  const t = (key) => {
    return (translations[currentLang] && translations[currentLang][key]) || key;
  };

  const updatePageLanguage = () => {
    try {
      document.documentElement.setAttribute('lang', currentLang);
      
      const activeLangText = document.getElementById('active-lang-text');
      if (activeLangText) activeLangText.textContent = currentLang.toUpperCase();

      const langMenuItems = document.querySelectorAll('.lang-menu-item');
      langMenuItems.forEach(item => {
        item.classList.toggle('active', item.dataset.lang === currentLang);
      });

      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.innerHTML = t(key);
      });

      const titleEl = document.getElementById('legal-page-title');
      const bodyEl = document.getElementById('legal-page-body');
      
      if (titleEl) titleEl.textContent = t(`${pageType}-title`);
      if (bodyEl) bodyEl.innerHTML = t(`${pageType}-content`);

      // Update document head title
      document.title = `AegisVault 7 — ${t(`${pageType}-title`)}`;

    } catch (e) {
      console.error(e);
    }
  };

  // Language switcher setup
  const langBtn = document.getElementById('lang-btn');
  const langDropdownMenu = document.getElementById('lang-dropdown-menu');
  const langMenuItems = document.querySelectorAll('.lang-menu-item');

  if (langBtn && langDropdownMenu) {
    langBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = langBtn.getAttribute('aria-expanded') === 'true';
      langBtn.setAttribute('aria-expanded', !isExpanded);
      langDropdownMenu.classList.toggle('show');
    });

    langMenuItems.forEach(item => {
      item.addEventListener('click', () => {
        currentLang = item.dataset.lang;
        safeLocalStorage.setItem('lang', currentLang);
        updatePageLanguage();
        langBtn.setAttribute('aria-expanded', 'false');
        langDropdownMenu.classList.remove('show');
      });
    });

    document.addEventListener('click', (e) => {
      if (!langBtn.contains(e.target)) {
        langBtn.setAttribute('aria-expanded', 'false');
        langDropdownMenu.classList.remove('show');
      }
    });
  }

  // Theme switcher setup
  try {
    const htmlEl = document.documentElement;
    const themeToggleBtn = document.getElementById('theme-toggle');
    const savedTheme = safeLocalStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
    
    htmlEl.setAttribute('data-theme', initialTheme);

    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        const activeTheme = htmlEl.getAttribute('data-theme');
        const targetTheme = activeTheme === 'light' ? 'dark' : 'light';
        htmlEl.setAttribute('data-theme', targetTheme);
        safeLocalStorage.setItem('theme', targetTheme);
      });
    }
  } catch (err) {
    console.error(err);
  }

  // Run initial render
  updatePageLanguage();
});
