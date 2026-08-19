import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

const {
  hasFlag,
  getArgValue,
  detectPlatform,
  assertPlatform,
  pass,
  warn,
  failExit,
  failThrow,
  normalizeVersion,
  readJson,
  readJsonSafe,
  readText,
  sha256,
  formatBytes,
  shortHash,
  formatBool,
  firstMatch,
  checklistField,
  isPlaceholderValue,
  readChecksumFile,
} = require('../../scripts/release-utils.cjs') as {
  hasFlag: (args: string[], flag: string) => boolean;
  getArgValue: (args: string[], name: string) => string | null | undefined;
  detectPlatform: () => string;
  assertPlatform: (value: string) => void;
  pass: (message: string) => void;
  warn: (message: string) => void;
  failExit: (message: string) => void;
  failThrow: (message: string) => void;
  normalizeVersion: (version: string | null) => string;
  readJson: (file: string) => unknown;
  readJsonSafe: (file: string, issues: string[]) => unknown;
  readText: (file: string) => string;
  sha256: (file: string) => string;
  walk: (dir: string) => string[];
  directoryStats: (dir: string) => { fileCount: number; sizeBytes: number };
  formatBytes: (bytes: number) => string;
  shortHash: (value: string) => string;
  formatBool: (value: boolean) => string;
  firstMatch: (text: string, patterns: RegExp | RegExp[], fallback?: string) => string;
  checklistStats: (file: string, labels: string[]) => { checked: number; unchecked: number; fieldsMissing: string[] };
  checklistField: (contents: string, label: string) => string;
  isPlaceholderValue: (value: string) => boolean;
  readChecksumFile: (file: string, options?: { issues?: string[]; failFn?: (message: string) => void; normalizeKey?: (key: string) => string }) => Map<string, string>;
};

