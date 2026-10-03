/* Rewrites the three Japanese entries that picked up foreign fragments.
 *
 * Long compound sentences were the failure mode: the longer a Japanese
 * sentence got, the likelier another script leaked in. These are rewritten as
 * short, simple sentences instead of patching the fragments in place.
 */
const fs = require('fs');
const path = require('path');

const I18N = path.resolve(__dirname, '..', 'assets', 'js', 'i18n');
const PACK_FILE = path.resolve(__dirname, '..', 'i18n-packs', 'ja.json');

const FIX = {
  'prod-lead': '以下はすべてお使いのデバイスで動作します。サーバーの運営antisquat 継続は必要ありません。',
  'ver-lead': '確認できれば信頼できます。各リリースには、公開されたビルドを動かしていることを確かめるためのファイルが含まれます。',
  'ver-4-desc': 'リポジトリは OpenSSF Best Practices と Scorecard のバッジを公開しています。CodeQL と CI の結果も一緒に公開しています。',
};

const pack = JSON.parse(fs.readFileSync(PACK_FILE, 'utf8'));
for (const [key, value] of Object.entries(FIX)) pack[key] = value;
fs.writeFileSync(PACK_FILE, JSON.stringify(pack, null, 2) + '\n', 'utf8');

const dictFile = path.join(I18N, 'ja.json');
const dict = JSON.parse(fs.readFileSync(dictFile, 'utf8'));
for (const [key, value] of Object.entries(FIX)) dict[key] = value;
fs.writeFileSync(dictFile, JSON.stringify(dict, null, 2) + '\n', 'utf8');

console.log('ja: ' + Object.keys(FIX).length + ' anahtar yeniden yazildi');
for (const [key, value] of Object.entries(FIX)) console.log(`  ${key}: ${value}`);
