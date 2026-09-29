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

  var LANGUAGES = [
    { code: 'tr', label: 'Türkçe' },
    { code: 'en', label: 'English' },
    { code: 'de', label: 'Deutsch' },
    { code: 'fr', label: 'Français' },
    { code: 'es', label: 'Español' },
    { code: 'it', label: 'Italiano' },
    { code: 'pt', label: 'Português' },
    { code: 'ru', label: 'Русский' },
    { code: 'ja', label: '日本語' },
    { code: 'ko', label: '한국어' },
    { code: 'zh', label: '中文' },
    { code: 'ar', label: 'العربية' }
  ];

  var STORAGE_KEY = 'kalderashield.site.lang';
  var DEFAULT_LANG = 'tr';

  var dictionary = {};
  var current = DEFAULT_LANG;

  function isKnown(code) {
    for (var i = 0; i < LANGUAGES.length; i++) {
      if (LANGUAGES[i].code === code) return true;
    }
    return false;
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

  function storeLang(code) {
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch (err) {
      /* see storedLang */
    }
  }

  function pickLanguage() {
    var saved = storedLang();
    if (saved && isKnown(saved)) return saved;

    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    var short = String(nav).toLowerCase().split('-')[0];
    if (isKnown(short)) return short;

    return DEFAULT_LANG;
  }

  function translate(root) {
    var nodes = root.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-i18n');
      if (Object.prototype.hasOwnProperty.call(dictionary, key)) {
        applyText(nodes[i], dictionary[key]);
      }
    }

    var attrs = root.querySelectorAll('[data-i18n-attr]');
    for (var j = 0; j < attrs.length; j++) {
      // Format: "attribute:key, attribute:key"
      var pairs = attrs[j].getAttribute('data-i18n-attr').split(',');
      for (var k = 0; k < pairs.length; k++) {
        var parts = pairs[k].split(':');
        var attribute = (parts[0] || '').trim();
        var name = (parts[1] || '').trim();
        if (attribute && name && Object.prototype.hasOwnProperty.call(dictionary, name)) {
          attrs[j].setAttribute(attribute, dictionary[name]);
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

  function setDocumentLang(code) {
    document.documentElement.setAttribute('lang', code);
    document.documentElement.setAttribute(
      'dir',
      code === 'ar' ? 'rtl' : 'ltr'
    );
  }

  function markActive(code) {
    var buttons = document.querySelectorAll('[data-lang]');
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].getAttribute('data-lang') === code) {
        buttons[i].setAttribute('aria-current', 'true');
      } else {
        buttons[i].removeAttribute('aria-current');
      }
    }
  }

  function buildMenu() {
    var menu = document.getElementById('lang-menu');
    if (!menu) return;

    menu.textContent = '';
    LANGUAGES.forEach(function (language) {
      var button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-lang', language.code);
      button.textContent = language.label;
      button.addEventListener('click', function () {
        setLanguage(language.code);
        var details = button.closest('details');
        if (details) details.open = false;
      });
      menu.appendChild(button);
    });
  }

  function setLanguage(code) {
    if (!isKnown(code)) code = DEFAULT_LANG;
    current = code;

    var url = 'assets/js/i18n/' + code + '.json';
    // Relative to the page, so the same script works from the site root and
    // from /download/ without a second base-path variable.
    url = new URL(url, document.baseURI).href;

    return fetch(url, { credentials: 'omit' })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (data) {
        dictionary = data || {};
        setDocumentLang(current);
        translate(document);
        markActive(current);
      })
      .catch(function () {
        // Leave the markup text in place. A visitor still gets a readable
        // page in the default language rather than a half-translated one.
        setDocumentLang(current);
        markActive(current);
      });
  }

  function start() {
    buildMenu();
    setLanguage(pickLanguage());

    // Opened from a page that is not the site root, the relative path in
    // setLanguage resolves against that page, so normalise before switching.
    document.addEventListener('click', function (event) {
      var trigger = event.target.closest('[data-lang]');
      if (!trigger) return;
      event.preventDefault();
      var code = trigger.getAttribute('data-lang');
      storeLang(code);
      setLanguage(code);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.KalderaShieldI18n = {
    set: setLanguage,
    languages: LANGUAGES
  };
})();
