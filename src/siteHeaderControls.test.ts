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
 */
const dictionaries = new Map(
  LOCALES.map((locale) => [
    `${ORIGIN}/assets/js/i18n/${locale}.json`,
    JSON.parse(readFileSync(join(SITE, 'assets', 'js', 'i18n', `${locale}.json`), 'utf8')),
  ])
);

function seed(
  url: string,
  { language = 'tr-TR', storage = {} as Record<string, string> } = {}
): Promise<Harness> {
  return new Promise((resolve) => {
    const requests: string[] = [];
    const virtualConsole = new VirtualConsole();
    const dom = new JSDOM(readFileSync(join(SITE, 'download', 'index.html'), 'utf8'), {
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
          const body = dictionaries.get(requested);
          if (body === undefined) return { ok: false, status: 404, json: async () => ({}) };
          return { ok: true, status: 200, json: async () => body };
        });
      },
    });

    const window = dom.window as any;
    // Loaded the way the markup loads it, so document.currentScript resolves
    // the site root from a real /assets/js/ src instead of the fallback.
    const script = window.document.createElement('script');
    script.src = `${ORIGIN}/assets/js/site.js`;
    window.document.head.appendChild(script);
    window.eval(readFileSync(join(SITE, 'assets', 'js', 'site.js'), 'utf8'));

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
  it('loads the locale from the site root when opened on /download/', async () => {
    // The regression. /download/assets/js/i18n/tr.json is a 404, and the
    // failure is invisible: setLanguage catches it and leaves the markup text
    // in place, so the page still looks like a working site in the wrong
    // language.
    const harness = await seed(`${ORIGIN}/download/`);
    try {
      expect(harness.document.documentElement.lang).toBe('tr');
      expect(harness.requests).toEqual([`${ORIGIN}/assets/js/i18n/tr.json`]);
    } finally {
      harness.close();
    }
  });

  it('fetches a locale exactly once, on load and on every switch', async () => {
    const harness = await seed(`${ORIGIN}/download/`);
    try {
      // One entry, not two: start() must run from DOMContentLoaded alone.
      expect(harness.requests.filter((u) => u.endsWith('/tr.json'))).toHaveLength(1);

      await harness.choose('[data-lang="de"]');
      expect(harness.requests.filter((u) => u.endsWith('/de.json'))).toHaveLength(1);

      await harness.choose('[data-lang="ja"]');
      expect(harness.requests.filter((u) => u.endsWith('/ja.json'))).toHaveLength(1);
    } finally {
      harness.close();
    }
  });

  it('loads the same locale from the site root', async () => {
    const harness = await seed(`${ORIGIN}/`);
    try {
      expect(harness.requests).toEqual([`${ORIGIN}/assets/js/i18n/tr.json`]);
    } finally {
      harness.close();
    }
  });

  it('follows the browser language when nothing is stored', async () => {
    const harness = await seed(`${ORIGIN}/`, { language: 'de-DE' });
    try {
      expect(harness.document.documentElement.lang).toBe('de');
    } finally {
      harness.close();
    }
  });

  it('prefers a stored choice over the browser language', async () => {
    const harness = await seed(`${ORIGIN}/`, {
      language: 'de-DE',
      storage: { 'kalderashield.site.lang': 'ja' },
    });
    try {
      expect(harness.document.documentElement.lang).toBe('ja');
    } finally {
      harness.close();
    }
  });

  it('sets lang and dir from the chosen locale', async () => {
    const harness = await seed(`${ORIGIN}/`);
    try {
      await harness.choose('[data-lang="ar"]');
      expect(harness.document.documentElement.getAttribute('lang')).toBe('ar');
      expect(harness.document.documentElement.getAttribute('dir')).toBe('rtl');

      await harness.choose('[data-lang="ja"]');
      expect(harness.document.documentElement.getAttribute('dir')).toBe('ltr');
    } finally {
      harness.close();
    }
  });

  it('names the active language on the closed control', async () => {
    const harness = await seed(`${ORIGIN}/`);
    try {
      expect(harness.document.querySelector('[data-lang-current]')?.textContent).toBe(TR.turkce);
      expect(harness.document.querySelector('[data-lang-code]')?.textContent).toBe('TR');

      await harness.choose('[data-lang="ru"]');
      expect(harness.document.querySelector('[data-lang-current]')?.textContent).toBe('\u0420\u0443\u0441\u0441\u043a\u0438\u0439');
      expect(harness.document.querySelector('[data-lang-code]')?.textContent).toBe('RU');
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
    const harness = await seed(`${ORIGIN}/`);
    try {
      await harness.choose('[data-lang="es"]');
        const langs = [...harness.document.querySelectorAll('[data-lang][aria-current="true"]')];
        expect(langs).toHaveLength(1);
        expect(langs[0]?.getAttribute('data-lang')).toBe('es');
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
    // was persisted available.
    const second = await seed(`${ORIGIN}/privacy.html`, { language: 'en-US', storage: stored });
    try {
      expect(second.document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(second.document.documentElement.lang).toBe('de');
    } finally {
      second.close();
    }
  });

  it('translates the header controls into the chosen language', async () => {
    const harness = await seed(`${ORIGIN}/`);
    try {
      const summary = harness.document.querySelector('.lang > summary');
      expect(summary?.getAttribute('data-i18n-attr')).toBe('aria-label:lang-switch-label');

      await harness.choose('[data-lang="de"]');
      expect(summary?.getAttribute('aria-label')).toBe(TR.waehlen);
      expect(harness.document.querySelector('[data-theme-choice="light"]')?.textContent).toBe(TR.hell);
    } finally {
      harness.close();
    }
  });
});
