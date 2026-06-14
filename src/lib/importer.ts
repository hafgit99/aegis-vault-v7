/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultItem } from '../types';

/**
 * Fast and robust, quote-aware CSV parser that handles quotes, nested commas, and newlines.
 * Automatically detects delimiter (comma, semicolon, or tab) to support Excel/European exports.
 */
export function parseCSV(text: string): string[][] {
  if (!text) return [];

  // Auto-detect delimiter based on occurrences in the first line
  const firstLine = text.split(/\r?\n/)[0] || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  let delimiter = ',';
  if (semicolonCount > commaCount && semicolonCount > tabCount) {
    delimiter = ';';
  } else if (tabCount > commaCount && tabCount > semicolonCount) {
    delimiter = '\t';
  }

  const result: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let startIdx = 0;
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const char = text[i];

    if (char === '"') {
      // Look ahead to check if it's an escaped quote ("")
      if (inQuotes && text[i + 1] === '"') {
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      let val = text.substring(startIdx, i);
      
      // Clean quotes
      val = val.trim();
      if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
        val = val.substring(1, val.length - 1);
      }
      val = val.replace(/""/g, '"');
      
      row.push(val);
      startIdx = i + 1;
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      let val = text.substring(startIdx, i);
      
      val = val.trim();
      if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
        val = val.substring(1, val.length - 1);
      }
      val = val.replace(/""/g, '"');
      
      row.push(val);

      if (row.length > 0 && row.some(x => x !== '')) {
        result.push(row);
      }
      row = [];

      if (char === '\r' && text[i + 1] === '\n') {
        i++; // Skip LF after CR
      }
      startIdx = i + 1;
    }
  }

  // Handle last remaining field
  if (startIdx < len) {
    let val = text.substring(startIdx);
    val = val.trim();
    if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
      val = val.substring(1, val.length - 1);
    }
    val = val.replace(/""/g, '"');
    row.push(val);
  }

  if (row.length > 0 && row.some(x => x !== '')) {
    result.push(row);
  }

  return result.filter(r => r.length > 0 && r.some(val => val !== ''));
}

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

