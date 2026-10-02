#!/usr/bin/env node
/* Rewrites the comparison table into the compact form, wired for translation.
 *
 * Two things were wrong with it and they are separate problems.
 *
 * The translations. The cells carried no data-i18n attribute at all -- twenty
 * hardcoded Turkish cells -- while the four <th> above them did, so the section
 * read as translated and appeared in Turkish in all twelve languages.
 *
 * The shape. The obvious fix, swapping in the long-form comp-r1-c1..comp-r6-c4
 * matrix the dictionaries happened to carry, replaced five scannable criteria
 * with six rows of sentences. It was correct and it was unusable: the table's
 * whole purpose is to be read at a glance, and a cell reading "varies by product
 * and configuration" cannot be glanced at.
 *
 * So the table goes back to five rows and one word per cell, and the missing
 * short strings are added to the dictionaries by
 * scripts/add-comparison-cell-i18n.cjs. The ticks are kept, because on a
 * yes/no/partial matrix the mark is the fastest signal in the table.
 *
 * Idempotent: the region is bounded by the heading above and the method note
 * below rather than by the table's own markup, so it can be run again after any
 * edit.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const I18N = path.join(root, 'assets', 'js', 'i18n');
const SOURCE = 'tr';
const target = path.join(root, 'index.html');

const tr = JSON.parse(fs.readFileSync(path.join(I18N, SOURCE + '.json'), 'utf8'));

/* criteria, then the three answers with the mark that goes with each. */
const ROWS = [
  ['comp-row-server', [['comp-val-none', 'yes'], ['comp-val-required', 'no'], ['comp-val-none', 'yes']]],
  ['comp-row-account', [['comp-val-none', 'yes'], ['comp-val-required', 'no'], ['comp-val-none', 'yes']]],
  ['comp-row-location', [['comp-val-device', 'yes'], ['comp-val-vendor-server', 'no'], ['comp-val-device', 'yes']]],
  ['comp-row-offline', [['comp-val-full', 'yes'], ['comp-val-no', 'no'], ['comp-val-full', 'yes']]],
  ['comp-row-opensource', [['comp-val-yes', 'yes'], ['comp-val-no', 'no'], ['comp-val-varies', 'partial']]],
];

const HEAD = ['comp-th-criteria', 'comp-th-kalderashield', 'comp-th-cloud', 'comp-th-offline'];

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const keys = HEAD.concat(ROWS.flatMap(([label, cells]) => [label].concat(cells.map(([k]) => k))));
const missing = keys.filter((k) => typeof tr[k] !== 'string' || !tr[k].trim());
if (missing.length) {
  console.error(`once scripts/add-comparison-cell-i18n.cjs calistirin, sozlukte eksik: ${missing.join(', ')}`);
  process.exit(1);
}

const head = HEAD.map((key, i) => {
  // The first column names what is being compared, so it is both a column
  // header and the scope for the three answers beside it.
  const attrs = i === 0 ? ' scope="col"' : '';
  return `              <th${attrs} data-i18n="${key}">${esc(tr[key])}</th>`;
}).join('\n');

const body = ROWS.map(([label, cells]) => {
  const out = [`              <th scope="row" data-i18n="${label}">${esc(tr[label])}</th>`];
  for (const [key, mark] of cells) {
    out.push(`              <td data-check="${mark}" data-i18n="${key}">${esc(tr[key])}</td>`);
  }
  return `            <tr>\n${out.join('\n')}\n            </tr>`;
}).join('\n');

const table = [
  '      <div style="overflow-x:auto;margin-top:1.4rem">',
  '        <table>',
  '          <thead>',
  '            <tr>',
  head,
  '            </tr>',
  '          </thead>',
  '          <tbody>',
  body,
  '          </tbody>',
  '        </table>',
  '      </div>',
].join('\n');

const html = fs.readFileSync(target, 'utf8');

const headingAt = html.indexOf('data-i18n="comp-title"');
const headingEnd = html.indexOf('</h2>', headingAt);
if (headingAt === -1 || headingEnd === -1) {
  console.error('comp-title basligi bulunamadi (index.html elle degismis olabilir)');
  process.exit(1);
}
const noteAt = html.indexOf('<p class="faint"', headingEnd);
if (noteAt === -1) {
  console.error('comp-method-note paragrafi bulunamadi');
  process.exit(1);
}

const start = html.indexOf('\n', headingEnd) + 1;
const end = html.lastIndexOf('\n', noteAt) + 1;

fs.writeFileSync(target, html.slice(0, start) + table + '\n' + html.slice(end), 'utf8');
console.log(`karsilastirma tablosu: ${ROWS.length} satir, ${ROWS.length * 4} hucre, ${ROWS.length * 4} data-i18n`);
console.log(`  data-check isaretleri geri alindi (yes/no/partial)`);