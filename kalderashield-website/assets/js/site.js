/* KalderaShield site translation loader.
 *
 * A visitor's language is applied without a page reload, and the choice is
 * remembered. Translations live in assets/js/i18n/<lang>.json.
 *
 * Keys come from the data-i18n attribute. Keys that are absent fall back to
 * the text already in the markup, which is Turkish, so a missing translation
 * degrades to readable Turkish rather than to an empty label.
 */

(function () {
  'use strict';

  /* The translation rules, shared with the page generator. Loaded before this
   * file with `defer`. If it is ever missing the site should not silently stop
   * translating, so the failure is loud and early. */
  var KS = window.KalderaShieldTranslate;
  if (!KS) throw new Error('assets/js/i18n-apply.js yuklenmedi');

  /* Endonym plus a two-letter code, not a flag.
   *
   * A country flag was the first instinct and it is the wrong answer twice over.
   * Windows' Segoe UI Emoji ships no country-flag glyphs, so the regional
   * indicator pairs render as the letters in a box -- a Turkish visitor on
   * Edge sees "TR" where a flag should be, and so would anyone on the platform
   * this site is built on. And a flag names a country, while these are
   * languages: Arabic is not one country and Chinese is not either.
   *
   * The endonym is also what a reader can act on. Someone who cannot read the
   * current language still finds their own, which a flag drawn from a
   * nationality they may not identify with would not give them.
   *
   * `code` is the uppercase two-letter form used for the badge. The runtime
   * locale is a separate thing and is lowercased for the JSON path.
   */
  var LANGUAGES = [
    { locale: 'tr', code: 'TR', label: 'Türkçe' },
    { locale: 'en', code: 'EN', label: 'English' },
    { locale: 'de', code: 'DE', label: 'Deutsch' },
    { locale: 'fr', code: 'FR', label: 'Français' },
    { locale: 'es', code: 'ES', label: 'Español' },
    { locale: 'it', code: 'IT', label: 'Italiano' },
    { locale: 'pt', code: 'PT', label: 'Português' },
    { locale: 'ru', code: 'RU', label: 'Русский' },
    { locale: 'ja', code: 'JA', label: '日本語' },
    { locale: 'ko', code: 'KO', label: '한국어' },
    { locale: 'zh', code: 'ZH', label: '中文' },
    { locale: 'ar', code: 'AR', label: 'العربية' }
  ];

  var STORAGE_KEY = 'kalderashield.site.lang';
  var THEME_STORAGE_KEY = 'kalderashield.site.theme';
  var DEFAULT_LANG = 'tr';
  var THEMES = ['light', 'dark', 'system'];

  /* The six-key chrome dictionary, and nothing else. There is no second
     dictionary to fall back on any more: measure-locale-coverage.cjs refuses to
     publish a locale with a missing key, so the fallback had nothing left to
     cover and cost a 130-165 KB fetch on every page view to find out. */
  var dictionary = {};
  var fallbackDictionary = {};
  var current = DEFAULT_LANG;

  function isKnown(locale) {
    for (var i = 0; i < LANGUAGES.length; i++) {
      if (LANGUAGES[i].locale === locale) return true;
    }
    return false;
  }

  function entryFor(locale) {
    for (var i = 0; i < LANGUAGES.length; i++) {
      if (LANGUAGES[i].locale === locale) return LANGUAGES[i];
    }
    return null;
  }

  function storedLang() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      // Private browsing and blocked storage both throw here. Neither is
      // worth failing the page over.
      return null;
    }
  }

  function storeLang(locale) {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch (err) {
      /* see storedLang */
    }
  }

  /* ---------- theme ----------
   *
   * The stylesheet already had both palettes: dark on :root, and a
   * prefers-color-scheme block for light. What was missing was a way for a
   * visitor to overrule the operating system, which is the one thing a
   * three-way control is for -- someone on a dark OS reading a light-mode site
   * by daylight, or the reverse at night.
   *
   * "system" is not a fourth value bolted on afterwards: it is the absence of
   * an override, so the media query keeps working on its own and the site
   * follows a mid-session OS change. An explicit light or dark pins
   * color-scheme and wins over the query.
   */
  function readTheme() {
    var stored = null;
    try {
      stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch (err) {
      /* see storedLang */
    }
    return THEMES.indexOf(stored) >= 0 ? stored : 'system';
  }

  function applyTheme(theme) {
    var root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }

    var controls = document.querySelectorAll('[data-theme-choice]');
    for (var i = 0; i < controls.length; i++) {
      if (controls[i].getAttribute('data-theme-choice') === theme) {
        controls[i].setAttribute('aria-current', 'true');
      } else {
        controls[i].removeAttribute('aria-current');
      }
    }

    // The closed control names the current choice, so the setting is readable
    // without opening the menu. Replaced wholesale because the label comes
    // from the dictionary and has to follow the page language.
    var summary = document.querySelectorAll('[data-theme-current]');
    var key = 'theme-' + theme;
    for (var j = 0; j < summary.length; j++) {
      var label = lookup(key);
      summary[j].textContent = label !== undefined ? label : THEMES_LABELS_FALLBACK[theme];
    }

    // The summary is icon-only on screen: the glyph mirrors the mode (system,
    // light, dark) and the aria-label carries the name for assistive tech.
    var glyphs = { system: '◐', light: '☀', dark: '☾' };
    var glyphNodes = document.querySelectorAll('.theme-glyph');
    for (var g = 0; g < glyphNodes.length; g++) {
      glyphNodes[g].textContent = glyphs[theme] || '◐';
    }
  }

  function storeTheme(theme) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (err) {
      /* see storedLang */
    }
  }

  /* Declared before buildThemeControl, which reads it. `var` hoists the binding
   * but not the assignment, so a script injected after DOMContentLoaded would
   * otherwise call start() while this is still undefined.
   */
  var THEMES_LABELS_FALLBACK = {
    light: 'Açık',
    dark: 'Koyu',
    system: 'Sistem'
  };

  function buildThemeControl() {
    var group = document.getElementById('theme-menu');
    if (!group) return;

    group.textContent = '';
    THEMES.forEach(function (theme) {
      var button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-theme-choice', theme);
      button.className = 'theme-choice';
      button.setAttribute('data-i18n', 'theme-' + theme);
      // Filled in by translate() from the dictionary; the text here is the
      // Turkish fallback for a visitor whose locale has not loaded yet.
      button.textContent = THEMES_LABELS_FALLBACK[theme];
      button.addEventListener('click', function () {
        storeTheme(theme);
        applyTheme(theme);
        var details = button.closest('details');
        if (details) details.open = false;
      });
      group.appendChild(button);
    });
  }

  /* The locale named by the address, or null when the page is unprefixed.
   *
   * Every language has its own URL now, so the address decides the language.
   * Before this, a visitor's stored choice or their browser language decided
   * it -- which meant /de/download/ could render in Turkish and a link to it
   * meant nothing to anybody but the sender. */
  function localeFromPath() {
    var match = window.location.pathname.match(/^\/([a-z]{2})(?:\/|$)/);
    if (!match) return null;
    return isKnown(match[1]) ? match[1] : null;
  }

  /* The language of the page, taken from the document itself.
   *
   * Every page is written in its own language at build time, so `lang` on <html>
   * is not a starting point to be refined -- it is the answer. The stored
   * preference and the browser's language used to be consulted here, and both
   * are wrong now: a stored "de" with a Turkish page underneath produced a
   * control showing German over Turkish text, and setDocumentLang() then wrote
   * lang="de" onto the Turkish document, which is worse than the cosmetic lie
   * because assistive technology and the hreflang annotations both believe it.
   *
   * The stored preference is not discarded -- the switcher uses it to decide
   * where to send someone who picked a language before. It just no longer
   * decides what a page is. */
  function pickLanguage() {
    var declared = document.documentElement.getAttribute('lang');
    if (declared && isKnown(declared)) return declared;

    var fromUrl = localeFromPath();
    if (fromUrl) return fromUrl;

    return DEFAULT_LANG;
  }

  /* The same page in another language.
   *
   * Switching used to rewrite the text in place and leave the URL alone, which
   * was consistent while there was one URL per page. With per-language addresses
   * it is the opposite: staying on /de/download/ while showing Turkish makes
   * the address a lie, and the visitor cannot copy or share what they are
   * reading. So a switch navigates, and the choice is still remembered for the
   * unprefixed pages, which are the ones that consult storage.
   *
   * The path is rebuilt rather than rewritten in place so that /de/urun/x/ and
   * /urun/x/ both resolve, and so a page that has no localized address yet
   * falls back to the unprefixed one instead of leading nowhere. */
  function pathForLocale(locale) {
    var path = window.location.pathname;
    var fromUrl = localeFromPath();
    if (fromUrl) path = path.slice(('/' + fromUrl).length) || '/';
    return '/' + locale + (path === '/' ? '/' : path);
  }

  /* Navigate to a path on this site, or nowhere.
   *
   * The language switcher is the only caller, and it builds its target from the
   * current pathname -- but the pathname is document text, and assigning
   * document text to location is how a site turns its own markup into an open
   * redirect: a link of the form `javascript:` or `//evil.example` reaching this
   * line would send the visitor off-site, and the address bar would show where
   * they went. CodeQL flags it for the same reason.
   *
   * So the target is parsed as a URL, required to be same-origin, and required
   * to be a plain path. `//host/path` parses as a different origin and is
   * refused; `javascript:` does not parse as http(s) at all and is refused.
   * Anything that fails leaves the visitor where they are, on the page they
   * were reading, which is the only safe default for a language button.
   *
   * The query and fragment of the current address are carried across, because
   * `/de/download/#linux` is a link people copy and dropping the fragment drops
   * the reader on the top of the page instead of the platform they asked for. */
  function navigate(path, search, hash) {
    var next;
    try {
      next = new URL(path, window.location.href);
    } catch (e) {
      return;
    }
    if (next.origin !== window.location.origin) return;
    if (next.protocol !== 'http:' && next.protocol !== 'https:') return;

    // The query and fragment of the *current* address are carried across rather
    // than the ones on `path`, because `path` is built from pathname alone --
    // /de/download/?x=1#linux has to become /ja/download/?x=1#linux, and reading
    // them off the new path would silently drop both.
    window.location.assign(next.pathname + (search || '') + (hash || ''));
  }

  /* The dictionary walk lives in assets/js/i18n-apply.js so the page generator
   * can apply the same translations without running the rest of this file --
   * which also builds the theme control, the lightbox and the sticky CTA, none
   * of which may be baked into a generated file. This file keeps the state and
   * the wiring; the module keeps the rules. */

  function ctx() {
    return { dictionary: dictionary, fallbackDictionary: fallbackDictionary, locale: current };
  }

  function lookup(key) {
    return KS.lookup(ctx(), key);
  }

  function translate(root) {
    KS.translate(document, root, ctx());
  }


  function labelFor(locale) {
    var entry = entryFor(locale);
    return entry ? entry.label : locale;
  }

  function markActive(locale) {
    var buttons = document.querySelectorAll('[data-lang]');
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].getAttribute('data-lang') === locale) {
        buttons[i].setAttribute('aria-current', 'true');
      } else {
        buttons[i].removeAttribute('aria-current');
      }
    }
    // The disclosure used to read "🌐 12" no matter which language was active,
    // so the choice was only visible from inside the open menu. It now carries
    // the endonym, and the badge, so the closed control states the current
    // language the way a select does.
    var entry = entryFor(locale);
    var currentNodes = document.querySelectorAll('[data-lang-current]');
    for (var j = 0; j < currentNodes.length; j++) {
      currentNodes[j].textContent = entry ? entry.label : locale;
    }
    var codeNodes = document.querySelectorAll('[data-lang-code]');
    for (var k = 0; k < codeNodes.length; k++) {
      codeNodes[k].textContent = entry ? entry.code : locale.toUpperCase();
    }
  }

  function buildMenu() {
    var menu = document.getElementById('lang-menu');
    if (!menu) return;

    menu.textContent = '';
    LANGUAGES.forEach(function (language) {
      var button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-lang', language.locale);
      button.className = 'lang-choice';

      // The two halves are separate elements so the code can be a fixed-width
      // badge and the endonym can sit on one baseline beside it. One text node
      // with a separator character would reflow unpredictably across the twelve
      // scripts, and a badge is what carries the visual weight that a flag
      // would otherwise have.
      var code = document.createElement('span');
      code.className = 'lang-code';
      code.textContent = language.code;
      var name = document.createElement('span');
      name.className = 'lang-name';
      name.textContent = language.label;
      button.appendChild(code);
      button.appendChild(name);

      // Only the disclosure is closed here. The language change itself is
      // handled once, by the delegated listener in start(); this used to call
      // setLanguage as well, so every switch fetched the locale twice.
      button.addEventListener('click', function () {
        var details = button.closest('details');
        if (details) details.open = false;
      });
      menu.appendChild(button);
    });
  }

  /* Site root, taken from this script's own URL rather than from the page.
   *
   * It used to be `new URL('assets/js/i18n/' + code + '.json', document.baseURI)`,
   * described as working "from the site root and from /download/". It did not.
   * baseURI on /download/ is /download/, so the request went to
   * /download/assets/js/i18n/tr.json and got a 404 -- the download page's 54
   * translated keys never loaded, in any language, and the page quietly fell
   * back to its hardcoded Turkish while the twelve-language switcher sat in the
   * header looking functional. A missing translation degrades to readable text,
   * which is exactly why this went unnoticed.
   *
   * Resolving against `import.meta`-free script src keeps it correct for a site
   * served from a subdirectory too, which a leading "/" would not.
   */
  function siteRoot() {
    var current = document.currentScript;
    if (current && current.src) {
      // .../assets/js/site.js -> .../
      return new URL('../../', current.src).href;
    }
    // Only reached if the tag is added after parsing; the markup loads this
    // file with a plain src, so this is a safety net, not the normal path.
    return new URL('/', window.location.origin + '/').href;
  }

  /* The runtime loads a six-key dictionary, not the page's 1378-key one.
   *
   * Every page is now written in its own language by scripts/generate-locales.cjs,
   * and scripts/audit-static-i18n.cjs asserts it across all of them. There is
   * therefore no page text left for this file to translate; what it still needs
   * is the theme labels, because the theme control is built here after load and
   * those strings are in no document until it runs.
   *
   * The twelve dictionaries are 130-165 KB. Fetching the page's locale plus the
   * English fallback -- which is what this did, so a missing key would resolve
   * to English -- meant up to about 300 KB per page view to re-apply text that
   * was already correct. chrome/<locale>.json is 2.5 KB for all twelve.
   *
   * The fallback dictionary goes with it. It existed for keys a translation was
   * missing; measure-locale-coverage.cjs refuses to publish a locale with a
   * missing key, so there is nothing left for it to cover. */
  function chromeUrl(locale) {
    return new URL('assets/js/i18n/chrome/' + locale + '.json', siteRoot()).href;
  }

  function setLanguage(locale) {
    if (!isKnown(locale)) locale = DEFAULT_LANG;
    current = locale;

    // One request, six keys. It resolves in a fraction of what two 130-165 KB
    // fetches did, and translate(document) now has nothing to do to the page
    // itself -- which is the point: the page was already written in this
    // language.
    //
    // On failure the theme buttons keep the Turkish fallback text they are
    // created with. Nothing else on the page depends on this dictionary.
    return fetch(chromeUrl(locale), { credentials: 'omit' })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (payload) {
        dictionary = payload || {};
        fallbackDictionary = {};

        // The theme buttons are built before the fetch resolves, so they need
        // their own pass: applyTheme ran during start(), when the dictionary
        // was still empty and the labels fell back to Turkish.
        translate(document.getElementById('theme-menu') || document);
        applyTheme(readTheme());
        markActive(current);
      })
      .catch(function () {
        // The theme buttons keep the fallback text they were created with.
        // Nothing else on the page depends on this dictionary: the page was
        // written in its own language before this file loaded, which is also why
        // `lang` is left exactly as the document has it.
        applyTheme(readTheme());
        markActive(current);
      });
  }

  function start() {
    buildMenu();
    buildThemeControl();
    // Applied before the first paint of the dictionary so a returning visitor
    // who chose a theme does not see a flash of the other one.
    applyTheme(readTheme());
    setLanguage(pickLanguage());

    // One delegated listener for both controls. The buttons themselves only
    // close their disclosure; the change is made here, once, so a language
    // switch fetches its locale a single time.
    document.addEventListener('click', function (event) {
      var langTrigger = event.target.closest('[data-lang]');
      if (langTrigger) {
        event.preventDefault();
        var locale = langTrigger.getAttribute('data-lang');
        storeLang(locale);

        /* A language switch navigates to that language's address.
         *
         * Rewriting the page in place is what this did before each language had
         * a URL. It cannot be kept: the visitor would be reading German at
         * /tr/download/, unable to copy the link, and every crawl of that
         * address would see whatever the renderer's locale happened to be.
         * The address is the record of what the visitor chose, so the button
         * leads there.
         *
         * Turkish is the exception -- it is the unprefixed address -- so
         * switching to Turkish drops the prefix instead of adding /tr/.
         */
        var target;
        if (locale === DEFAULT_LANG) {
          var from = localeFromPath();
          target = from ? window.location.pathname.slice(('/' + from).length) || '/' : null;
        } else {
          target = pathForLocale(locale);
        }

        if (target && target !== window.location.pathname) {
          navigate(target, window.location.search, window.location.hash);
        } else {
          setLanguage(locale);
        }
        return;
      }

      var themeTrigger = event.target.closest('[data-theme-choice]');
      if (themeTrigger) {
        event.preventDefault();
        var theme = themeTrigger.getAttribute('data-theme-choice');
        storeTheme(theme);
        applyTheme(theme);
      }
    });
  }

  /* ---------- header dropdowns ----------
   *
   * The header holds several <details> dropdowns: the product menu, the source
   * menu, the language switcher and the theme switcher. The browser leaves
   * them independent, so two panels could be open at once and nothing ever
   * closed them. Header dropdowns behave as one group instead: opening one
   * closes the others, a click outside the header closes whatever is open,
   * and Escape closes them without moving focus anywhere. */
  function initNavDropdowns() {
    var menus = Array.prototype.slice.call(document.querySelectorAll('.site-nav details'));
    if (!menus.length) return;

    function closeAll(except) {
      for (var i = 0; i < menus.length; i++) {
        if (menus[i] !== except) menus[i].open = false;
      }
    }

    menus.forEach(function (details) {
      details.addEventListener('toggle', function () {
        if (details.open) closeAll(details);
      });
    });

    document.addEventListener('click', function (event) {
      if (!event.target.closest('.site-nav')) closeAll(null);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeAll(null);
    });
  }

  /* The script tag is loaded with `defer`, so the header markup exists by the
   * time this runs. */
  initNavDropdowns();

  /* ---------- evidence counters ----------
   * The stats row counts up once when it scrolls into view. Reduced-motion
   * users (and browsers without IntersectionObserver) see the final numbers
   * immediately. Values render in the page language's digit grouping. */
  function initStatCounters() {
    var nums = document.querySelectorAll('.stat-num[data-count]');
    if (!nums.length) return;

    var reduced = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      for (var i = 0; i < nums.length; i++) {
        nums[i].textContent = Number(nums[i].getAttribute('data-count')).toLocaleString();
      }
      return;
    }

    /* One function per element: a closure built inside the loop over `var`
     * variables would share one `target`/`el` across all counters, and only
     * the last one would ever animate. */
    function runCounter(el) {
      var target = parseInt(el.getAttribute('data-count'), 10) || 0;
      var start = null;
      var DURATION = 900;
      var step = function (ts) {
        if (start === null) start = ts;
        var p = Math.min((ts - start) / DURATION, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased).toLocaleString();
        if (p < 1) window.requestAnimationFrame(step);
      };
      window.requestAnimationFrame(step);
    }

    var observer = new IntersectionObserver(function (entries) {
      for (var k = 0; k < entries.length; k++) {
        if (!entries[k].isIntersecting) continue;
        observer.unobserve(entries[k].target);
        runCounter(entries[k].target);
      }
    }, { threshold: 0.01 });

    for (var j = 0; j < nums.length; j++) observer.observe(nums[j]);
  }

  initStatCounters();

  /* ---------- image lightbox ----------
   * Every evidence screenshot on the site opens enlarged in place: the image
   * itself is the trigger, the backdrop and the × button close it, Escape
   * works too. No third-party script, one overlay reused for all images.
   *
   * The image is scaled to the stage, not merely bounded by it. `max-width:
   * 100%` on its own can only ever shrink, so a screenshot whose file is
   * smaller than the viewport -- the 540x510 extension capture on the autofill
   * page -- opened at its own pixel size, isolated on a dark backdrop, and read
   * as though clicking had made it smaller than the page it came from.
   *
   * Scaling is done here rather than with `object-fit` because the frame
   * (border, radius, drop shadow) belongs on the picture. `contain` would scale
   * the bitmap and then draw that frame around the whole box, framing the empty
   * space beside a wide screenshot.
   */
  function initLightbox() {
    if (document.getElementById('lightbox')) return;
    if (!document.querySelector('.shot, .hero-shot img')) return;

    /* How far past its own resolution an image may be enlarged. Past this the
     * upscale stops being a viewing convenience and starts being an
     * accusation: a screenshot blown up far enough reads as a different,
     * sharper product. These captures are 540px to 1800px wide, so 2x is either
     * unreachable (the stage binds first) or leaves the UI legible. */
    var MAX_UPSCALE = 2;

    var overlay = document.createElement('div');
    overlay.className = 'lightbox';
    overlay.id = 'lightbox';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = '<button type="button" class="lightbox-close" aria-label="Kapat" data-i18n-attr="aria-label:lightbox-close">×</button>' +
      '<div class="lightbox-stage"><img alt=""></div>';
    document.body.appendChild(overlay);

    var stage = overlay.querySelector('.lightbox-stage');
    var img = overlay.querySelector('img');
    var closeBtn = overlay.querySelector('.lightbox-close');
    var lastTrigger = null;

    function fit() {
      var naturalWidth = img.naturalWidth;
      var naturalHeight = img.naturalHeight;
      if (!naturalWidth || !naturalHeight) return;
      if (!stage.clientWidth || !stage.clientHeight) return;

      var scale = Math.min(
        stage.clientWidth / naturalWidth,
        stage.clientHeight / naturalHeight
      );
      scale = Math.min(scale, MAX_UPSCALE);

      img.style.width = Math.round(naturalWidth * scale) + 'px';
      img.style.height = Math.round(naturalHeight * scale) + 'px';
    }

    function open(src, trigger) {
      lastTrigger = trigger || null;
      /* Clear any size left by a previous image, so a re-open that lands before
       * the new file has loaded cannot show the old picture's dimensions. */
      img.style.width = '';
      img.style.height = '';
      img.src = src;
      overlay.hidden = false;
      document.documentElement.style.overflow = 'hidden';
      // The same file twice in a row is already decoded, so load never fires.
      fit();
      closeBtn.focus();
    }

    function close() {
      overlay.hidden = true;
      img.src = '';
      document.documentElement.style.overflow = '';
      /* Hand focus back to whatever opened the overlay, so a keyboard reader is
       * not dropped on <body> and has to walk the page again.
       *
       * The screenshots are pointer-activated and are not focusable, so after a
       * mouse click this is a no-op and focus stays where the browser puts it --
       * which is the pre-existing behaviour, not a regression. It pays off as
       * soon as a page marks its shots focusable, and it costs nothing until
       * then. */
      if (lastTrigger && typeof lastTrigger.focus === 'function') lastTrigger.focus();
      lastTrigger = null;
    }

    img.addEventListener('load', fit);

    // A rotated phone or a resized window must not leave the picture larger
    // than the stage it has to fit inside.
    window.addEventListener('resize', function () {
      if (!overlay.hidden) fit();
    });

    overlay.addEventListener('click', function (event) {
      // The stage is the letterboxed area around the image: clicking it is
      // clicking the backdrop as far as a reader is concerned.
      if (event.target === closeBtn || !event.target.closest('img')) close();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !overlay.hidden) close();
    });

    var shots = document.querySelectorAll('.shot, .hero-shot img');
    for (var i = 0; i < shots.length; i++) {
      shots[i].addEventListener('click', function (event) {
        open(event.currentTarget.getAttribute('src'), event.currentTarget);
      });
    }
  }

  initLightbox();

  /* ---------- scroll reveals ----------
   * Section content fades up the first time it enters the viewport. The
   * .reveal class is added here, not in the markup, so a page without
   * JavaScript never hides content. Reduced-motion users skip the whole
   * mechanism and see everything immediately. */
  function initScrollReveals() {
    var sections = document.querySelectorAll('main section:not(.hero)');
    if (!sections.length) return;

    var reduced = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) return;

    var targets = [];
    for (var s = 0; s < sections.length; s++) {
      var children = sections[s].querySelectorAll('.wrap > *');
      var index = 0;
      for (var c = 0; c < children.length; c++) {
        var el = children[c];
        el.classList.add('reveal');
        /* Short stagger within a section; the modulo keeps long sections
         * (FAQ lists, card grids) from waiting on ever-growing delays. */
        el.style.transitionDelay = (index % 6) * 0.06 + 's';
        index++;
        targets.push(el);
      }
    }

    /* Anything already in or above the viewport at load shows immediately:
     * it never "enters" the viewport, so an observer would never fire for it. */
    function inView(el) {
      return el.getBoundingClientRect().top < window.innerHeight + 60;
    }

    var observer = new IntersectionObserver(function (entries) {
      for (var k = 0; k < entries.length; k++) {
        if (!entries[k].isIntersecting) continue;
        entries[k].target.classList.add('is-visible');
        observer.unobserve(entries[k].target);
      }
    }, { threshold: 0, rootMargin: '0px 0px -30px 0px' });

    for (var t = 0; t < targets.length; t++) {
      if (inView(targets[t])) {
        targets[t].classList.add('is-visible');
      } else {
        observer.observe(targets[t]);
      }
    }

    /* Failsafe: if an observer entry is ever missed (bfcache restore, zoom,
     * unusual viewports), everything in view is force-revealed once, 2.5s
     * after load. Content must never stay invisible. */
    window.setTimeout(function () {
      for (var f = 0; f < targets.length; f++) {
        if (!targets[f].classList.contains('is-visible') && inView(targets[f])) {
          targets[f].classList.add('is-visible');
        }
      }
    }, 2500);
  }

  initScrollReveals();

  /* ---------- mobile navigation ----------
   * The hamburger turns the whole nav into a slide-in panel on small
   * screens. Links inside close it, Escape closes it, and the page behind
   * stops scrolling while it is open. */
  function initNavToggle() {
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.querySelector('.site-nav');
    if (!toggle || !nav) return;

    function setOpen(open) {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.documentElement.style.overflow = open ? 'hidden' : '';
    }

    toggle.addEventListener('click', function () {
      setOpen(!nav.classList.contains('is-open'));
    });

    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && nav.classList.contains('is-open')) setOpen(false);
    });
  }

  initNavToggle();

  /* ---------- sticky download bar ----------
   * Below 768px a fixed bar offers the download from every page. On the
   * homepage that duplicates the closing CTA, so the bar steps aside as soon
   * as the real one scrolls into view -- the reader should never see the same
   * button twice on one screen.
   *
   * The hiding is one class toggle on an existing transition; without
   * IntersectionObserver the bar simply stays, which is the safe direction. */
  function initStickyCta() {
    var bar = document.querySelector('.sticky-cta');
    if (!bar) return;

    /* Watch the buttons, not the whole band. The closing CTA is tall enough
     * that it can be partly on screen while its buttons are still below the
     * fold, and hiding the bar at that point would take away the download the
     * reader is one scroll away from. */
    var closing = document.querySelector('.final-cta .cta-row') || document.querySelector('.final-cta');
    if (!closing || !('IntersectionObserver' in window)) return;

    var observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        bar.classList.toggle('is-hidden', entries[i].isIntersecting);
      }
    }, { threshold: 0.15 });

    observer.observe(closing);
  }

  initStickyCta();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.KalderaShieldI18n = {
    set: setLanguage,
    languages: LANGUAGES,
    theme: {
      get: readTheme,
      set: function (theme) {
        if (THEMES.indexOf(theme) < 0) return;
        storeTheme(theme);
        applyTheme(theme);
      }
    }
  };
})();
