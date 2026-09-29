# kalderashield-website

The public site: a landing page, a download page, and the two legal pages.
Static HTML, one stylesheet, one script, twelve translation files. No build
step, no framework, no server-side anything.

## Before the first deploy

The domain has not been chosen yet, so 28 places carry an unfilled
`{{DOMAIN}}` token: the canonical and Open Graph URLs on both pages, the
contact address inside all twelve translation files, the sitemap, `security.txt`
and the `install.sh` curl line.

```sh
node scripts/check-placeholders.cjs
```

It exits non-zero while any token remains, and it also fails on any `Aegis`
string, so a partial rebrand cannot slip through. Replace the tokens once the
domain exists, re-run the check, and the site is ready.

## Structure

```
index.html              landing page
download/index.html     per-platform downloads and checksum verification
privacy.html            12 languages, Turkish governs
terms.html              12 languages, Turkish governs
404.html
install.sh              one-line Linux installer
robots.txt
sitemap.xml
site.webmanifest
.well-known/security.txt
scripts/
  check-placeholders.cjs  {{DOMAIN}} / {{VERSION}} gate
  audit-i18n.cjs          translation audit, see below
  test-audit-i18n.cjs     proves the audit catches what it claims to
assets/
  css/site.css
  js/site.js            language and theme switching, no dependencies
  js/i18n/*.json        12 languages, 564 keys each
  images/               icons and the social card
```

## Translations

`assets/js/i18n/<lang>.json`. Keys come from `data-i18n` on the markup, and
`data-i18n-attr="attr:key, …"` for attributes. A key missing from a file falls
back to the text in the markup, which is Turkish, so a gap degrades to readable
Turkish rather than to an empty label. That graceful degradation is also why
gaps are invisible, which is what the audit is for.

```sh
node scripts/audit-i18n.cjs        # the gate
node scripts/test-audit-i18n.cjs   # proves the gate fires
```

`audit-i18n.cjs` checks eleven things, each of which exists because it caught a
real defect:

| check | what it catches |
|---|---|
| `cross-script` | text pasted in from the wrong language — Cyrillic in an Arabic string |
| `letterless` | a value that is only `?` and punctuation; five header strings were once written through a shell pipeline that ate every non-Latin-1 code point |
| `key-conflict` | one key standing for two sentences — `dl-desc` was both the download hero line and a release note, so twelve languages showed the wrong copy |
| `markup-drift` | a translation that dropped the `<strong>` its English carries, which loses the emphasis silently |
| `template-leftover` | `_INTEGER` and unclosed braces left where a placeholder should be |
| `dangling-ref` | a page naming a key no dictionary has |
| `orphan-key` | a translated string no page renders |
| `legal-missing` | a gap in the privacy or terms copy specifically |
| `missing` / `extra` | key-set drift between locales |
| `empty` | a blank value |
| `untranslated-key` | a value left equal to its own key |

Run the test script after changing the audit. It breaks the tree on purpose
eleven times and checks each one is reported, then restores it. A gate nobody
has seen fail is not a gate.

One rule the audit does **not** enforce: a value identical to the English one is
not automatically wrong. `WebAuthn PRF & Windows Hello / Touch ID` is a
product and standard name, and `null Cloud-Zwang` is the German word for zero.
An earlier version flagged both and produced fourteen findings that taught
nobody anything. Terminology uniformity is a review decision — see
`scripts/normalise-terms.cjs`, which applied the decision rather than policing
it.

The release version lives once, in `data-site-version` on `<html>`, and reaches
the badge through a `{{VERSION}}` token in the translations. Updating a release
is one attribute, not the same sentence in twelve files.

## Language and theme controls

Both are `<details>` disclosures in the header, on the four pages that have a
header. Neither uses a web font, a flag, or a third-party request.

The language list shows a two-letter code and the endonym, not a flag. Windows'
Segoe UI Emoji ships no country-flag glyphs, so a regional indicator pair renders
as the letters in a box there, and a flag names a country while these are
languages. A visitor who cannot read the current language still finds their own
in the list; that is the part a flag would not give them.

The theme is light, dark or system. `system` is the absence of an override
rather than a third set of values, so the `prefers-color-scheme` block keeps
tracking the operating system on its own and a device switching at sunset moves
the page with it. An explicit choice sets `data-theme` and pins `color-scheme`.

Both controls are covered by `src/siteHeaderControls.test.ts`, which runs the
real page in jsdom. Three things it holds in place that cannot be checked by
reading:

- the locale is fetched from the site root, not the page. It used to resolve
  against `document.baseURI`, so on `/download/` it requested
  `/download/assets/js/i18n/tr.json`, got a 404, and silently left the whole
  download page in Turkish under a working-looking switcher.
- one switch fetches one locale, not two
- the active language and theme are named on the closed control

## Regenerating assets

```sh
node scripts/rebrand-site-i18n.cjs        # Aegis -> KalderaShield, once
node scripts/extract-site-version-placeholder.cjs
node scripts/render-og-card.cjs           # assets/images/og-card.png
```

`render-og-card.cjs` drives the same browser channel `scripts/render-icon.cjs`
uses, because this machine has no Playwright-managed browser download.

## Downloads

Every button points at a `releases/latest/download/…` asset, so the site does
not need editing per release. The alias names only resolve if
`SHA256SUMS.txt` covers them, which is why the release pipeline now fails if a
staged alias has no checksum entry. The Linux install script resolves the
version at run time and refuses to install anything whose digest is not in that
file.

## Not written yet

The legal pages exist and are translated into all twelve languages, with the
Turkish text governing in case of any discrepancy. What they do not yet carry is
the data controller's real identity: no company or person is named as the
controller, and no supervisory authority is cited. That needs the legal entity
behind the project, and is blocked on the domain.

`{{DOMAIN}}` also has to be filled before any of it is published, since the
contact address on both pages is the placeholder.
