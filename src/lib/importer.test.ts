import { describe, expect, it } from 'vitest';
import { parseCSV, parseUniversalImport, decodeFileBuffer } from './importer';

describe('universal importer', () => {
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
    expect(csvResult.items[0]).toMatchObject({
      title: 'Untitled Import',
      username: 'owner@example.com',
      password: 'secret',
    });
  });

  it('returns a readable error for malformed JSON', () => {
    const result = parseUniversalImport('{"items": [');

    expect(result.type).toBe('error');
    if (result.type !== 'error') return;
    expect(result.message).toContain('JSON');
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
          { type: 1 },
          { type: 3, card: { expMonth: '1' } },
          { type: 4, identity: { ssn: '111-22-3333' } },
          { type: 99, name: '' },
        ],
      }),
    );

    expect(result.type).toBe('success');
    if (result.type !== 'success') return;
    expect(result.items[0]).toMatchObject({
      title: 'Untitled Bitwarden',
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
      title: 'Untitled Bitwarden',
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
        'favorite,type,name,login_username,login_password',
        '1,3,Payment,,',
        '0,4,Identity,,',
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
    const result = parseUniversalImport('grouping,extra\nPersonal,');

    expect(result.type).toBe('success');
    if (result.type !== 'success') return;
    expect(result.items[0]).toMatchObject({
      title: 'Untitled LastPass',
      username: '',
      password: '',
      url: '',
      notes: '',
      favorite: false,
      category: 'login',
    });
  });

  it('parses 1Password CSV exports', () => {
    const result = parseUniversalImport(
      'title,website,username,password,notes\nAdmin,https://admin.example.com,root,secret,privileged',
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
    expect(result.items[0]).toMatchObject({
      title: expect.stringContaining('Untitled'),
      username: 'owner@example.com',
      password: 'secret',
      url: '',
      notes: '',
      totpSecret: '',
      category: 'login',
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

    it('decodes Turkish Windows-1254 text when UTF-8 is invalid', () => {
      const arr = new Uint8Array([115, 0xFE, 103, 0xF0]); // 's' + 'ş' + 'g' + 'ğ' in Windows-1254
      const decoded = decodeFileBuffer(arr.buffer);
      expect(decoded).toContain('ş');
      expect(decoded).toContain('ğ');
    });
  });
});