describe('release-utils', () => {
  describe('hasFlag / getArgValue', () => {
    it('detects flags in the argument list', () => {
      expect(hasFlag(['--signed', '--final'], '--signed')).toBe(true);
      expect(hasFlag(['--signed'], '--final')).toBe(false);
    });

    it('reads the value following a named argument', () => {
      expect(getArgValue(['--platform', 'windows'], '--platform')).toBe('windows');
      expect(getArgValue(['--platform'], '--platform')).toBeUndefined();
      expect(getArgValue(['--final'], '--platform')).toBe(null);
    });
  });

  describe('detectPlatform / assertPlatform', () => {
    it('returns a supported desktop platform for the host', () => {
      const platform = detectPlatform() as string;
      expect(['windows', 'linux', 'macos']).toContain(platform);
    });

    it('accepts supported platforms', () => {
      expect(() => assertPlatform('windows')).not.toThrow();
      expect(() => assertPlatform('linux')).not.toThrow();
      expect(() => assertPlatform('macos')).not.toThrow();
    });

    it('throws for unsupported platforms', () => {
      expect(() => assertPlatform('android')).toThrow(/Unsupported desktop release platform/);
      expect(() => assertPlatform('')).toThrow(/Unsupported desktop release platform/);
    });
  });

  describe('failExit / pass / warn / failThrow', () => {
    it('failExit prints FAIL and marks the process exit code', () => {
      const original = process.exitCode;
      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((message) => logs.push(String(message)));
      failExit('boom');
      expect(logs).toContain('FAIL boom');
      expect(process.exitCode).toBe(1);
      process.exitCode = original;
      spy.mockRestore();
    });

    it('pass prints PASS', () => {
      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((message) => logs.push(String(message)));
      pass('ok');
      expect(logs).toContain('PASS ok');
      spy.mockRestore();
    });

    it('warn prints WARN', () => {
      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((message) => logs.push(String(message)));
      warn('careful');
      expect(logs).toContain('WARN careful');
      spy.mockRestore();
    });

    it('failThrow throws', () => {
      expect(() => failThrow('nope')).toThrow('nope');
    });
  });

  describe('normalizeVersion', () => {
    it('normalizes four-part versions by trimming trailing zeros', () => {
      expect(normalizeVersion('7.0.2.0')).toBe('7.0.2');
      expect(normalizeVersion('1.2.3.0.0')).toBe('1.2.3');
    });

    it('keeps meaningful trailing segments', () => {
      expect(normalizeVersion('7.0.2')).toBe('7.0.2');
      expect(normalizeVersion('7.0.2.1')).toBe('7.0.2.1');
    });

    it('preserves non-numeric input', () => {
      expect(normalizeVersion('v1.2')).toBe('v1.2');
      expect(normalizeVersion(null)).toBe('');
    });
  });

  describe('formatBytes / shortHash / formatBool', () => {
    it('formats byte sizes', () => {
      expect(formatBytes(512)).toBe('512 B');
      expect(formatBytes(2048)).toBe('2.00 KiB');
      expect(formatBytes(Number.NaN)).toBe('unknown size');
    });

    it('shortens hashes to 12 characters', () => {
      expect(shortHash('abcdef1234567890')).toBe('abcdef123456');
      expect(shortHash('short')).toBe('short');
    });

    it('formats booleans as yes/no', () => {
      expect(formatBool(true)).toBe('yes');
      expect(formatBool(false)).toBe('no');
    });
  });

  describe('firstMatch', () => {
    it('extracts the first matching group', () => {
      expect(firstMatch('version: 7.0.2\nmode: strict', /version: ([^\r\n]+)/)).toBe('7.0.2');
    });

    it('supports ordered pattern lists with a fallback', () => {
      const patterns = [/versionName[:=]\s*([^\r\n]+)/i, /version: ([^\r\n]+)/i];
      expect(firstMatch('Version: 1.2.3', patterns, 'x')).toBe('1.2.3');
      expect(firstMatch('nothing here', patterns, 'x')).toBe('x');
    });

    it('returns fallback when no pattern matches', () => {
      expect(firstMatch('', /version: ([^\r\n]+)/, 'none')).toBe('none');
    });
  });

  describe('checklist helpers', () => {
    it('checklistField extracts the value after a label', () => {
      expect(checklistField('- Version: 7.0.2\n- Tester: a', '- Version:')).toBe('7.0.2');
      expect(checklistField('- Version: 7.0.2', '- Tester:')).toBe('');
    });

    it('isPlaceholderValue flags empty and placeholder values', () => {
      expect(isPlaceholderValue('')).toBe(true);
      expect(isPlaceholderValue('TBD')).toBe(true);
      expect(isPlaceholderValue('n/a')).toBe(true);
      expect(isPlaceholderValue('<pending>')).toBe(true);
      expect(isPlaceholderValue('Pixel 9')).toBe(false);
    });
  });

  describe('readText / readJson / readJsonSafe', () => {
    it('readText returns empty string for missing files', () => {
      expect(readText('definitely-missing.txt')).toBe('');
    });

    it('readJson throws through the provided fail function', () => {
      expect(() => readJson('definitely-missing.json')).toThrow(/Failed to read JSON file/);
    });

    it('readJsonSafe pushes an issue instead of throwing', () => {
      const issues: string[] = [];
      const result = readJsonSafe('definitely-missing.json', issues);
      expect(result).toBeNull();
      expect(issues.join(' ')).toContain('metadata.json could not be read');
    });
  });

  describe('sha256', () => {
    it('computes a 64-char hex digest for a file', () => {
      const file = path.join(tmpdir(), 'release-utils-sha256.txt');
      fs.writeFileSync(file, 'aegis');
      expect(sha256(file)).toMatch(/^[a-f0-9]{64}$/);
      fs.rmSync(file);
    });
  });

  describe('readChecksumFile', () => {
    it('parses checksum entries', () => {
      const file = path.join(tmpdir(), 'release-utils-SHA256SUMS.txt');
      const hash = 'a'.repeat(64);
      fs.writeFileSync(file, `${hash}  artifacts/app.apk\n`);
      const entries = readChecksumFile(file);
      expect(entries.get('artifacts/app.apk')).toBe(hash);
      fs.rmSync(file);
    });

    it('normalizes keys and reports issues for invalid lines', () => {
      const file = path.join(tmpdir(), 'release-utils-SHA256SUMS.txt');
      fs.writeFileSync(file, 'not-a-checksum\n');
      const issues: string[] = [];
      const entries = readChecksumFile(file, { issues });
      expect(entries.size).toBe(0);
      expect(issues.join(' ')).toContain('Invalid checksum line');
      fs.rmSync(file);
    });

    it('throws on invalid lines when no issues array is provided', () => {
      const file = path.join(tmpdir(), 'release-utils-SHA256SUMS.txt');
      fs.writeFileSync(file, 'not-a-checksum\n');
      expect(() => readChecksumFile(file)).toThrow(/Invalid checksum line/);
      fs.rmSync(file);
    });
  });
});