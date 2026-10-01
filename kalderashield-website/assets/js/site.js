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
  /* Dictionary consulted when the active locale has no entry for a key. */
  var FALLBACK_LANG = 'en';
  var THEMES = ['light', 'dark', 'system'];

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

  function pickLanguage() {
    var saved = storedLang();
    if (saved && isKnown(saved)) return saved;

    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    var short = String(nav).toLowerCase().split('-')[0];
    if (isKnown(short)) return short;

    return DEFAULT_LANG;
  }

  function lookup(key) {
    if (Object.prototype.hasOwnProperty.call(dictionary, key)) return dictionary[key];
    if (Object.prototype.hasOwnProperty.call(fallbackDictionary, key)) return fallbackDictionary[key];
    return undefined;
  }

  function translate(root) {
    var nodes = root.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var value = lookup(nodes[i].getAttribute('data-i18n'));
      if (value !== undefined) applyText(nodes[i], value);
    }

    var attrs = root.querySelectorAll('[data-i18n-attr]');
    for (var j = 0; j < attrs.length; j++) {
      // Format: "attribute:key, attribute:key"
      var pairs = attrs[j].getAttribute('data-i18n-attr').split(',');
      for (var k = 0; k < pairs.length; k++) {
        var parts = pairs[k].split(':');
        var attribute = (parts[0] || '').trim();
        var name = (parts[1] || '').trim();
        var attrValue = attribute ? lookup(name) : undefined;
        if (attribute && attrValue !== undefined) {
          attrs[j].setAttribute(attribute, attrValue);
        }
      }
    }
  }

  /* A few strings carry a span so a word can be highlighted, for example
   * "Verileriniz Sadece <span>Sizin Cihazınızda</span> Güvende." Setting
   * textContent would show the tag as literal text, so those need innerHTML.
   * The dictionary is a same-origin file this project publishes, never user
   * input, and it never ships a script tag. Anything without a tag goes
   * through textContent so a stray < in a translation cannot open markup.
   *
   * {{VERSION}} is replaced from the data-site-version attribute on <html>.
   * The version lives in exactly one place so a release does not mean editing
   * the same sentence in twelve translation files.
   */
  function applyText(node, value) {
    if (typeof value !== 'string') return;

    var version = document.documentElement.getAttribute('data-site-version') || '';
    if (version) {
      value = value.split('{{VERSION}}').join(version);
    }

    if (/<\/?[a-z][\s\S]*>/i.test(value)) {
      node.innerHTML = value;
    } else {
      node.textContent = value;
    }
  }

  function setDocumentLang(locale) {
    document.documentElement.setAttribute('lang', locale);
    document.documentElement.setAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr'
    );
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

  function localeUrl(locale) {
    return new URL('assets/js/i18n/' + locale + '.json', siteRoot()).href;
  }

  // Loaded once per page view. The fallback never changes, so re-fetching it on
  // every switch would be the double fetch this file went out of its way to
  // avoid, just spread over the language clicks instead of the initial load.
  var fallbackLoad = null;

  function loadFallbackDictionary() {
    if (!fallbackLoad) {
      fallbackLoad = fetch(localeUrl(FALLBACK_LANG), { credentials: 'omit' })
        .then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.json();
        })
        .catch(function () { return {}; });
    }
    return fallbackLoad;
  }

  function setLanguage(locale) {
    if (!isKnown(locale)) locale = DEFAULT_LANG;
    current = locale;

    // English is loaded alongside every other locale as a fallback dictionary.
    // A key that a translation file does not carry yet then resolves to the
    // English copy instead of leaving the markup default in place, which is
    // what kept newly added sections from reading as untranslated markup in
    // the other ten languages.
    var primary = fetch(localeUrl(locale), { credentials: 'omit' })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .catch(function () { return {}; });

    var fallback = locale === FALLBACK_LANG
      ? Promise.resolve({})
      : loadFallbackDictionary();

    return Promise.all([primary, fallback])
      .then(function (payloads) {
        dictionary = payloads[0] || {};
        fallbackDictionary = payloads[1] || {};

        setDocumentLang(current);
        translate(document);
        // The theme buttons are built before the first fetch resolves, so they
        // need the same pass the rest of the page gets. The control's own
        // summary label is rebuilt here too: applyTheme ran during start(),
        // when the dictionary was still empty and it fell back to Turkish.
        translate(document.getElementById('theme-menu') || document);
        applyTheme(readTheme());
        markActive(current);
      })
      .catch(function () {
        // Leave the markup text in place. A visitor still gets a readable
        // page in the default language rather than a half-translated one.
        setDocumentLang(current);
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
        setLanguage(locale);
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