const defaultImportLabels: ImportLabels = {
  errorEmpty: 'File content is empty.',
  formatAegisJson: 'Aegis Secure JSON Backup',
  formatBitwardenJson: 'Bitwarden Password Manager (JSON)',
  errorUnsupportedJson: 'Unsupported or unrecognized JSON structure.',
  errorJsonPrefix: 'JSON format error',
  errorCsvHeader: 'Empty CSV file or missing header row.',
  formatBitwardenCsv: 'Bitwarden Import (CSV)',
  formatLastPassCsv: 'LastPass Password Import (CSV)',
  formatChromeCsv: 'Google Chrome / Password Manager (CSV)',
  formatOnePasswordCsv: '1Password Password Import (CSV)',
  untitledUniversal: 'Untitled Import',
  formatUniversalCsv: 'Universal Column-Compatible CSV',
  errorCsvColumns: 'CSV structure could not be resolved. No password or username columns were found.',
};

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
        const items: Partial<VaultItem>[] = parsed.map(x => ({
          title: x.title || 'Untitled Import',
          username: x.username || '',
          password: x.password || '',
          url: x.url || '',
          notes: x.notes || '',
          totpSecret: x.totpSecret || '',
          category: x.category || 'login',
          favorite: !!x.favorite,
          cardholderName: x.cardholderName,
          cardNumber: x.cardNumber,
          cardExpiry: x.cardExpiry,
          cardCvv: x.cardCvv,
          cardPin: x.cardPin,
          idNumber: x.idNumber,
          idFullName: x.idFullName,
          idBirthDate: x.idBirthDate,
          idExpiryDate: x.idExpiryDate,
          idGender: x.idGender,
          passkeyService: x.passkeyService,
          passkeyPrivateExponent: x.passkeyPrivateExponent,
          passkeyPublicId: x.passkeyPublicId,
        }));
        return { type: 'success', items, formatName: copy.formatAegisJson };
      }

      // 3. Bitwarden JSON structure
      if (parsed.items && Array.isArray(parsed.items)) {
        const items: Partial<VaultItem>[] = [];
        parsed.items.forEach((bw: any) => {
          const item: Partial<VaultItem> = {
            title: bw.name || 'Untitled Bitwarden',
            notes: bw.notes || '',
            favorite: !!bw.favorite,
          };

          // Bitwarden Types: 1=Login, 2=SecureNote, 3=Card, 4=Identity
          if (bw.type === 1) {
            item.category = 'login';
            if (bw.login) {
              item.username = bw.login.username || '';
              item.password = bw.login.password || '';
              item.url = (bw.login.uris && bw.login.uris[0]?.uri) || '';
              item.totpSecret = bw.login.totp || '';
            }
          } else if (bw.type === 2) {
            item.category = 'secure_note';
          } else if (bw.type === 3) {
            item.category = 'card';
            if (bw.card) {
              item.cardholderName = bw.card.cardholderName || '';
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
              item.idFullName = `${bw.identity.firstName || ''} ${bw.identity.lastName || ''}`.trim();
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
  if (rows.length < 2) {
    return { type: 'error', message: copy.errorCsvHeader };
  }

  const headers = rows[0].map(h => h.toLowerCase().trim().replace(/^["']|["']$/g, ''));
  const dataRows = rows.slice(1);

  // Helper helper to locate column index by aliases
  const findColumnIndex = (aliases: string[]): number => {
    const exactMatch = headers.findIndex(h => aliases.some(alias => h === alias));
    if (exactMatch !== -1) {
      return exactMatch;
    }
    return headers.findIndex(h => aliases.some(alias => h.includes(alias)));
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
      const typeStr = (typeIdx !== -1 ? row[typeIdx] : 'login').toLowerCase();
      let category: 'login' | 'card' | 'identity' | 'secure_note' = 'login';
      if (typeStr.includes('note') || typeStr === '2') category = 'secure_note';
      else if (typeStr.includes('card') || typeStr === '3') category = 'card';
      else if (typeStr.includes('identity') || typeStr === '4') category = 'identity';

      return {
        title: (nameIdx !== -1 ? row[nameIdx] : 'Untitled Import') || 'Untitled Import',
        username: (userIdx !== -1 ? row[userIdx] : '') || '',
        password: (passIdx !== -1 ? row[passIdx] : '') || '',
        url: (uriIdx !== -1 ? row[uriIdx] : '') || '',
        totpSecret: (totpIdx !== -1 ? row[totpIdx] : '') || '',
        notes: (notesIdx !== -1 ? row[notesIdx] : '') || '',
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

    const items: Partial<VaultItem>[] = dataRows.map(row => ({
      title: (nameIdx !== -1 ? row[nameIdx] : 'Untitled LastPass') || 'Untitled LastPass',
      username: (userIdx !== -1 ? row[userIdx] : '') || '',
      password: (passIdx !== -1 ? row[passIdx] : '') || '',
      url: (urlIdx !== -1 ? row[urlIdx] : '') || '',
      notes: (extraIdx !== -1 ? row[extraIdx] : '') || '',
      favorite: favIdx !== -1 ? row[favIdx] === '1' || row[favIdx] === 'true' : false,
      category: 'login',
    }));

    return { type: 'success', items, formatName: copy.formatLastPassCsv };
  }

  // 3. Google Password Manager CSV detection: "name,url,username,password,note"
  if (headers.includes('name') && headers.includes('url') && headers.includes('username') && headers.includes('password')) {
    const nameIdx = findColumnIndex(['name']);
    const urlIdx = findColumnIndex(['url']);
    const userIdx = findColumnIndex(['username']);
    const passIdx = findColumnIndex(['password']);
    const noteIdx = findColumnIndex(['note', 'notes']);

    const items: Partial<VaultItem>[] = dataRows.map(row => ({
      title: (nameIdx !== -1 ? row[nameIdx] : 'Untitled Chrome') || 'Untitled Chrome',
      username: (userIdx !== -1 ? row[userIdx] : '') || '',
      password: (passIdx !== -1 ? row[passIdx] : '') || '',
      url: (urlIdx !== -1 ? row[urlIdx] : '') || '',
      notes: (noteIdx !== -1 ? row[noteIdx] : '') || '',
      category: 'login',
    }));

    return { type: 'success', items, formatName: copy.formatChromeCsv };
  }

  // 4. 1Password CSV detection: "title,website,username,password,notes,etc" or "title,url,username,password"
  if (headers.includes('title') && (headers.includes('website') || headers.includes('url')) && headers.includes('password')) {
    const titleIdx = findColumnIndex(['title']);
    const webIdx = findColumnIndex(['website', 'url', 'uri']);
    const userIdx = findColumnIndex(['username']);
    const passIdx = findColumnIndex(['password']);
    const notesIdx = findColumnIndex(['notes']);

    const items: Partial<VaultItem>[] = dataRows.map(row => ({
      title: (titleIdx !== -1 ? row[titleIdx] : 'Untitled 1Password') || 'Untitled 1Password',
      username: (userIdx !== -1 ? row[userIdx] : '') || '',
      password: (passIdx !== -1 ? row[passIdx] : '') || '',
      url: (webIdx !== -1 ? row[webIdx] : '') || '',
      notes: (notesIdx !== -1 ? row[notesIdx] : '') || '',
      category: 'login',
    }));

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
    const items: Partial<VaultItem>[] = dataRows.map(row => ({
      title: titleIdx !== -1 ? row[titleIdx] : copy.untitledUniversal,
      username: userIdx !== -1 ? row[userIdx] : '',
      password: passIdx !== -1 ? row[passIdx] : '',
      url: urlIdx !== -1 ? row[urlIdx] : '',
      notes: notesIdx !== -1 ? row[notesIdx] : '',
      totpSecret: totpIdx !== -1 ? row[totpIdx] : '',
      category: 'login',
    }));

    return { type: 'success', items, formatName: copy.formatUniversalCsv };
  }

  return { type: 'error', message: copy.errorCsvColumns };
}

/**
 * Decodes a binary ArrayBuffer into a string, auto-detecting UTF-8, UTF-16,
 * and falling back to Turkish Windows-1254 if the text is invalid UTF-8.
 */
export function decodeFileBuffer(buffer: ArrayBuffer): string {
  const arr = new Uint8Array(buffer);
  if (arr.length === 0) return '';

  // 1. Check for BOM (Byte Order Mark)
  // UTF-8 BOM: EF BB BF
  if (arr.length >= 3 && arr[0] === 0xEF && arr[1] === 0xBB && arr[2] === 0xBF) {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(arr.subarray(3));
  }

  // UTF-16 LE BOM: FF FE
  if (arr.length >= 2 && arr[0] === 0xFF && arr[1] === 0xFE) {
    const decoder = new TextDecoder('utf-16le');
    return decoder.decode(arr.subarray(2));
  }

  // UTF-16 BE BOM: FE FF
  if (arr.length >= 2 && arr[0] === 0xFE && arr[1] === 0xFF) {
    const decoder = new TextDecoder('utf-16be');
    return decoder.decode(arr.subarray(2));
  }

  // 2. Heuristics for UTF-16 without BOM (e.g. sample null bytes)
  let nullEven = 0;
  let nullOdd = 0;
  const sampleSize = Math.min(arr.length, 200);
  for (let i = 0; i < sampleSize; i++) {
    if (arr[i] === 0) {
      if (i % 2 === 0) nullEven++;
      else nullOdd++;
    }
  }

  const threshold = Math.floor(sampleSize / 4);
  if (sampleSize >= 4 && (nullEven > threshold || nullOdd > threshold)) {
    const encoding = nullOdd > nullEven ? 'utf-16le' : 'utf-16be';
    const decoder = new TextDecoder(encoding);
    return decoder.decode(arr);
  }

  // 3. Fallback logic: UTF-8 vs Turkish Windows-1254 (ISO-8859-9)
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    return utf8Decoder.decode(arr);
  } catch (err) {
    // If UTF-8 decoding throws a fatal error, fall back to Turkish Windows-1254
    const trDecoder = new TextDecoder('windows-1254');
    return trDecoder.decode(arr);
  }
}

