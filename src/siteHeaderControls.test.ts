import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', 'kalderashield-website');
const LOCALES = ['tr', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar'];
const ORIGIN = 'https://site.test';

/* Non-ASCII expectations are written as escapes.
 *
 * The first version of this file compared against "Açık" and "Sprache wählen"
 * as literals, and the write path replaced the non-ASCII code points with "?" --
 * so the test failed asserting on a corrupted expectation and the failure
 * pointed at the site rather than at the test. Türkçe and Русский happened to
 * survive in the same file, which is worse: it makes the corruption look
 * intermittent rather than structural.
 */
const TR = {
  turkce: 'T\u00fcrk\u00e7e',
  system: 'Sistem',
  light: 'A\u00e7\u0131k',
  deutsch: 'Deutsch',
  waehlen: 'Sprache w\u00e4hlen',
  hell: 'Hell',
};

interface Harness {
  window: any;
  document: Document;
  requests: string[];
  /** Addresses the page asked the browser to go to, in order. */
  navigations: string[];
  /** Clicks a control and lets the locale fetch settle. */
  choose(selector: string): Promise<void>;
  close(): void;
}

/**
 * The header controls and the loader, exercised in a real DOM.
 *
 * Three things here cannot be checked by reading, and each shipped broken at
 * least once:
 *
 *   - the locale URL. Resolved against `document.baseURI`, which is the page
 *     rather than the site, so on /download/ it requested
 *     /download/assets/js/i18n/tr.json and got a 404. Fifty-four translated
 *     strings never loaded, in any language, and the page fell back to its
 *     hardcoded Turkish while the switcher sat in the header looking functional.
 *     A missing translation degrades to readable text, which is what hid it.
 *   - the double fetch. buildMenu() called setLanguage per button and start()
 *     had a delegated listener that called it again, so every switch
 *     downloaded the same file twice.
 *   - the theme override. Dark on :root with a prefers-color-scheme block for
 *     light means the operating system wins and a visitor cannot overrule it.
 *
 * Two of the assertions below describe the per-language address scheme rather
 * than the previous single-address one:
 *
 *   - The language comes from the document. Every page is written in its own
 *     language by generate-locales.cjs, so <html lang> is the answer; the stored
 *     preference and navigator.language are not consulted to decide it.
 *   - A switch navigates. jsdom cannot navigate, and location cannot be
 *     redefined on it, so the harness shadows window.location with a proxy that
 *     records the target and forwards everything else. Without that, every
 *     switch would raise "Not implemented: navigation" and assert nothing.
 */

/* chrome/<locale>.json is what the runtime fetches: six keys, not the 1378-key
 * page dictionary. The map is keyed by the exact URL the code builds. */
const chromeDictionaries = new Map(
  LOCALES.map((locale) => [
    `${ORIGIN}/assets/js/i18n/chrome/${locale}.json`,
    JSON.parse(readFileSync(join(SITE, 'assets', 'js', 'i18n', 'chrome', `${locale}.json`), 'utf8')),
  ])
);

interface SeedOptions {
  /** navigator.language / navigator.languages for the fake browser. */
  language?: string;
  /** What is already in localStorage before the page runs. */
  storage?: Record<string, string>;
  /* Which generated page to load, relative to the site root. Every language has
   * its own generated tree, so a German page is de/index.html -- not the Turkish
   * one with lang rewritten, which would still carry Turkish markup and assert
   * nothing about what a German visitor sees. */
  page?: string;
}

function seed(
  url: string,
  {
    language = 'tr-TR',
    storage = {} as Record<string, string>,
    page = 'download/index.html',
  }: SeedOptions = {}
): Promise<Harness> {
  return new Promise((resolve) => {
    const requests: string[] = [];
    const navigations: string[] = [];
    const virtualConsole = new VirtualConsole();
    // jsdom reports the navigation it cannot perform. The switcher is supposed
    // to navigate, so that message is expected here rather than a symptom.
    virtualConsole.on('jsdomError', () => {});
    const markup = readFileSync(join(SITE, ...page.split('/')), 'utf8');
    const dom = new JSDOM(markup, {
      url,
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      virtualConsole,
      beforeParse(window: any) {
        // jsdom reports en-US, which would make "what is the default language"
        // depend on the runner rather than on the code.
        Object.defineProperty(window.navigator, 'language', { value: language, configurable: true });
        Object.defineProperty(window.navigator, 'languages', {
          value: [language],
          configurable: true,
        });
        for (const [key, value] of Object.entries(storage)) {
          window.localStorage.setItem(key, value);
        }
        window.matchMedia = (query: string) => ({
          matches: false,
          media: query,
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
          dispatchEvent: () => false,
        });
        window.fetch = vi.fn(async (input: any) => {
          const requested = String(typeof input === 'object' && 'url' in input ? input.url : input);
          requests.push(requested);
          const body = chromeDictionaries.get(requested);
          if (body === undefined) return { ok: false, status: 404, json: async () => ({}) };
          return { ok: true, status: 200, json: async () => body };
        });
      },
    });

    const window = dom.window as any;

    /* jsdom cannot navigate, and neither `window.location` nor
     * `location.assign` can be redefined: the first is non-configurable and the
     * second is a non-configurable data property, which a Proxy is forbidden to
     * report differently. So site.js is evaluated with a shadowed `window` --
     * a Proxy that forwards everything except `location`, which it replaces with
     * a plain object reading through to the real one and recording `assign`.
     * Without that, every switch raises "Not implemented: navigation" and the
     * assertions below would have nothing to look at.
     */
    const realLocation = window.location;

    // Built once, not per access. A fresh object on every `location` read would
    // give each read its own `pathname`, so a test that staged a hostile address
    // by assigning to it would be writing into an object nobody reads again --
    // the assertion would pass for the wrong reason.
    //
    // `pathname` is a writable shadow because the real one is a getter: the write
    // would otherwise be dropped silently. Everything else reads through.
    let stagedPathname = realLocation.pathname;
    const shadowLocation = {
      get href() { return new URL(stagedPathname, realLocation.href).href; },
      get origin() { return realLocation.origin; },
      get protocol() { return realLocation.protocol; },
      get host() { return realLocation.host; },
      get hostname() { return realLocation.hostname; },
      get port() { return realLocation.port; },
      get pathname() { return stagedPathname; },
      set pathname(value: string) { stagedPathname = String(value); },
      get search() { return realLocation.search; },
      get hash() { return realLocation.hash; },
      assign: (url: string) => { navigations.push(String(url)); },
      replace: (url: string) => { navigations.push(String(url)); },
      reload: () => {},
      toString() { return realLocation.href; },
    };

    const shadowWindow = new Proxy(window, {
      get(target, prop) {
        if (prop === 'location') return shadowLocation;
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set(target, prop, value) {
        return Reflect.set(target, prop, value, target);
      },
    });

    // The Proxy is handed to the evaluated script through a global, because
    // window.eval takes no arguments to forward into the wrapped function.
    (window as any).__kalderashieldProxy = shadowWindow;

    // Loaded the way the markup loads them, and in that order: site.js throws at
    // start without the translation core, which is what that guard is for.
    const core = window.document.createElement('script');
    core.src = `${ORIGIN}/assets/js/i18n-apply.js`;
    window.document.head.appendChild(core);
    window.eval(readFileSync(join(SITE, 'assets', 'js', 'i18n-apply.js'), 'utf8'));

    // Loaded the way the markup loads it, so document.currentScript resolves
    // the site root from a real /assets/js/ src instead of the fallback.
    const script = window.document.createElement('script');
    script.src = `${ORIGIN}/assets/js/site.js`;
    window.document.head.appendChild(script);
    window.eval(
      'window.__kalderashieldShadow = window.__kalderashieldProxy;\n' +
        '(function (window) {\n' +
        readFileSync(join(SITE, 'assets', 'js', 'site.js'), 'utf8') +
        '\n}).call(window, window.__kalderashieldShadow);'
    );

    const settle = async () => {
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    };

    // jsdom fires DOMContentLoaded itself once parsing finishes; start() must
    // run from that alone. Dispatching it by hand as well ran start() twice and
    // produced a double fetch that looked like a product bug and was not.
    window.document.addEventListener('DOMContentLoaded', () => {
      void settle().then(() => {
        resolve({
          window,
          document: window.document,
          requests,
          navigations,
          async choose(selector: string) {
            const node = window.document.querySelector(selector);
            if (!node) throw new Error(`no element matches ${selector}`);
            node.dispatchEvent(new window.Event('click', { bubbles: true }));
            await settle();
          },
          close() {
            dom.window.close();
          },
        });
      });
    });
  });
}

describe('site header controls', () => {
  it('loads the dictionary from the site root when opened on /download/', async () => {
    // The regression. /download/assets/js/i18n/chrome/tr.json is a 404, and the
    // failure is invisible: setLanguage catches it and leaves the markup text in
    // place, so the page still looks like a working site.
    //
    // One request, resolved against the site root and not against the page.
    // There is no English fallback any more: measure-locale-coverage.cjs refuses
    // to publish a locale with a missing key, so a second 130-165 KB dictionary
    // had nothing left to cover.
    const harness = await seed(`${ORIGIN}/download/`);
    try {
      expect(harness.document.documentElement.lang).toBe('tr');
      expect(harness.requests).toEqual([`${ORIGIN}/assets/js/i18n/chrome/tr.json`]);
    } finally {
      harness.close();
    }
  });

  it('fetches a locale exactly once, on load and on every switch', async () => {
    const harness = await seed(`${ORIGIN}/download/`);
    try {
      // One entry, not two: start() must run from DOMContentLoaded alone.
      expect(harness.requests.filter((u) => u.endsWith('/chrome/tr.json'))).toHaveLength(1);

      // A switch navigates rather than re-rendering in place, so the target
      // page -- not this one -- is what fetches the new locale.
      await harness.choose('[data-lang="de"]');
      expect(harness.navigations).toEqual(['/de/download/']);
      expect(harness.requests.filter((u) => u.endsWith('/chrome/de.json'))).toHaveLength(0);

      await harness.choose('[data-lang="ja"]');
      expect(harness.navigations).toEqual(['/de/download/', '/ja/download/']);
      expect(harness.requests.filter((u) => u.endsWith('/chrome/ja.json'))).toHaveLength(0);

      // Nothing else was fetched either: no fallback dictionary, and the
      // repeated switches did not re-request the page's own locale.
      expect(harness.requests).toEqual([`${ORIGIN}/assets/js/i18n/chrome/tr.json`]);
    } finally {
      harness.close();
    }
  });

  it('loads the same dictionary from the site root', async () => {
    const harness = await seed(`${ORIGIN}/`);
    try {
      expect(harness.requests).toEqual([`${ORIGIN}/assets/js/i18n/chrome/tr.json`]);
    } finally {
      harness.close();
    }
  });

  it('takes the language from the document, not from the browser', async () => {
    // navigator.language is de-DE, and the page is Turkish. The page is the
    // answer: it was written in Turkish by generate-locales.cjs, and rendering
    // it in German would leave the address and the text disagreeing.
    const harness = await seed(`${ORIGIN}/`, { language: 'de-DE' });
    try {
      expect(harness.requests).toEqual([`${ORIGIN}/assets/js/i18n/chrome/tr.json`]);
      expect(harness.document.documentElement.lang).toBe('tr');
    } finally {
      harness.close();
    }
  });

  it('does not let a stored choice override the page language', async () => {
    // The regression this replaced: a stored "ja" over a Turkish page gave a
    // control showing Japanese over Turkish text, and lang="ja" was then
    // written onto a Turkish document -- which assistive technology and the
    // hreflang annotations both believe.
    const harness = await seed(`${ORIGIN}/`, {
      language: 'tr-TR',
      storage: { 'kalderashield.site.lang': 'ja' },
    });
    try {
      expect(harness.requests).toEqual([`${ORIGIN}/assets/js/i18n/chrome/tr.json`]);
      expect(harness.document.documentElement.lang).toBe('tr');
    } finally {
      harness.close();
    }
  });

  it('uses the document language of a page generated in another language', async () => {
    // What a /de/download/ address actually serves.
    const harness = await seed(`${ORIGIN}/de/download/`, { page: 'de/download/index.html' });
    try {
      expect(harness.requests).toEqual([`${ORIGIN}/assets/js/i18n/chrome/de.json`]);
      // The document's own lang is left exactly as the generator wrote it.
      expect(harness.document.documentElement.lang).toBe('de');
    } finally {
      harness.close();
    }
  });

  it('navigates to the same page in the chosen language', async () => {
    const harness = await seed(`${ORIGIN}/de/download/`, { page: 'de/download/index.html' });
    try {
      // Turkish is the unprefixed address, so switching to it drops the prefix
      // instead of adding /tr/.
      await harness.choose('[data-lang="tr"]');
      expect(harness.navigations).toEqual(['/download/']);

      await harness.choose('[data-lang="fr"]');
      expect(harness.navigations).toEqual(['/download/', '/fr/download/']);
    } finally {
      harness.close();
    }
  });

  it('keeps the query and the fragment across a switch', async () => {
    // /de/download/#linux is a link people copy. Losing the fragment on a switch
    // drops the reader on the top of the page instead of the platform they
    // asked for.
    const harness = await seed(`${ORIGIN}/de/download/?x=1#linux`, { page: 'de/download/index.html' });
    try {
      await harness.choose('[data-lang="ja"]');
      expect(harness.navigations).toEqual(['/ja/download/?x=1#linux']);
    } finally {
      harness.close();
    }
  });

  it('refuses a switch target that would leave the site', async () => {
    // The switcher's target is built from the address bar, which is document
    // text. Assigning it unchecked is an open redirect: a `//evil.example` or
    // `javascript:` reaching that line sends the visitor off-site. navigate()
    // parses the target, requires a same-origin http(s) URL and drops everything
    // else -- leaving the reader where they were, which is the only safe default
    // for a language button.
    const harness = await seed(`${ORIGIN}/de/download/`, { page: 'de/download/index.html' });
    try {
      // seed() hands back the shadowed location, so `pathname` is writable here
      // and the assignment is actually read back by the page.
      const location = harness.window.location;

      // `pathForLocale` prefixes the locale to whatever the address bar holds, so
      // the worst a hostile address can produce is a same-origin path -- navigate()
      // parses it, confirms the origin and confirms the scheme, and either
      // navigates within the site or stays put. Neither of these may leave it.
      location.pathname = '//evil.example/x';
      await harness.choose('[data-lang="fr"]');
      for (const to of harness.navigations) {
        expect(to.startsWith('/')).toBe(true);
        expect(to).not.toContain('evil.example');
      }

      // A `javascript:` address bar value cannot become a javascript: URL here,
      // and the reason is structural rather than a filter: pathForLocale always
      // prefixes the locale, so the target begins with '/' and is therefore
      // parsed as a same-origin path -- '/esjavascript:alert(1)', which the
      // browser treats as a 404 rather than as script. The assertion is that
      // nothing about it executes or leaves the origin.
      harness.navigations.length = 0;
      location.pathname = 'javascript:alert(1)';
      await harness.choose('[data-lang="es"]');
      for (const to of harness.navigations) {
        expect(to.startsWith('/')).toBe(true);
        expect(to).not.toMatch(/^[a-z]+:/i);
        expect(to).not.toContain('evil.example');
      }
    } finally {
      harness.close();
    }
  });

  it('records the choice for the pages that consult storage', async () => {
    const harness = await seed(`${ORIGIN}/de/download/`, { page: 'de/download/index.html' });
    try {
      await harness.choose('[data-lang="es"]');
      expect(harness.window.localStorage.getItem('kalderashield.site.lang')).toBe('es');
    } finally {
      harness.close();
    }
  });

  it('leaves lang and dir exactly as the document declares them', async () => {
    // setDocumentLang() used to rewrite both from the active locale. On a page
    // written in one language that produced a control showing one language over
    // another's text, and lang="ar"/dir="rtl" on a document whose markup is not
    // right-to-left -- which the browser then lays out wrongly.
    const harness = await seed(`${ORIGIN}/download/`);
    try {
      const before = {
        lang: harness.document.documentElement.getAttribute('lang'),
        dir: harness.document.documentElement.getAttribute('dir'),
      };
      await harness.choose('[data-lang="ar"]');
      expect(harness.document.documentElement.getAttribute('lang')).toBe(before.lang);
      expect(harness.document.documentElement.getAttribute('dir')).toBe(before.dir);
      // And the switch itself is a navigation, so nothing here was re-rendered.
      expect(harness.navigations).toEqual(['/ar/download/']);
    } finally {
      harness.close();
    }
  });

  it('names the active language on the closed control', async () => {
    const harness = await seed(`${ORIGIN}/`);
    try {
      expect(harness.document.querySelector('[data-lang-current]')?.textContent).toBe(TR.turkce);
      expect(harness.document.querySelector('[data-lang-code]')?.textContent).toBe('TR');

      // A page generated in German names German, with no switch involved.
      const german = await seed(`${ORIGIN}/de/`, { page: 'de/index.html' });
      try {
        expect(german.document.querySelector('[data-lang-current]')?.textContent).toBe(TR.deutsch);
        expect(german.document.querySelector('[data-lang-code]')?.textContent).toBe('DE');
      } finally {
        german.close();
      }
    } finally {
      harness.close();
    }
  });

  it('builds twelve options, each a code badge and an endonym, never a flag', async () => {
    const harness = await seed(`${ORIGIN}/`);
    try {
      const options = [...harness.document.querySelectorAll('[data-lang]')];
      expect(options).toHaveLength(12);
      for (const option of options) {
        expect(option.querySelector('.lang-code')?.textContent ?? '').toMatch(/^[A-Z]{2}$/);
        const name = option.querySelector('.lang-name')?.textContent ?? '';
        expect(name.length).toBeGreaterThan(0);
        // A flag is a regional indicator pair. Windows' Segoe UI Emoji has no
        // glyph for it and renders the letters instead, and Arabic and Chinese
        // are not one country each, so no option may carry one.
        expect(name).not.toMatch(/\p{Regional_Indicator}/u);
      }
    } finally {
      harness.close();
    }
  });

  it('marks exactly one language and one theme as current', async () => {
    const harness = await seed(`${ORIGIN}/de/download/`, { page: 'de/download/index.html' });
    try {
      // The address decides, so a /de/ page opens with German marked -- there is
      // no switch to click first.
      const langs = [...harness.document.querySelectorAll('[data-lang][aria-current="true"]')];
      expect(langs).toHaveLength(1);
      expect(langs[0]?.getAttribute('data-lang')).toBe('de');
      expect(harness.document.querySelectorAll('[data-theme-choice][aria-current="true"]')).toHaveLength(1);
    } finally {
      harness.close();
    }
  });

  it('offers light, dark and system', async () => {
    const harness = await seed(`${ORIGIN}/`);
    try {
      const options = [...harness.document.querySelectorAll('[data-theme-choice]')].map((node) =>
        node.getAttribute('data-theme-choice')
      );
      expect(options).toEqual(['light', 'dark', 'system']);
    } finally {
      harness.close();
    }
  });

  it('overrides the operating system with an explicit theme', async () => {
    // Without data-theme the stylesheet's prefers-color-scheme block decides,
    // and the visitor has no say.
    const harness = await seed(`${ORIGIN}/`);
    try {
      await harness.choose('[data-theme-choice="light"]');
      expect(harness.document.documentElement.getAttribute('data-theme')).toBe('light');

      await harness.choose('[data-theme-choice="dark"]');
      expect(harness.document.documentElement.getAttribute('data-theme')).toBe('dark');
    } finally {
      harness.close();
    }
  });

  it('removes the override for system so the media query takes over again', async () => {
    const harness = await seed(`${ORIGIN}/`);
    try {
      await harness.choose('[data-theme-choice="light"]');
      await harness.choose('[data-theme-choice="system"]');
      expect(harness.document.documentElement.hasAttribute('data-theme')).toBe(false);
    } finally {
      harness.close();
    }
  });

  it('names the active theme on the closed control', async () => {
    const harness = await seed(`${ORIGIN}/`);
    try {
      expect(harness.document.querySelector('[data-theme-current]')?.textContent).toBe(TR.system);
      await harness.choose('[data-theme-choice="light"]');
      expect(harness.document.querySelector('[data-theme-current]')?.textContent).toBe(TR.light);
    } finally {
      harness.close();
    }
  });

  it('persists both choices and reads them back on the next view', async () => {
    const first = await seed(`${ORIGIN}/`);
    let stored: Record<string, string> = {};
    try {
      await first.choose('[data-theme-choice="light"]');
      await first.choose('[data-lang="de"]');
      stored = {
        'kalderashield.site.theme': first.window.localStorage.getItem('kalderashield.site.theme') ?? '',
        'kalderashield.site.lang': first.window.localStorage.getItem('kalderashield.site.lang') ?? '',
      };
    } finally {
      first.close();
    }
    expect(stored['kalderashield.site.theme']).toBe('light');
    expect(stored['kalderashield.site.lang']).toBe('de');

    // A second view, as a returning visitor on a different page, with only what
    // was persisted available. The theme survives; the language does not decide
    // anything, because that page carries its own lang.
    const second = await seed(`${ORIGIN}/privacy.html`, { language: 'en-US', storage: stored });
    try {
      expect(second.document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(second.requests).toEqual([`${ORIGIN}/assets/js/i18n/chrome/tr.json`]);
    } finally {
      second.close();
    }
  });

  it('translates the header controls into the page language', async () => {
    const harness = await seed(`${ORIGIN}/`);
    try {
      const summary = harness.document.querySelector('.lang > summary');
      expect(summary?.getAttribute('data-i18n-attr')).toBe('aria-label:lang-switch-label');

      // A German page labels its own controls in German, with no switch: the
      // chrome dictionary is fetched for the document's language.
      const german = await seed(`${ORIGIN}/de/`, { page: 'de/index.html' });
      try {
        expect(german.document.querySelector('.lang > summary')?.getAttribute('aria-label')).toBe(TR.waehlen);
        expect(german.document.querySelector('[data-theme-choice="light"]')?.textContent).toBe(TR.hell);
      } finally {
        german.close();
      }
    } finally {
      harness.close();
    }
  });

  it('keeps the Turkish labels when the dictionary cannot be fetched', async () => {
    // A 404 here is survivable by design: the page was written in its own
    // language already, and only the theme labels are missing. The control must
    // still be usable rather than blank.
    const harness = await seed(`${ORIGIN}/xx/`, { });
    try {
      harness.window.fetch = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));
      harness.window.KalderaShieldI18n.set('tr');
      await new Promise((r) => setTimeout(r, 0));
      expect(harness.document.querySelector('[data-theme-choice="light"]')?.textContent).toBe(TR.light);
    } finally {
      harness.close();
    }
  });
});
