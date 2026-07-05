/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { validateBackupPayload, validationErrorCodes, MAX_BACKUP_FILE_SIZE } from './backupValidation';

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
    const payload = [];
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
});
