import { describe, expect, it } from 'vitest';
import { parseUniversalImport } from './importer';

describe('universal importer', () => {
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
