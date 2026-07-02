import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const forbiddenSessionGetterPattern = /getActive(?:Master|Backup)Password/;

function collectProductionFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectProductionFiles(fullPath));
      continue;
    }

    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
    if (fullPath.endsWith(path.join('src', 'lib', 'vaultSession.ts'))) continue;
    files.push(fullPath);
  }

  return files;
}

describe('vault session secret access policy', () => {
  it('keeps production code on scoped session-secret callbacks', () => {
    const srcRoot = path.resolve(process.cwd(), 'src');
    const offenders = collectProductionFiles(srcRoot).filter((filePath) => {
      const contents = fs.readFileSync(filePath, 'utf8');
      return forbiddenSessionGetterPattern.test(contents);
    });

    expect(offenders.map((filePath) => path.relative(process.cwd(), filePath))).toEqual([]);
  });
});
