/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VaultItem } from '../types';

import { parseCSV } from './csvParser';
import { defaultImportLabels } from './importerLabels';

export { parseCSV } from './csvParser';

export type ImportResult = 
  | { type: 'success'; items: Partial<VaultItem>[]; formatName: string }
  | { type: 'encrypted_aegis'; envelope: any }
  | { type: 'error'; message: string };

export interface ImportLabels {
  errorEmpty: string;
  formatAegisJson: string;
  formatBitwardenJson: string;
  errorUnsupportedJson: string;
  errorJsonPrefix: string;
  errorCsvHeader: string;
  formatBitwardenCsv: string;
  formatLastPassCsv: string;
  formatChromeCsv: string;
  formatOnePasswordCsv: string;
  untitledUniversal: string;
  formatUniversalCsv: string;
  errorCsvColumns: string;
}

function normalizeImportString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeOptionalImportString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Builds a non-empty human-readable title for an imported vault item.
 *
 * Many CSV exports (and a few sloppy JSON exports) ship rows with an empty
 * title cell. The vault schema requires every item to have a title or a
 * username, so a "İsimsiz Aktarım" / "Untitled Import" placeholder is
 * unavoidable when the row really has no identifying data. To keep the
 * fallback as informative as possible we prefer, in order:
 *
 *   1. the explicit `titleCandidate` argument (e.g. the row's own title
 *      cell, trimmed)
 *   2. the row's `username` value (e.g. an email or login name)
 *   3. the row's `url` host (e.g. "github.com" for a row with no name)
 *   4. the row's `notes` first line as a last-ditch descriptive label
 *   5. the localized `untitledFallback` (İsimsiz Aktarım / Untitled Import)
 *
 * Returning a non-empty string is guaranteed; the placeholder is only
 * used when every other source is empty.
 */
function buildImportedTitle(
  titleCandidate: string | undefined,
  username: string | undefined,
  url: string | undefined,
  notes: string | undefined,
  untitledFallback: string,
): string {
  if (titleCandidate && titleCandidate.trim().length > 0) {
    return titleCandidate.trim();
  }
  if (username && username.trim().length > 0) {
    return username.trim();
  }
  if (url && url.trim().length > 0) {
    try {
      // Trim trailing slashes, paths, and ports so the title stays short.
      const parsed = new URL(url.trim().includes('://') ? url.trim() : `https://${url.trim()}`);
      const host = parsed.hostname.replace(/^www\./i, '');
      if (host) return host;
    } catch {
      const stripped = url.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
      if (stripped) return stripped;
    }
  }
  if (notes && notes.trim().length > 0) {
    const firstLine = notes.trim().split(/\r?\n/)[0]?.trim();
    if (firstLine && firstLine.length > 0 && firstLine.length <= 60) return firstLine;
  }
  return untitledFallback;
}


/**
 * Parses any password manager export/backup and returns a normalized unified list.
 */
