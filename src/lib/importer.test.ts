import { describe, expect, it } from 'vitest';
import { parseCSV, parseUniversalImport, decodeFileBuffer } from './importer';

describe('universal importer', () => {

  it('returns no rows for an empty CSV string', () => {
    expect(parseCSV('')).toEqual([]);
  });

  it('auto-detects semicolon and tab delimiters', () => {
    expect(parseCSV('name;username;password\nGitHub;octo;secret')).toEqual([
      ['name', 'username', 'password'],
      ['GitHub', 'octo', 'secret'],
    ]);
    expect(parseCSV('name\tusername\tpassword\nGitHub\tocto\tsecret')).toEqual([
      ['name', 'username', 'password'],
      ['GitHub', 'octo', 'secret'],
    ]);
  });

  it('handles CRLF rows and quoted final fields', () => {
    expect(parseCSV('name,notes\r\nMail,"quoted note"\r\n')).toEqual([
      ['name', 'notes'],
      ['Mail', 'quoted note'],
    ]);
  });

  it('keeps comma as the tie-break delimiter and ignores blank rows', () => {
    expect(parseCSV('name,url;note\nSite,https://example.com;main\n,,\n')).toEqual([
      ['name', 'url;note'],
      ['Site', 'https://example.com;main'],
    ]);
  });

  it('preserves delimiters and escaped quotes inside quoted CSV fields', () => {
    expect(parseCSV('name,notes\n"Site","quoted, semicolon; tab\t and ""quote"""')).toEqual([
      ['name', 'notes'],
      ['Site', 'quoted, semicolon; tab\t and "quote"'],
    ]);
  });

  it('handles CR-only rows and preserves quoted inner whitespace', () => {
    expect(parseCSV(' name , notes \r " Mail " , " quoted note " ')).toEqual([
      ['name', 'notes'],
      [' Mail ', ' quoted note '],
    ]);
  });

  it('parses quoted CSV values with commas, escaped quotes, and newlines', () => {
    const rows = parseCSV('name,notes\n"GitHub, Main","line 1\nline ""2"""');

    expect(rows).toEqual([
      ['name', 'notes'],
      ['GitHub, Main', 'line 1\nline "2"'],
    ]);
  });

  it('returns a readable error for empty files', () => {
    const result = parseUniversalImport('   ');

    expect(result.type).toBe('error');
    if (result.type !== 'error') return;
    expect(result.message).toBeTruthy();
  });

  it('uses localized importer labels when provided', () => {
    const emptyResult = parseUniversalImport('   ', {
      errorEmpty: 'The file is empty.',
    });

    expect(emptyResult.type).toBe('error');
    if (emptyResult.type !== 'error') return;
    expect(emptyResult.message).toBe('The file is empty.');

    const csvResult = parseUniversalImport('email,pwd\nowner@example.com,secret', {
      untitledUniversal: 'Untitled Import',
      formatUniversalCsv: 'Universal Column-Compatible CSV',
    });

    expect(csvResult.type).toBe('success');
    if (csvResult.type !== 'success') return;
    expect(csvResult.formatName).toBe('Universal Column-Compatible CSV');
    // The smart title builder falls through to the username when the
    // title cell is empty, so the localized `untitledUniversal`
    // placeholder is only used when both title and username are empty.
    expect(csvResult.items[0]).toMatchObject({
      title: 'owner@example.com',
      username: 'owner@example.com',
      password: 'secret',
    });
  });

  it('uses localized labels across every default label boundary', () => {
    const labels = {
      errorEmpty: 'empty-x',
      formatAegisJson: 'aegis-x',
      formatBitwardenJson: 'bitwarden-json-x',
      errorUnsupportedJson: 'unsupported-json-x',
      errorJsonPrefix: 'json-prefix-x',
      errorCsvHeader: 'csv-header-x',
      formatBitwardenCsv: 'bitwarden-csv-x',
      formatLastPassCsv: 'lastpass-x',
      formatChromeCsv: 'chrome-x',
      formatOnePasswordCsv: 'onepassword-x',
      untitledUniversal: 'untitled-x',
      formatUniversalCsv: 'universal-x',
      errorCsvColumns: 'csv-columns-x',
    };

    const parseSuccess = (content: string) => {
      const result = parseUniversalImport(content, labels);
      expect(result.type).toBe('success');
      if (result.type !== 'success') throw new Error('Expected successful import');
      return result;
    };

    expect(parseUniversalImport('', labels)).toEqual({ type: 'error', message: 'empty-x' });
    expect(parseSuccess('[{}]').formatName).toBe('aegis-x');
    expect(parseSuccess('{"items":[]}').formatName).toBe('bitwarden-json-x');
    expect(parseUniversalImport('{"unknown":true}', labels)).toEqual({ type: 'error', message: 'unsupported-json-x' });
    const malformed = parseUniversalImport('{"items": [', labels);
    expect(malformed.type === 'error' ? malformed.message : '').toContain('json-prefix-x');
    expect(parseUniversalImport('name,password', labels)).toEqual({ type: 'error', message: 'csv-header-x' });
    expect(parseSuccess('login_username,login_password\nu,p').formatName).toBe('bitwarden-csv-x');
    expect(parseSuccess('grouping,extra\ng,n').formatName).toBe('lastpass-x');
    expect(parseSuccess('name,url,username,password\ns,u,p,w').formatName).toBe('chrome-x');
    expect(parseSuccess('title,website,password\ns,u,p').formatName).toBe('onepassword-x');
    const universal = parseSuccess('email,pwd\nu,p');
    expect(universal.formatName).toBe('universal-x');
    // The smart title builder falls through to the username ('u') when
    // the title cell is empty, so the localized `untitledUniversal`
    // placeholder is only used when both title and username are empty.
    expect(universal.items[0]!.title).toBe('u');
    expect(parseUniversalImport('alpha,beta\na,b', labels)).toEqual({ type: 'error', message: 'csv-columns-x' });
  });


  it('uses stable default labels for supported import formats and errors', () => {
    const empty = parseUniversalImport('   ');
    expect(empty).toEqual({ type: 'error', message: 'File content is empty.' });

    const unsupportedJson = parseUniversalImport('{"unknown":true}');
    expect(unsupportedJson).toEqual({ type: 'error', message: 'Unsupported or unrecognized JSON structure.' });

    const csvHeader = parseUniversalImport('name,password');
    expect(csvHeader).toEqual({ type: 'error', message: 'Empty CSV file or missing header row.' });

    const badCsv = parseUniversalImport('alpha,beta\na,b');
    expect(badCsv).toEqual({
      type: 'error',
      message: 'CSV structure could not be resolved. No password or username columns were found.',
    });
  });

  it('returns a readable error for malformed JSON', () => {
    const result = parseUniversalImport('{"items": [');

    expect(result.type).toBe('error');
    if (result.type !== 'error') return;
    expect(result.message).toContain('JSON');
  });


  it('reports stable default format names for all supported import formats', () => {
    const aegis = parseUniversalImport('[{}]');
    expect(aegis.type === 'success' ? aegis.formatName : '').toBe('Aegis Secure JSON Backup');

    const bitwardenJson = parseUniversalImport('{"items":[]}');
    expect(bitwardenJson.type === 'success' ? bitwardenJson.formatName : '').toBe('Bitwarden Password Manager (JSON)');

    const bitwardenCsv = parseUniversalImport('login_username,login_password\nu,p');
    expect(bitwardenCsv.type === 'success' ? bitwardenCsv.formatName : '').toBe('Bitwarden Import (CSV)');

    const lastPass = parseUniversalImport('grouping,extra\nPersonal,note');
    expect(lastPass.type === 'success' ? lastPass.formatName : '').toBe('LastPass Password Import (CSV)');

    const chrome = parseUniversalImport('name,url,username,password\nSite,https://example.com,u,p');
    expect(chrome.type === 'success' ? chrome.formatName : '').toBe('Google Chrome / Password Manager (CSV)');

    const onePassword = parseUniversalImport('title,website,password\nSite,https://example.com,p');
    expect(onePassword.type === 'success' ? onePassword.formatName : '').toBe('1Password Password Import (CSV)');

    const universal = parseUniversalImport('email,pwd\nu,p');
    expect(universal.type === 'success' ? universal.formatName : '').toBe('Universal Column-Compatible CSV');
  });

  it('parses native Aegis JSON array backups', () => {
    const result = parseUniversalImport(
      JSON.stringify([
        {
          title: 'Card',
          username: 'ignored',
          password: 'secret',
          category: 'card',
          favorite: true,
          cardholderName: 'Ada Lovelace',
          cardNumber: '4111111111111111',
          cardExpiry: '12/30',
          cardCvv: '123',
          cardPin: '0000',
        },
      ]),
    );

    expect(result.type).toBe('success');
    if (result.type !== 'success') return;
    expect(result.formatName).toContain('Aegis');
    expect(result.items[0]).toMatchObject({
      title: 'Card',
      category: 'card',
      favorite: true,
      cardholderName: 'Ada Lovelace',
      cardNumber: '4111111111111111',
      cardExpiry: '12/30',
      cardCvv: '123',
      cardPin: '0000',
    });
  });

  it('applies safe defaults for sparse native Aegis JSON items', () => {
    const result = parseUniversalImport(JSON.stringify([{}]));

    expect(result.type).toBe('success');
    if (result.type !== 'success') return;
    expect(result.items[0]).toMatchObject({
      title: 'Untitled Import',
      username: '',
      password: '',
      url: '',
      notes: '',
      totpSecret: '',
      category: 'login',
      favorite: false,
    });
  });

  it('parses Bitwarden JSON exports across item types', () => {
    const result = parseUniversalImport(
      JSON.stringify({
        items: [
          {
            type: 1,
            name: 'GitHub',
            favorite: true,
            notes: 'dev account',
            login: {
              username: 'octo@example.com',
              password: 'secret',
              uris: [{ uri: 'https://github.com' }],
              totp: 'JBSWY3DPEHPK3PXP',
            },
          },
          {
            type: 2,
            name: 'Recovery',
            notes: 'store offline',
          },
          {
            type: 3,
            name: 'Visa',
            card: {
              cardholderName: 'Ada Lovelace',
              number: '4111111111111111',
              code: '123',
              expMonth: '12',
              expYear: '2030',
            },
          },
          {
            type: 4,
            name: 'Passport',
            identity: {
              firstName: 'Ada',
              lastName: 'Lovelace',
              passportNumber: 'P123',
            },
          },
        ],
      }),
    );

    expect(result.type).toBe('success');
    if (result.type !== 'success') return;
    expect(result.formatName).toContain('Bitwarden');
    expect(result.items).toHaveLength(4);
    expect(result.items[0]).toMatchObject({
      category: 'login',
      username: 'octo@example.com',
      password: 'secret',
      url: 'https://github.com',
      totpSecret: 'JBSWY3DPEHPK3PXP',
      favorite: true,
    });
    expect(result.items[1]).toMatchObject({ category: 'secure_note', notes: 'store offline' });
    expect(result.items[2]).toMatchObject({
      category: 'card',
      cardholderName: 'Ada Lovelace',
      cardNumber: '4111111111111111',
      cardExpiry: '12/30',
      cardCvv: '123',
    });
    expect(result.items[3]).toMatchObject({
      category: 'identity',
      idFullName: 'Ada Lovelace',
      idNumber: 'P123',
    });
  });

  it('applies Bitwarden JSON defaults for sparse and unknown item types', () => {
    const result = parseUniversalImport(
      JSON.stringify({
        items: [
          { type: 1, login: {} },
          { type: 3, card: { expMonth: '1' } },
          { type: 4, identity: { ssn: '111-22-3333' } },
          { type: 99, name: '' },
        ],
      }),
    );

    expect(result.type).toBe('success');
    if (result.type !== 'success') return;
    // Items with no name, no username, no url, and no notes all fall
    // through to the localized "İsimsiz Aktarım" placeholder. The
    // previous hard-coded "Untitled Bitwarden" string was replaced by
    // the shared buildImportedTitle helper so the same fallback chain
    // is used across every parser.
    expect(result.items[0]).toMatchObject({
      title: 'Untitled Import',
      notes: '',
      favorite: false,
      category: 'login',
    });
    expect(result.items[1]).toMatchObject({
      category: 'card',
      cardholderName: '',
      cardNumber: '',
      cardCvv: '',
      cardPin: '',
      cardExpiry: '',
    });
    expect(result.items[2]).toMatchObject({
      category: 'identity',
      idFullName: '',
      idNumber: '111-22-3333',
      idGender: '',
    });
    expect(result.items[3]).toMatchObject({
      title: 'Untitled Import',
      category: 'login',
    });
  });

  it('returns an error for unsupported JSON objects', () => {
    const result = parseUniversalImport(JSON.stringify({ vault: 'unknown' }));

    expect(result.type).toBe('error');
    if (result.type !== 'error') return;
    expect(result.message).toBeTruthy();
  });

  it('parses Google Password Manager CSV exports', () => {
    const result = parseUniversalImport(
      'name,url,username,password,note\nGitHub,https://github.com,octo@example.com,secret,main account',
    );

    expect(result.type).toBe('success');
    if (result.type !== 'success') return;

    expect(result.formatName).toContain('Google');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      title: 'GitHub',
      username: 'octo@example.com',
      password: 'secret',
      url: 'https://github.com',
      notes: 'main account',
      category: 'login',
    });
  });

  it('parses Bitwarden CSV exports and maps category and favorite fields', () => {
    const result = parseUniversalImport(
      [
        'folder,favorite,type,name,notes,fields,login_uri,login_username,login_password,login_totp',
        'Personal,true,login,GitHub,main account,,https://github.com,octo@example.com,secret,JBSWY3DPEHPK3PXP',
        'Personal,false,note,Recovery,offline note,,,,',
      ].join('\n'),
    );

    expect(result.type).toBe('success');
    if (result.type !== 'success') return;
    expect(result.formatName).toContain('Bitwarden');
    expect(result.items[0]).toMatchObject({
      title: 'GitHub',
      favorite: true,
      category: 'login',
      username: 'octo@example.com',
      password: 'secret',
      url: 'https://github.com',
      totpSecret: 'JBSWY3DPEHPK3PXP',
    });
    expect(result.items[1]).toMatchObject({
      title: 'Recovery',
      category: 'secure_note',
      notes: 'offline note',
    });
  });

  it('parses Bitwarden CSV numeric category and favorite variants', () => {
    const result = parseUniversalImport(
      [
        'favorite,type,title,login_username,login_password,uri,otp,notes',
        '1,3,Payment,,,https://pay.example.com,123456,card note',
        '0,4,Identity,,,,,',
      ].join('\n'),
    );

    expect(result.type).toBe('success');
    if (result.type !== 'success') return;
    expect(result.items[0]).toMatchObject({
      title: 'Payment',
      favorite: true,
      category: 'card',
      username: '',
      password: '',
      url: 'https://pay.example.com',
      totpSecret: '123456',
      notes: 'card note',
    });
    expect(result.items[1]).toMatchObject({
      title: 'Identity',
      favorite: false,
      category: 'identity',
    });
  });

  it('parses LastPass CSV exports', () => {
    const result = parseUniversalImport(
      'url,username,password,extra,name,grouping,fav\nhttps://mail.example.com,mail@example.com,secret,"note, with comma",Mail,Email,1',
    );

    expect(result.type).toBe('success');
    if (result.type !== 'success') return;
    expect(result.formatName).toContain('LastPass');
    expect(result.items[0]).toMatchObject({
      title: 'Mail',
      username: 'mail@example.com',
      password: 'secret',
      url: 'https://mail.example.com',
      notes: 'note, with comma',
      favorite: true,
      category: 'login',
    });
  });

  it('applies LastPass CSV fallbacks for missing optional credential columns', () => {
    const result = parseUniversalImport('grouping,extra,favorite\nPersonal,,true');

    expect(result.type).toBe('success');
    if (result.type !== 'success') return;
    // The smart title builder falls through username -> url host -> notes
    // first line -> the localized placeholder, so a row with no name,
    // no url and no notes lands on the shared "İsimsiz Aktarım" string.
    expect(result.items[0]).toMatchObject({
      title: 'Untitled Import',
      username: '',
      password: '',
      url: '',
      notes: '',
      favorite: true,
      category: 'login',
    });
  });

  it('parses 1Password CSV exports', () => {
    const result = parseUniversalImport(
      'title,url,username,password,notes\nAdmin,https://admin.example.com,root,secret,privileged',
    );

    expect(result.type).toBe('success');
    if (result.type !== 'success') return;
    expect(result.formatName).toContain('1Password');
    expect(result.items[0]).toMatchObject({
      title: 'Admin',
      username: 'root',
      password: 'secret',
      url: 'https://admin.example.com',
      notes: 'privileged',
      category: 'login',
    });
  });

  it('uses universal CSV fallback for synonym columns', () => {
    const result = parseUniversalImport(
      'service,email,parola,link,notlar,2fa\nInternal,owner@example.com,secret,https://internal.example.com,private,JBSWY3DPEHPK3PXP',
    );

    expect(result.type).toBe('success');
    if (result.type !== 'success') return;
    expect(result.formatName).toContain('Universal');
    expect(result.items[0]).toMatchObject({
      title: 'Internal',
      username: 'owner@example.com',
      password: 'secret',
      url: 'https://internal.example.com',
      notes: 'private',
      totpSecret: 'JBSWY3DPEHPK3PXP',
      category: 'login',
    });
  });

  it('uses universal CSV fallback when only username and password columns are present', () => {
    const result = parseUniversalImport('email,pwd\nowner@example.com,secret');

    expect(result.type).toBe('success');
    if (result.type !== 'success') return;
    // The smart title builder falls through to the username when the
    // title cell is empty, so this row's title should now equal the
    // username instead of the localized "İsimsiz Aktarım" placeholder.
    expect(result.items[0]).toMatchObject({
      title: 'owner@example.com',
      username: 'owner@example.com',
      password: 'secret',
      url: '',
      notes: '',
      totpSecret: '',
      category: 'login',
    });
  });

  it('uses universal CSV fallback with title-only and partial column aliases', () => {
    const result = parseUniversalImport('service label,login email,password value,description text,authenticator key\nPortal,owner@example.com,secret,private,JBSWY3DPEHPK3PXP');

    expect(result.type).toBe('success');
    if (result.type !== 'success') return;
    expect(result.items[0]).toMatchObject({
      title: 'Portal',
      username: 'owner@example.com',
      password: 'secret',
      notes: 'private',
      totpSecret: 'JBSWY3DPEHPK3PXP',
    });
  });

  it('returns a readable error for CSV without usable credential columns', () => {
    const result = parseUniversalImport('alpha,beta\na,b');

    expect(result.type).toBe('error');
    if (result.type !== 'error') return;
    expect(result.message).toBeTruthy();
  });

  it('detects encrypted Aegis backup envelopes', () => {
    const result = parseUniversalImport(
      JSON.stringify({
        version: '1.1',
        kdf: 'Argon2id',
        salt: 'abc',
        payload: 'encrypted',
      }),
    );

    expect(result.type).toBe('encrypted_aegis');
  });

  it('requires encrypted Aegis envelopes to include salt and payload', () => {
    expect(parseUniversalImport(JSON.stringify({ version: '1.1', salt: 'abc' })).type).toBe('error');
    expect(parseUniversalImport(JSON.stringify({ kdf: 'Argon2id', payload: 'encrypted' })).type).toBe('error');
    expect(parseUniversalImport(JSON.stringify({ encrypted: true, salt: 'abc', payload: 'encrypted' })).type).toBe('encrypted_aegis');
  });

  it('returns a readable error for unsupported files', () => {
    const result = parseUniversalImport('just some text');

    expect(result.type).toBe('error');
    if (result.type !== 'error') return;
    expect(result.message).toBeTruthy();
  });

  describe('decodeFileBuffer', () => {
    it('returns empty string for empty buffer', () => {
      const buffer = new ArrayBuffer(0);
      expect(decodeFileBuffer(buffer)).toBe('');
    });

    it('decodes standard UTF-8 text', () => {
      const text = 'Hello world, hello Türkçe';
      const encoder = new TextEncoder();
      const buffer = encoder.encode(text).buffer;
      expect(decodeFileBuffer(buffer)).toBe(text);
    });

    it('decodes UTF-8 with BOM', () => {
      const text = 'BOM test';
      const arr = new Uint8Array([0xEF, 0xBB, 0xBF, ...new TextEncoder().encode(text)]);
      expect(decodeFileBuffer(arr.buffer)).toBe(text);
    });

    it('decodes UTF-16 LE with BOM', () => {
      const text = 'UTF-16 LE BOM test';
      const encoded = new Uint16Array([0xFEFF, ...Array.from(text).map(c => c.charCodeAt(0))]);
      expect(decodeFileBuffer(encoded.buffer)).toBe(text);
    });

    it('decodes UTF-16 LE without BOM (heuristics)', () => {
      const text = 'This is a heuristic test for UTF-16 LE without BOM';
      const arr = new Uint8Array(text.length * 2);
      for (let i = 0; i < text.length; i++) {
        arr[i * 2] = text.charCodeAt(i);
        arr[i * 2 + 1] = 0;
      }
      expect(decodeFileBuffer(arr.buffer)).toBe(text);
    });


    it('decodes UTF-16 BE with BOM', () => {
      const text = 'BE';
      const arr = new Uint8Array([0xFE, 0xFF, 0x00, 0x42, 0x00, 0x45]);
      expect(decodeFileBuffer(arr.buffer)).toBe(text);
    });

    it('decodes UTF-16 BE without BOM (heuristics)', () => {
      const text = 'This is a heuristic test for UTF-16 BE without BOM';
      const arr = new Uint8Array(text.length * 2);
      for (let i = 0; i < text.length; i++) {
        arr[i * 2] = 0;
        arr[i * 2 + 1] = text.charCodeAt(i);
      }
      expect(decodeFileBuffer(arr.buffer)).toBe(text);
    });

    it('decodes Turkish Windows-1254 text when UTF-8 is invalid', () => {
      const arr = new Uint8Array([115, 0xFE, 103, 0xF0]); // 's' + 'ş' + 'g' + 'ğ' in Windows-1254
      const decoded = decodeFileBuffer(arr.buffer);
      expect(decoded).toContain('ş');
      expect(decoded).toContain('ğ');
    });
  });
});
