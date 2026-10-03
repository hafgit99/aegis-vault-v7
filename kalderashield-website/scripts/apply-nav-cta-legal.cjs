// One-off: brings the two legal pages and the 404 onto the same header CTA as
// every generated page.
//
// These three carry hand-written nav markup rather than a build-pages marker
// block, so they cannot be regenerated and have to be edited. Run once; the
// audit afterwards is what proves all twenty-four pages agree.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const CTA = `<a class="nav-cta" href="/download/"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5v11"/><path d="M7.5 10.5l4.5 4.5 4.5-4.5"/><path d="M4.5 19.5h15"/></svg><span data-i18n="nav-download">\u0130ndir</span></a>`;

const OLD_LEGAL = `      <a href="/download/" data-i18n="nav-download">\u0130ndir</a>`;

for (const file of ['privacy.html', 'terms.html']) {
  const full = path.join(root, file);
  let html = fs.readFileSync(full, 'utf8');
  if (!html.includes(OLD_LEGAL)) {
    console.log(`${file}: beklenen indir baglantisi bulunamadi, atlandi.`);
    continue;
  }
  html = html.replace(OLD_LEGAL, `      ${CTA}`);
  fs.writeFileSync(full, html, 'utf8');
  console.log(`${file}: indir butonu CTA olarak guncellendi.`);
}

/* The 404 had no header at all -- just a heading and two buttons -- so the claim
 * "the download is in the menu on every page" could not be true of it. It now
 * carries the standard header, and its footer matches the rest of the site
 * instead of being a single line of links. */
const NOT_FOUND = `<!doctype html>
<html lang="tr" dir="ltr" data-site-version="{{VERSION}}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sayfa bulunamadı — KalderaShield</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/assets/favicon.ico" sizes="any">
<link rel="icon" href="/assets/favicon.png" type="image/png">
<link rel="stylesheet" href="/assets/css/site.css">
</head>
<body>

<a class="skip-link" href="#main" data-i18n="skip-link">İçeriğe Geç</a>

<header class="site-header">
  <div class="wrap">
    <a class="brand" href="/">
      <img src="/assets/images/icon-128.png" alt="" width="40" height="40">
      Kaldera<span class="brand-accent">Shield</span>
    </a>

    <nav class="site-nav" id="site-nav">
      <!-- mega:start -->
      ${CTA}
      <!-- mega:end -->
      <details class="lang">
        <summary data-i18n-attr="aria-label:lang-switch-label">
          <span class="lang-code" data-lang-code>TR</span>
          <span data-lang-current>Türkçe</span>
        </summary>
        <div class="lang-menu" id="lang-menu"></div>
      </details>

      <details class="theme">
        <summary data-i18n-attr="aria-label:theme-switch-label">
          <span class="theme-glyph" aria-hidden="true">◐</span>
          <span class="theme-current" data-theme-current data-i18n="theme-system">Sistem</span>
        </summary>
        <div class="theme-menu" id="theme-menu"></div>
      </details>
      <button type="button" class="nav-toggle" aria-expanded="false" aria-controls="site-nav" data-i18n-attr="aria-label:nav-menu-label" aria-label="Menü">
        <span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>
      </button>
    </nav>
  </div>
</header>

<main id="main" class="legal">
  <div class="wrap prose">
    <span class="eyebrow">404</span>
    <h1 data-i18n="d404-title">Aradığınız sayfa taşınmış ya da hiç var olmamış olabilir.</h1>
    <p class="muted" style="margin-top:1rem" data-i18n="d404-desc">Bağlantı yazım hatası olabilir ya da sayfa taşınmış olabilir. Buradan devam edebilirsiniz.</p>
    <div class="cta-row" style="margin-top:1.6rem">
      <a class="btn btn-ghost" href="/" data-i18n="d404-home">Ana sayfa</a>
      <a class="btn btn-primary" href="/download/" data-i18n="hero-btn-dl">Yükleyiciyi İndir</a>
      <a class="btn btn-ghost" href="/sss/" data-i18n="nav-faq">SSS</a>
    </div>
  </div>
</main>

<footer class="site-footer">
  <div class="wrap">
    <div class="cols">
      <div style="max-width:24rem">
        <a class="brand" href="/">
          <img src="/assets/images/icon-128.png" alt="" width="26" height="26">
          KalderaShield
        </a>
        <p class="faint" style="margin-top:.7rem" data-i18n="footer-brand-desc">AES-256-GCM ve Argon2id ile güçlendirilmiş, yerel ve açık kaynaklı yeni nesil sıfır-bilgi şifre yöneticisi.</p>
      </div>

      <div>
        <h2 data-i18n="footer-col1-title">Ürün</h2>
        <ul>
          <li><a href="/#features" data-i18n="nav-features">Özellikler</a></li>
          <li><a href="/guvenlik/" data-i18n="nav-security">Güvenlik</a></li>
          <li><a href="/eklenti/" data-i18n="nav-extensions">Eklentiler</a></li>
          <li><a href="/sss/" data-i18n="nav-faq">SSS</a></li>
          <li><a href="/kaynak-kodu/" data-i18n="footer-link-source">Kaynak Kodları</a></li>
          <li><a href="/download/" data-i18n="nav-download">İndir</a></li>
        </ul>
      </div>

      <div>
        <h2 data-i18n="footer-col3-title">Topluluk</h2>
        <ul>
          <li><a href="https://github.com/hafgit99/kalderashield" rel="noopener noreferrer" data-i18n="footer-link-source">Kaynak Kodları</a></li>
          <li><a href="https://github.com/hafgit99/kalderashield/issues" rel="noopener noreferrer" data-i18n="footer-link-issues">Hata Bildirimi</a></li>
          <li><a href="https://github.com/hafgit99/kalderashield/discussions" rel="noopener noreferrer" data-i18n="footer-link-discussions">Tartışmalar</a></li>
        </ul>
      </div>

      <div>
        <h2 data-i18n="footer-col4-title">Yasal</h2>
        <ul>
          <li><a href="/privacy.html" data-i18n="footer-link-privacy">Gizlilik Politikası</a></li>
          <li><a href="/terms.html" data-i18n="footer-link-terms">Kullanım Şartları</a></li>
          <li><a href="/.well-known/security.txt" rel="noopener noreferrer">security.txt</a></li>
        </ul>
      </div>
    </div>

    <p class="base">
      <span data-i18n="footer-copy">© 2026 KalderaShield. Tüm Hakları Saklıdır.</span>
      <span data-i18n="footer-langs-label">🌍 12 dilde mevcut:</span>
    </p>
  </div>
</footer>

<script src="/assets/js/site.js" defer></script>
</body>
</html>
`;

const notFound = path.join(root, '404.html');
const existing = fs.readFileSync(notFound, 'utf8');
const version = (existing.match(/data-site-version="([^"]+)"/) || [, '7.0.18'])[1];
fs.writeFileSync(notFound, NOT_FOUND.replace(/\{\{VERSION\}\}/g, version), 'utf8');
console.log(`404.html: standart header ve footer eklendi (v${version}).`);