export function parseUniversalImport(fileContent: string, labels: Partial<ImportLabels> = {}): ImportResult {
  const copy = { ...defaultImportLabels, ...labels };
  const trimmed = fileContent.trim();
  if (!trimmed) {
    return { type: 'error', message: copy.errorEmpty };
  }

  // Scenario A: JSON Format
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);

      // 1. Encrypted Aegis Backup File
      if ((parsed.version === "1.1" || parsed.kdf === "Argon2id" || parsed.encrypted) && parsed.salt && parsed.payload) {
        return { type: 'encrypted_aegis', envelope: parsed };
      }

      // 2. Multi-record Aegis JSON array
      if (Array.isArray(parsed)) {
        // Double check if typical Aegis JSON format
        const items: Partial<VaultItem>[] = parsed.map(x => {
          const username = normalizeImportString(x.username);
          const url = normalizeImportString(x.url);
          const notes = normalizeImportString(x.notes);
          return {
            title: buildImportedTitle(normalizeImportString(x.title, ''), username, url, notes, copy.untitledUniversal),
            username,
            password: normalizeImportString(x.password),
            url,
            notes,
            totpSecret: normalizeImportString(x.totpSecret),
            category: normalizeImportString(x.category, 'login') as Partial<VaultItem>['category'],
            favorite: !!x.favorite,
            cardholderName: normalizeOptionalImportString(x.cardholderName),
            cardNumber: normalizeOptionalImportString(x.cardNumber),
            cardExpiry: normalizeOptionalImportString(x.cardExpiry),
            cardCvv: normalizeOptionalImportString(x.cardCvv),
            cardPin: normalizeOptionalImportString(x.cardPin),
            idNumber: normalizeOptionalImportString(x.idNumber),
            idFullName: normalizeOptionalImportString(x.idFullName),
            idBirthDate: normalizeOptionalImportString(x.idBirthDate),
            idExpiryDate: normalizeOptionalImportString(x.idExpiryDate),
            idGender: normalizeOptionalImportString(x.idGender),
            passkeyService: normalizeOptionalImportString(x.passkeyService),
            passkeyPrivateExponent: normalizeOptionalImportString(x.passkeyPrivateExponent),
            passkeyPublicId: normalizeOptionalImportString(x.passkeyPublicId),
          };
        });
        return { type: 'success', items, formatName: copy.formatAegisJson };
      }

      // 3. Bitwarden JSON structure
      if (parsed.items && Array.isArray(parsed.items)) {
        const items: Partial<VaultItem>[] = [];
        parsed.items.forEach((bw: any) => {
          // First pass: discover the row's identifying fields so we can
          // synthesise a non-empty title if `bw.name` is missing.
          const username = (bw.type === 1 && bw.login?.username) || '';
          const url = (bw.type === 1 && bw.login?.uris && bw.login.uris[0]?.uri) || '';
          const cardholderName = (bw.type === 3 && bw.card?.cardholderName) || '';
          const idFullName = (bw.type === 4 && bw.identity)
            ? `${bw.identity.firstName || ''} ${bw.identity.lastName || ''}`.trim()
            : '';
          const notes = bw.notes || '';

          // Choose the most informative title candidate: explicit name →
          // cardholder name → identity name → username → url host.
          const titleCandidate = bw.name || cardholderName || idFullName || username || url;

          const item: Partial<VaultItem> = {
            title: buildImportedTitle(titleCandidate, username, url, notes, copy.untitledUniversal),
            notes,
            favorite: !!bw.favorite,
          };

          // Bitwarden Types: 1=Login, 2=SecureNote, 3=Card, 4=Identity
          if (bw.type === 1) {
            item.category = 'login';
            if (bw.login) {
              item.username = username;
              item.password = bw.login.password || '';
              item.url = url;
              item.totpSecret = bw.login.totp || '';
            }
          } else if (bw.type === 2) {
            item.category = 'secure_note';
          } else if (bw.type === 3) {
            item.category = 'card';
            if (bw.card) {
              item.cardholderName = cardholderName;
              item.cardNumber = bw.card.number || '';
              item.cardCvv = bw.card.code || '';
              item.cardPin = '';
              const m = bw.card.expMonth || '';
              const y = bw.card.expYear || '';
              item.cardExpiry = m && y ? `${m}/${y.toString().slice(-2)}` : '';
            }
          } else if (bw.type === 4) {
            item.category = 'identity';
            if (bw.identity) {
              item.idFullName = idFullName;
              item.idNumber = bw.identity.ssn || bw.identity.passportNumber || '';
              item.idGender = '';
            }
          } else {
            item.category = 'login';
          }

          items.push(item);
        });

        return { type: 'success', items, formatName: copy.formatBitwardenJson };
      }

      // Fallback fallback general JSON structure
      return { type: 'error', message: copy.errorUnsupportedJson };
    } catch (err: any) {
      return { type: 'error', message: `${copy.errorJsonPrefix}: ${err?.message}` };
    }
  }

  // Scenario B: CSV Format
  const rows = parseCSV(trimmed);
  const firstRow = rows[0];
  if (rows.length < 2 || !firstRow) {
    return { type: 'error', message: copy.errorCsvHeader };
  }

  const headers = firstRow.map(h => h.toLowerCase().trim().replace(/^["']|["']$/g, ''));
  const dataRows = rows.slice(1);

  // Helper to locate column index by aliases.
  // Matching priority (most specific first) to avoid false positives like
  // "username" matching the "name" title alias or "uri" matching "url":
  //   1. exact match (case-insensitive)
  //   2. word-boundary match (e.g. "User Name" matches alias "name")
  // Substring fallback is intentionally NOT used because short aliases
  // like "name", "url", "pass" would otherwise match the middle of
  // unrelated headers ("username", "uri", "password"). For non-Latin
  // headers we rely on the i18n CSV fallback to fail gracefully with a
  // localised "no recognised columns" error rather than mis-match.
  const findColumnIndex = (aliases: string[]): number => {
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
    const normalizedAliases = aliases.map(a => a.toLowerCase());

    // 1. Exact match
    for (const alias of normalizedAliases) {
      const idx = normalizedHeaders.indexOf(alias);
      if (idx !== -1) return idx;
    }

    // 2. Word-boundary match: split header on non-alphanumeric chars and
    //    compare whole tokens. This finds "User Name" → "name" while
    //    rejecting "username" → "name".
    const splitTokens = (value: string) => value.split(/[^a-z0-9\u00C0-\u017F]+/i).filter(Boolean);
    for (const alias of normalizedAliases) {
      const idx = normalizedHeaders.findIndex(h => splitTokens(h).includes(alias));
      if (idx !== -1) return idx;
    }

    return -1;
  };

  // 1. Bitwarden CSV detection: "folder,favorite,type,name,notes,fields,login_uri,login_username,login_password,login_totp"
  if (headers.includes('login_password') || headers.includes('login_username')) {
    const nameIdx = findColumnIndex(['name', 'title']);
    const userIdx = findColumnIndex(['login_username', 'username']);
    const passIdx = findColumnIndex(['login_password', 'password']);
    const uriIdx = findColumnIndex(['login_uri', 'uri', 'url']);
    const totpIdx = findColumnIndex(['login_totp', 'totp', 'otp']);
    const notesIdx = findColumnIndex(['notes']);
    const favIdx = findColumnIndex(['favorite']);
    const typeIdx = findColumnIndex(['type']); // Login, Note, Card, Identity

    const items: Partial<VaultItem>[] = dataRows.map(row => {
      // Always materialise a non-empty title so that an empty source cell
      // does not cascade into a downstream "itemMissingRequiredFields"
      // rejection that would surface as "Yedek dosyasının içi liste
      // yapısında değil". When the title cell is empty we fall back to
      // the username, then the url host, then the notes first line, and
      // finally to the localized "İsimsiz Aktarım" placeholder.
      const rawTitle = nameIdx !== -1 ? row[nameIdx] : '';
      const username = (userIdx !== -1 ? row[userIdx] : '') || '';
      const url = (uriIdx !== -1 ? row[uriIdx] : '') || '';
      const notes = (notesIdx !== -1 ? row[notesIdx] : '') || '';
      const title = buildImportedTitle(rawTitle, username, url, notes, copy.untitledUniversal);

      // Map Bitwarden type strings/ids to local categories.
      const typeCell = typeIdx !== -1 ? row[typeIdx] : 'login';
      const typeStr = (typeCell ?? 'login').toLowerCase();
      let category: 'login' | 'card' | 'identity' | 'secure_note' = 'login';
      if (typeStr.includes('note') || typeStr === '2') category = 'secure_note';
      else if (typeStr.includes('card') || typeStr === '3') category = 'card';
      else if (typeStr.includes('identity') || typeStr === '4') category = 'identity';

      return {
        title,
        username,
        password: (passIdx !== -1 ? row[passIdx] : '') || '',
        url,
        totpSecret: (totpIdx !== -1 ? row[totpIdx] : '') || '',
        notes,
        favorite: favIdx !== -1 ? row[favIdx] === 'true' || row[favIdx] === '1' : false,
        category,
      };
    });

    return { type: 'success', items, formatName: copy.formatBitwardenCsv };
  }

  // 2. LastPass CSV detection: "url,username,password,extra,name,grouping,fav"
  if (headers.includes('grouping') && headers.includes('extra')) {
    const urlIdx = findColumnIndex(['url']);
    const userIdx = findColumnIndex(['username', 'user']);
    const passIdx = findColumnIndex(['password']);
    const extraIdx = findColumnIndex(['extra', 'notes']);
    const nameIdx = findColumnIndex(['name', 'title']);
    const favIdx = findColumnIndex(['fav', 'favorite']);

    const items: Partial<VaultItem>[] = dataRows.map(row => {
      // Always materialise a non-empty title so an empty source cell does
      // not cascade into a downstream "itemMissingRequiredFields" error
      // that would surface as "Yedek dosyasının içi liste yapısında değil".
      const rawTitle = nameIdx !== -1 ? row[nameIdx] : '';
      const username = (userIdx !== -1 ? row[userIdx] : '') || '';
      const url = (urlIdx !== -1 ? row[urlIdx] : '') || '';
      const notes = (extraIdx !== -1 ? row[extraIdx] : '') || '';
      const title = buildImportedTitle(rawTitle, username, url, notes, copy.untitledUniversal);
      return {
        title,
        username,
        password: (passIdx !== -1 ? row[passIdx] : '') || '',
        url,
        notes,
        favorite: favIdx !== -1 ? row[favIdx] === '1' || row[favIdx] === 'true' : false,
        category: 'login',
      };
    });

    return { type: 'success', items, formatName: copy.formatLastPassCsv };
  }

  // 3. Google Password Manager CSV detection: "name,url,username,password,note"
  if (headers.includes('name') && headers.includes('url') && headers.includes('username') && headers.includes('password')) {
    const nameIdx = findColumnIndex(['name']);
    const urlIdx = findColumnIndex(['url']);
    const userIdx = findColumnIndex(['username']);
    const passIdx = findColumnIndex(['password']);
    const noteIdx = findColumnIndex(['note', 'notes']);

    const items: Partial<VaultItem>[] = dataRows.map(row => {
      // Always materialise a non-empty title so an empty source cell does
      // not cascade into a downstream "itemMissingRequiredFields" error
      // that would surface as "Yedek dosyasının içi liste yapısında değil".
      const rawTitle = nameIdx !== -1 ? row[nameIdx] : '';
      const username = (userIdx !== -1 ? row[userIdx] : '') || '';
      const url = (urlIdx !== -1 ? row[urlIdx] : '') || '';
      const notes = (noteIdx !== -1 ? row[noteIdx] : '') || '';
      const title = buildImportedTitle(rawTitle, username, url, notes, copy.untitledUniversal);
      return {
        title,
        username,
        password: (passIdx !== -1 ? row[passIdx] : '') || '',
        url,
        notes,
        category: 'login',
      };
    });

    return { type: 'success', items, formatName: copy.formatChromeCsv };
  }

  // 4. 1Password CSV detection: "title,website,username,password,notes,etc" or "title,url,username,password"
  if (headers.includes('title') && (headers.includes('website') || headers.includes('url')) && headers.includes('password')) {
    const titleIdx = findColumnIndex(['title']);
    const webIdx = findColumnIndex(['website', 'url', 'uri']);
    const userIdx = findColumnIndex(['username']);
    const passIdx = findColumnIndex(['password']);
    const notesIdx = findColumnIndex(['notes']);

    const items: Partial<VaultItem>[] = dataRows.map(row => {
      const rawTitle = titleIdx !== -1 ? row[titleIdx] : '';
      const username = (userIdx !== -1 ? row[userIdx] : '') || '';
      const url = (webIdx !== -1 ? row[webIdx] : '') || '';
      const notes = (notesIdx !== -1 ? row[notesIdx] : '') || '';
      const title = buildImportedTitle(rawTitle, username, url, notes, copy.untitledUniversal);
      return {
        title,
        username,
        password: (passIdx !== -1 ? row[passIdx] : '') || '',
        url,
        notes,
        category: 'login',
      };
    });

    return { type: 'success', items, formatName: copy.formatOnePasswordCsv };
  }

  // 5. Universal CSV Fallback mapper (Detect columns based on synonyms)
  const titleIdx = findColumnIndex(['title', 'name', 'label', 'app', 'site', 'service']);
  const userIdx = findColumnIndex(['username', 'user', 'login', 'email', 'e-posta', 'e_posta']);
  const passIdx = findColumnIndex(['password', 'pass', 'pwd', '\u015fifre', 'sifre', 'parola']);
  const urlIdx = findColumnIndex(['url', 'website', 'link', 'uri']);
  const notesIdx = findColumnIndex(['notes', 'note', 'desc', 'description', 'not', 'notlar', 'extra']);
  const totpIdx = findColumnIndex(['totp', 'secret', 'key', 'otp', '2fa', 'authenticator']);

  if (titleIdx !== -1 || userIdx !== -1 || passIdx !== -1) {
    // Always materialise a non-empty title slot so a CSV row with an empty
    // title cell plus an empty username cell does not get rejected by the
    // downstream "item must have title or username" schema check. The
    // buildImportedTitle helper falls through username -> url host ->
    // notes first line before defaulting to the localized
    // "İsimsiz Aktarım" placeholder.
    const items: Partial<VaultItem>[] = dataRows.map(row => {
      const rawTitle = titleIdx !== -1 ? row[titleIdx] : '';
      const username = userIdx !== -1 ? row[userIdx] : '';
      const url = urlIdx !== -1 ? row[urlIdx] : '';
      const notes = notesIdx !== -1 ? row[notesIdx] : '';
      const title = buildImportedTitle(rawTitle, username, url, notes, copy.untitledUniversal);
      return {
        title,
        username: username || '',
        password: passIdx !== -1 ? row[passIdx] : '',
        url: url || '',
        notes: notes || '',
        totpSecret: totpIdx !== -1 ? row[totpIdx] : '',
        category: 'login',
      };
    });

    return { type: 'success', items, formatName: copy.formatUniversalCsv };
  }

  return { type: 'error', message: copy.errorCsvColumns };
}

export { decodeFileBuffer } from './fileDecoder';
