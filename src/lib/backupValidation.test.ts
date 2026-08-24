/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { validateBackupPayload, MAX_BACKUP_FILE_SIZE } from './backupValidation';

describe('backupValidation', () => {
  it('accepts and parses valid legacy items array', () => {
    const payload = [
      { id: '1', title: 'GitHub', username: 'user1' },
      { id: '2', title: 'Google', username: 'user2' }
    ];

    const result = validateBackupPayload(payload);
    expect(result.items).toHaveLength(2);
    expect(result.attachments).toHaveLength(0);
  });

  it('accepts and parses valid version 7 envelope format', () => {
    const payload = {
      version: 7,
      items: [
        { id: '1', title: 'GitHub', username: 'user1' }
      ],
      attachments: [
        {
          id: 'att-1',
          name: 'doc.txt',
          type: 'text/plain',
          size: 100,
          dataBase64: 'SGVsbG8gV29ybGQ=' // "Hello World" in base64
        }
      ]
    };

    const result = validateBackupPayload(payload);
    expect(result.items).toHaveLength(1);
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].name).toBe('doc.txt');
  });

  it('rejects backup exceeding max file size limit', () => {
    const payload: unknown[] = [];
    const size = MAX_BACKUP_FILE_SIZE + 10;

    expect(() => validateBackupPayload(payload, size)).toThrowError(
      /exceeds limit of 100MB/
    );
  });

  it('rejects items missing required metadata fields', () => {
    const payload = [
      { id: '1', notes: 'no title or username' }
    ];

    expect(() => validateBackupPayload(payload)).toThrowError(
      /missing required title or username/
    );
  });

  it('rejects attachments missing required fields', () => {
    const payload = {
      version: 7,
      items: [{ id: '1', title: 'GitHub' }],
      attachments: [
        { id: 'att-1', name: 'doc.txt' } // missing size, type, dataBase64
      ]
    };

    expect(() => validateBackupPayload(payload)).toThrowError(
      /missing required metadata fields/
    );
  });

  it('rejects attachments exceeding 250MB limit', () => {
    const payload = {
      version: 7,
      items: [{ id: '1', title: 'GitHub' }],
      attachments: [
        {
          id: 'att-1',
          name: 'doc.txt',
          type: 'text/plain',
          size: 260 * 1024 * 1024, // 260 MB
          dataBase64: 'SGVsbG8gV29ybGQ='
        }
      ]
    };

    expect(() => validateBackupPayload(payload)).toThrowError(
      /exceeds limit of 250MB/
    );
  });

  it('rejects attachments with corrupt base64', () => {
    const payload = {
      version: 7,
      items: [{ id: '1', title: 'GitHub' }],
      attachments: [
        {
          id: 'att-1',
          name: 'doc.txt',
          type: 'text/plain',
          size: 100,
          dataBase64: '***corrupt-base64-not-mod-4***'
        }
      ]
    };

    expect(() => validateBackupPayload(payload)).toThrowError(
      /contains corrupt or invalid base64 data/
    );
  });

  it('rejects null or non-object payloads', () => {
    expect(() => validateBackupPayload(null)).toThrowError(/Invalid JSON backup/);
    expect(() => validateBackupPayload('string')).toThrowError(/Invalid JSON backup/);
  });

  it('rejects when attachments is not an array', () => {
    const payload = {
      version: 7,
      items: [{ id: '1', title: 'GitHub' }],
      attachments: 'not-an-array'
    };
    expect(() => validateBackupPayload(payload)).toThrowError(/must be an array/);
  });

  it('rejects when item is not an object', () => {
    const payload = [null];
    expect(() => validateBackupPayload(payload)).toThrowError(/is not an object/);
  });

  it('rejects when attachment is not an object', () => {
    const payload = {
      version: 7,
      items: [{ id: '1', title: 'GitHub' }],
      attachments: [null]
    };
    expect(() => validateBackupPayload(payload)).toThrowError(/is not an object/);
  });

  it('handles missing attachments property cleanly', () => {
    const payload = {
      version: 7,
      items: [{ id: '1', title: 'GitHub' }]
    };
    const result = validateBackupPayload(payload);
    expect(result.attachments).toEqual([]);
  });

  it('rejects attachments with non-string dataBase64', () => {
    const payload = {
      version: 7,
      items: [{ id: '1', title: 'GitHub' }],
      attachments: [
        {
          id: 'att-1',
          name: 'doc.txt',
          type: 'text/plain',
          size: 100,
          dataBase64: 12345 // non-string type
        }
      ]
    };
    expect(() => validateBackupPayload(payload)).toThrowError(/missing required metadata fields/);
  });

  it('rejects attachments with empty string dataBase64', () => {
    const payload = {
      version: 7,
      items: [{ id: '1', title: 'GitHub' }],
      attachments: [
        {
          id: 'att-1',
          name: 'doc.txt',
          type: 'text/plain',
          size: 100,
          dataBase64: '' // empty string
        }
      ]
    };
    expect(() => validateBackupPayload(payload)).toThrowError(/contains corrupt or invalid base64 data/);
  });

  describe('universal import mode (options.fromUniversalImport = true)', () => {
    it('accepts items with only title', () => {
      const payload = [{ id: '1', title: 'My Service' }];
      const result = validateBackupPayload(payload, undefined, { fromUniversalImport: true });
      expect(result.items).toHaveLength(1);
    });

    it('accepts items with only username', () => {
      const payload = [{ id: '1', username: 'admin_user' }];
      const result = validateBackupPayload(payload, undefined, { fromUniversalImport: true });
      expect(result.items).toHaveLength(1);
    });

    it('accepts items with only url', () => {
      const payload = [{ id: '1', url: 'https://example.com' }];
      const result = validateBackupPayload(payload, undefined, { fromUniversalImport: true });
      expect(result.items).toHaveLength(1);
    });

    it('accepts items with only password', () => {
      const payload = [{ id: '1', password: 'SecretPassword123' }];
      const result = validateBackupPayload(payload, undefined, { fromUniversalImport: true });
      expect(result.items).toHaveLength(1);
    });

    it('accepts items with only notes', () => {
      const payload = [{ id: '1', notes: 'Important secret recovery notes' }];
      const result = validateBackupPayload(payload, undefined, { fromUniversalImport: true });
      expect(result.items).toHaveLength(1);
    });

    it('accepts items with only totpSecret', () => {
      const payload = [{ id: '1', totpSecret: 'JBSWY3DPEHPK3PXP' }];
      const result = validateBackupPayload(payload, undefined, { fromUniversalImport: true });
      expect(result.items).toHaveLength(1);
    });

    it('accepts items with only cardNumber', () => {
      const payload = [{ id: '1', cardNumber: '4111222233334444' }];
      const result = validateBackupPayload(payload, undefined, { fromUniversalImport: true });
      expect(result.items).toHaveLength(1);
    });

    it('rejects items with no recognisable vault fields', () => {
      const payload = [{ id: '1', extraCustomField: 'value' }];
      expect(() => validateBackupPayload(payload, undefined, { fromUniversalImport: true })).toThrowError(
        /has no recognisable vault field/
      );
    });

    it('rejects items where fields contain only whitespace', () => {
      const payload = [{ id: '1', title: '   ', username: '  ', url: '  ', notes: '   ' }];
      expect(() => validateBackupPayload(payload, undefined, { fromUniversalImport: true })).toThrowError(
        /has no recognisable vault field/
      );
    });
  });

  describe('RFC 4648 base64 validation and size boundaries', () => {
    it('accepts valid base64 strings with no padding, 1 padding char, and 2 padding chars', () => {
      const validNoPad = 'QUJD'; // "ABC"
      const validOnePad = 'QUI='; // "AB"
      const validTwoPad = 'QQ=='; // "A"

      for (const b64 of [validNoPad, validOnePad, validTwoPad]) {
        const payload = {
          version: 7,
          items: [{ id: '1', title: 'Item' }],
          attachments: [{ id: 'a1', name: 'f.bin', type: 'bin', size: 10, dataBase64: b64 }]
        };
        const res = validateBackupPayload(payload);
        expect(res.attachments).toHaveLength(1);
      }
    });

    it('rejects base64 with padding in the middle or invalid padding counts', () => {
      const invalidMiddlePad = 'QQ==QUJD';
      const invalidChars = 'QUJD$%==';

      for (const b64 of [invalidMiddlePad, invalidChars]) {
        const payload = {
          version: 7,
          items: [{ id: '1', title: 'Item' }],
          attachments: [{ id: 'a1', name: 'f.bin', type: 'bin', size: 10, dataBase64: b64 }]
        };
        expect(() => validateBackupPayload(payload)).toThrowError(/corrupt or invalid base64 data/);
      }
    });

    it('accepts backup file exactly at MAX_BACKUP_FILE_SIZE limit', () => {
      const payload: unknown[] = [];
      const result = validateBackupPayload(payload, MAX_BACKUP_FILE_SIZE);
      expect(result.items).toHaveLength(0);
    });

    it('accepts attachment exactly at 250MB limit', () => {
      const payload = {
        version: 7,
        items: [{ id: '1', title: 'Item' }],
        attachments: [
          {
            id: 'a1',
            name: 'max.bin',
            type: 'bin',
            size: 250 * 1024 * 1024,
            dataBase64: 'QUJD'
          }
        ]
      };
      const result = validateBackupPayload(payload);
      expect(result.attachments).toHaveLength(1);
    });
  });
});
