# KalderaShield-Website — Profesyonel Uygulama Planı

**Tarih:** 29 Eylül 2026
**Hedef:** `kalderashield-website/` iskeletini, KalderaShield ürününü (hafgit99/kalderashield) profesyonel biçimde tanıtan modern bir statik siteye dönüştürmek.
**Mevcut temel:** Build'siz statik HTML + tek CSS + tek JS + 12 dil `data-i18n`; `{{DOMAIN}}` placeholder sistemi ve rebrand koruma gate'i (`scripts/check-placeholders.cjs`) hazır.

---

## 0. Mevcut Durum Değerlendirmesi

**Güçlü başlangıç (korumalı):**
- Çok sayfalı iskelet: landing + download + 404, temiz URL yapısı
- i18n mimarisi `data-i18n` deseninde kurulmuş (12 dil dosyası mevcut)
- `{{DOMAIN}}` placeholder + `node scripts/check-placeholders.cjs` gate'i — **"Aegis" geçen her yerde başarısız olan** rebrand koruması dâhil
- `security.txt` iskeleti, robots, sitemap, webmanifest mevcut
- `install.sh` mevcut (AegisVault'taki digest-pinned sürümden uyarlanmalı)

**Eksikler / riskler:**
- `assets/css/` ve `assets/js/` **boş** — tüm tasarım katmanı yazılacak
- README "two legal pages" diyor ama **privacy.html / terms.html klasörde yok**
- Repo README'sindeki `Security_Audit-92/100 (A+)` badge'i, aynı README'nin dürüst "bağımsız denetim yok" bildirimiyle **çelişiyor** (AegisVault dersimiz — düzeltilmeli)
- Kritik yol: **{{DOMAIN}} alan adı kararı** — 28 nokta, sitemap, security.txt ve install.sh buna kilitli

---

## 1. Faz 0 — Tasarım Sistemi + İskelet (2-3 gün)

| WP | İş | Not |
|---|---|---|
| 0.1 | **Tasarım token'ları** (`assets/css/site.css`): renk paleti, tipografi ölçeği (clamp ile akışkan), boşluk/radius/gölge token'ları | AegisVault dersleri uygulanır: **tek ana renk ailesi + kısıtlama**, `letter-spacing` değerleri `em` cinsinden, `tabular-nums` sayaçlarda, global `:focus-visible`. Marka rengi önerisi: kaldera/kalkan teması için **çelik mavi-teal** (indigo→blue AegisVault kimliğinden ayrışır) |
| 0.2 | Layout bileşenleri: header/nav, footer, hero grid, section header, kart, chip, modal yok (statik site) | AegisVault'taki `ProgressFill` dersi: JSX yok ama dinamik width yine ref/`setProperty` ile |
| 0.3 | Erişilebilirlik tabanı: skip-link ✓, `prefers-reduced-motion`, `prefers-color-scheme` (açık/koyu token çifti — site `data-theme` hazır), kontrast AA | Açık tema token'ları yazım aşamasında çift set olarak tanımlanır |
| 0.4 | Tipografi: **Outfit (marka) + JetBrains Mono (teknik)** — self-host woff2 (`assets/fonts/`), Google Fonts bağımlılığı yok | Font self-host = CSP tam `'self'`, AegisVault Umami dersinin aynısı |

## 2. Faz 1 — Sayfa İçerikleri (3-4 gün)

| WP | İş | Not |
|---|---|---|
| 1.1 | `index.html` bölümleri: hero ("Sunucu yok. Hesap yok. Yerel kontrol." konumlandırması), güvenlik mimarisi (Argon2id/AES-GCM/per-item key — repo README'deki dürüst dil), eklentiler (MV3), karşılaştırma, SSS | Kaynak gerçek: repo README + docs/. **Aşırı iddia yok** — "military grade", sahte "92/100 A+" yok; "1.800+ test" yerine güncel **2.100+ test** |
| 1.2 | `download/index.html` — platform hub'ı (Windows/Linux/macOS/Android + eklentiler + CLI) + **SHA-256 checksum satırları** (release'ten gerçek digest'lerle, AegisVault deseni) | Release asset'leri v7.0.7.0+ KalderaShield tag'lerinden alınır |
| 1.3 | **privacy.html + terms.html** — README'nin vaat ettiği ama klasörde olmayan iki yasal sayfa | KalderaShield gizlilik metni: **çerezsiz, üçüncü taraf yok** — Umami self-hosted analiz zaten VPS'te var, gerekirse dayandırılır |
| 1.4 | `404.html` zaten var — tasarım token'larına bağlanır | |

## 3. Faz 2 — i18n Mimarisi (2 gün)

| WP | İş | Not |
|---|---|---|
| 2.1 | 12 dil **lazy JSON** olarak (`assets/i18n/<lang>.json`) — runtime küçük loader; **asla tek parça monolit değil** (AegisVault'un 491 KB dersi) | `data-i18n` deseni korunur; loader `fetch('/assets/i18n/'+lang+'.json')` same-origin |
| 2.2 | Dil algılama: `navigator.languages` **yerel, ağsız** (geo-IP yok — sıfır üçüncü taraf çağrı ilkesi) + `?lang=` parametresi + localStorage | |
| 2.3 | `scripts/i18n-audit.cjs`: 12 dil anahtar parity + kullanılmayan anahtar denetimi | CI'da koşar (Faz 4) |

## 4. Faz 3 — Güvenlik Altyapısı (2 gün)

| WP | İş | Not |
|---|---|---|
| 3.1 | nginx vhost şablonu: HSTS (preload), CSP `'self'` (+ self-hosted font), COOP/COEP/CORP, nosniff, referrer, permissions — **`nginx.conf` referans dosyası olarak repoya** | AegisVault'taki onaylı setin kopyası |
| 3.2 | `security.txt` doldurma (Contact, Expires, Policy → kalderashield SECURITY.md) | |
| 3.3 | Umami (mevcut VPS kurulumun) → `stats.` subdomain ya da same-origin proxy ile ölçüm; çerez banner'ı **gerekmez** | Şeffaflık: ayak izinde analytics kullanımı belirtilir |
| 3.4 | `install.sh`: `{{DOMAIN}}` doldurma + **SHA-256 digest pinleme** (AegisVault install.sh deseninin aynısı) | |

## 5. Faz 4 — Performans + Görseller (2 gün)

| WP | İş | Not |
|---|---|---|
| 4.1 | `og-card.png` (1280×640) — AegisVault'taki deseniyle marka kartı; **hem site og:image hem GitHub Social preview** olarak aynı dosya | |
| 4.2 | PWA ikon seti 128/192/512 (paletli optimize) + favicon çoklu-boyut ICO | app-icon kaynak görselden |
| 4.3 | Hero görseli webp; toplam **ilk yükleme < 300 KB** hedefi; sitemap/robots/manifest son kontrol | |

## 6. Faz 5 — CI + Deploy (1-2 gün)

| WP | İş | Not |
|---|---|---|
| 5.1 | `.github/workflows/site.yml`: placeholder gate (`check-placeholders`), i18n parity audit, ölü-link denetimi, HTML doğrulama, Lighthouse bütçe (perf/a11y ≥ 90) | App repo'daki yeni CI disiplinin site versiyonu |
| 5.2 | Deploy işi: `rsync` → VPS `/var/www/kalderashield/` + nginx vhost; **kaldera repo'suna** `site-deploy` commit'i | |
| 5.3 | `KOD_INCELEME` tarzı mini smoke: dosya envanteri + tüm sayfalarda 200 + placeholder taraması | |

## 7. Faz 6 — Launch Kontrol Listesi

- [ ] **Alan adı kararı** (kritik yol: `kalderashield.com` / `.io` / `.dev`?) → 28 `{{DOMAIN}}` noktasını doldur → gate PASS
- [ ] DNS + Let's Encrypt (webroot) + nginx vhost canlı
- [ ] GitHub: repo **Social preview** upload (og-card) + README badge düzeltmesi (`Security_Audit 92/100 A+` badge'i dürüst bildirimle çelişiyor → kaldır veya "internal review" yap)
- [ ] GitHub repo description: zaten güncel ✓
- [ ] AegisVault sitesiyle ilişki kararı: kalderashield yeni ana markaysa aegisvault.xyz'e yönlendirme/duyuru sayfası planı
- [ ] security.txt Expires tarihi takvime

---

## Önerilen Sıra ve Efor

| Faz | Süre | Çıktı |
|---|---|---|
| Faz 0 | 2-3 gün | Tasarım sistemi + iskelet CSS/JS |
| Faz 1 | 3-4 gün | Tüm sayfa içerikleri (TR kaynak) |
| Faz 2 | 2 gün | 12 dil lazy i18n |
| Faz 3 | 2 gün | Güvenlik altyapısı (headers, checksum, install.sh) |
| Faz 4 | 2 gün | Görseller + performans |
| Faz 5 | 1-2 gün | CI + deploy otomasyonu |
| **Toplam** | **~2 hafta** | Launch-ready |

Kritik yol: **alan adı kararı** (Faz 0'ı bloke etmez; Faz 3 sonu / launch öncesi gerekli).

---

## Uygulama İlkeleri (AegisVault'tan taşınan dersler)

1. **Kısıt markadır:** tek renk ailesi, az sayıda bileşen; "cömertlik" güveni seyreltir.
2. **Fail-closed ve doğrulanabilirlik:** her güvenlik iddiasının yanında kanıt (checksum, test sayısı, CI linki).
3. **Sıfır üçüncü taraf:** analytics self-hosted (mevcut Umami), font self-hosted, CSP `'self'`.
4. **Performans bütçesi baştan:** lazy i18n JSON, webp, self-host font — monolit yok.
5. **Her güvenlik metni 12 dilde aynı kalitede** — makine çevirisi tek başına yetmez, dil Başına gözden geçirme.
