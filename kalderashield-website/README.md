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
privacy.html            written last, see below
terms.html              written last, see below
404.html
install.sh              one-line Linux installer
robots.txt
sitemap.xml
site.webmanifest
.well-known/security.txt
assets/
  css/site.css
  js/site.js            language switching, no dependencies
  js/i18n/*.json        12 languages, 529 keys each
  images/               icons and the social card
```

## Translations

`assets/js/i18n/<lang>.json`. Keys come from `data-i18n` on the markup, and
`data-i18n-attr="attr:key, …"` for attributes. A key missing from a file falls
back to the text in the markup, which is Turkish, so a gap degrades to readable
Turkish rather than to an empty label.

```sh
node scripts/check-site-i18n.cjs
```

Fails if a page uses a key that is missing from any of the twelve files. A
missing key is not a crash, which is exactly why it needs a check.

The release version lives once, in `data-site-version` on `<html>`, and reaches
the badge through a `{{VERSION}}` token in the translations. Updating a release
is one attribute, not the same sentence in twelve files.

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

`privacy.html` and `terms.html` are linked from the footer and the sitemap but
do not exist. The previous site's legal pages were shells: `legal.js` contained
no KVKK text, no GDPR text and no controller identity, so there is nothing
worth porting. They need the data controller's real details, which is also
blocked on the domain.
