/* The translation core, shared by the browser and the page generator.
 *
 * It used to live inside site.js, which made per-locale page generation
 * impossible without either reimplementing it or running all of site.js in a
 * fake browser -- and running all of site.js also injects the theme control,
 * the lightbox and the sticky CTA into the DOM, none of which belong in a
 * generated file because the browser builds them again on load.
 *
 * So this file owns "put a dictionary onto a document", and nothing else. No
 * fetch, no storage, no event wiring: the caller supplies the dictionary and
 * the locale. That is what lets the generator load twelve dictionaries from
 * disk and produce twelve documents with no browser and no network.
 *
 * Loaded before site.js with `defer`, which guarantees this file has run by the
 * time site.js calls into it. site.js keeps its own copy of nothing; if the two
 * ever disagree, scripts/audit-locale-output.cjs compares generated output
 * against a real browser and fails.
 */
(function (global) {
  'use strict';

  /* Digit convention per locale, overriding the engine default.
   *
   * Only Arabic needs an entry, and it needs one because Chromium resolves
   * Intl.NumberFormat('ar') to the `latn` numbering system -- so the badge came
   * out as "2,213" in Arabic script while the sentence around it, and every
   * other Arabic string on the site, is written the way an Arabic reader
   * expects. The dictionary is the authority on how a sentence is written; this
   * formats only the number inside it, and it should not overrule that.
   *
   * Everything else is left to Intl, which is why this is a map rather than a
   * rule: the separator for the other eleven is already correct and varies per
   * locale (a full stop for tr/de/es/it/pt, a comma for en/ja/ko/zh, a narrow
   * no-break space for fr/ru). */
  var NUMBERING_SYSTEMS = { ar: 'arab' };

  var RTL_LOCALES = ['ar'];

  function testCount(doc) {
    var el = doc.querySelector('meta[name="x-test-count"]');
    if (!el) return null;
    var n = parseInt(el.getAttribute('content'), 10);
    return isFinite(n) && n > 0 ? n : null;
  }

  /* useGrouping is deliberately not set.
   *
   * Passing `true` means "always", and it overrides each locale's own
   * minimumGroupingDigits rule -- which is why Spanish and Italian were coming
   * out as "2.213" here while the rest of the number was written the way those
   * languages write a four-digit figure, without a separator. Leaving the
   * option out keeps the default ("auto") and lets the locale answer, which is
   * also the only way to be right across twelve writing systems without
   * maintaining a table of them here. */
  function formatTestCount(n, locale) {
    try {
      return new Intl.NumberFormat(locale, {
        numberingSystem: NUMBERING_SYSTEMS[locale] || 'latn',
      }).format(n);
    } catch (err) {
      // An engine without the numberingSystem option still formats correctly
      // for the other eleven; only Arabic loses its digits.
      try {
        return new Intl.NumberFormat(locale).format(n);
      } catch (err2) {
        return String(n);
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
   *
   * {{TESTCOUNT}} is replaced the same way, from <meta name="x-test-count">.
   * scripts/sync-claims.cjs writes that meta from `vitest list` and CI re-runs
   * it in --check mode, so the claim cannot drift. It is formatted for the
   * active locale because the thousands separator is not the same character in
   * twelve writing systems -- Turkish uses a full stop, English a comma, French
   * a narrow no-break space, and Arabic writes Arabic-Indic digits.
   *
   * If the meta is missing the token is stripped rather than shown: a badge
   * reading "test . 90 kapsam" is wrong, but a page showing the literal text
   * "{{TESTCOUNT}}" is worse, because it looks like a bug to whoever spots it.
   */
  function applyText(doc, node, value, locale) {
    if (typeof value !== 'string') return;

    var version = doc.documentElement.getAttribute('data-site-version') || '';
    if (version) {
      value = value.split('{{VERSION}}').join(version);
    }

    if (value.indexOf('{{TESTCOUNT}}') !== -1) {
      var count = testCount(doc);
      value = count === null
        ? value.split('{{TESTCOUNT}}').join('').replace(/^[\s  ]+/, '')
        : value.split('{{TESTCOUNT}}').join(formatTestCount(count, locale));
    }

    if (/<\/?[a-z][\s\S]*>/i.test(value)) {
      node.innerHTML = value;
    } else {
      node.textContent = value;
    }
  }

  function setDocumentLang(doc, locale) {
    doc.documentElement.setAttribute('lang', locale);
    doc.documentElement.setAttribute('dir', RTL_LOCALES.indexOf(locale) === -1 ? 'ltr' : 'rtl');
  }

  function lookup(ctx, key) {
    if (Object.prototype.hasOwnProperty.call(ctx.dictionary, key)) return ctx.dictionary[key];
    if (Object.prototype.hasOwnProperty.call(ctx.fallbackDictionary, key)) return ctx.fallbackDictionary[key];
    return undefined;
  }

  /* Applies the dictionary to every data-i18n node under `root`.
   *
   * Keys that no dictionary carries are left exactly as they are in the markup,
   * so an untranslated section still reads as the readable default instead of
   * going blank. */
  function translate(doc, root, ctx) {
    var doc_ = root.ownerDocument || doc;
    var nodes = root.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var value = lookup(ctx, nodes[i].getAttribute('data-i18n'));
      if (value !== undefined) applyText(doc_, nodes[i], value, ctx.locale);
    }

    var attrs = root.querySelectorAll('[data-i18n-attr]');
    for (var j = 0; j < attrs.length; j++) {
      // Format: "attribute:key, attribute:key"
      var pairs = attrs[j].getAttribute('data-i18n-attr').split(',');
      for (var k = 0; k < pairs.length; k++) {
        var parts = pairs[k].split(':');
        var attribute = (parts[0] || '').trim();
        var name = (parts[1] || '').trim();
        var attrValue = attribute ? lookup(ctx, name) : undefined;
        if (attribute && attrValue !== undefined) {
          attrs[j].setAttribute(attribute, attrValue);
        }
      }
    }
  }

  global.KalderaShieldTranslate = {
    translate: translate,
    lookup: lookup,
    applyText: applyText,
    setDocumentLang: setDocumentLang,
    formatTestCount: formatTestCount,
    testCount: testCount,
    numberFor: function (locale) {
      return NUMBERING_SYSTEMS[locale] || 'latn';
    },
    isRtl: function (locale) {
      return RTL_LOCALES.indexOf(locale) !== -1;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);