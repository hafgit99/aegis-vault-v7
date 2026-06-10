import { describe, expect, it } from 'vitest';
import { parseCSV, parseUniversalImport } from './importer';

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
    expect(result.formatName).toContain('Evrensel');
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
});
