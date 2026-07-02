/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

// Import scanner details directly from the script
import { forbiddenPatterns, baseline, countOccurrences } from '../../scripts/security-no-js-master-string.cjs';

const rootDir = path.resolve(__dirname, '../..');
const srcDir = path.resolve(rootDir, 'src');

function walkDir(dir: string, callback: (filePath: string) => void) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath, callback);
    } else if (stat.isFile()) {
      callback(filePath);
    }
  }
}

describe('No-JS-Master-String Security Final Gate', () => {
  it('should enforce that plain-text master password patterns do not leak into unauthorized files', () => {
    const unauthorizedLeaks: string[] = [];
    const countExceededFiles: string[] = [];

    walkDir(srcDir, (filePath) => {
      const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');

      // Skip test files
      if (
        relPath.endsWith('.test.ts') ||
        relPath.endsWith('.test.tsx') ||
        relPath.endsWith('.spec.ts') ||
        relPath.endsWith('.spec.tsx') ||
        relPath.includes('/__tests__/')
      ) {
        return;
      }

      // Scan only source files
      if (!relPath.endsWith('.ts') && !relPath.endsWith('.tsx') && !relPath.endsWith('.js') && !relPath.endsWith('.jsx')) {
        return;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const fileMatches: Record<string, number> = {};
      let fileHasPattern = false;

      for (const pattern of forbiddenPatterns) {
        const count = countOccurrences(content, pattern);
        if (count > 0) {
          fileMatches[pattern] = count;
          fileHasPattern = true;
        }
      }

      if (fileHasPattern) {
        const fileBaseline = baseline[relPath];
        if (!fileBaseline) {
          unauthorizedLeaks.push(`${relPath} (Patterns: ${JSON.stringify(fileMatches)})`);
        } else {
          for (const pattern of forbiddenPatterns) {
            const count = fileMatches[pattern] || 0;
            const allowed = fileBaseline[pattern] || 0;
            if (count > allowed) {
              countExceededFiles.push(
                `${relPath} - Pattern "${pattern}": found ${count}, allowed max ${allowed}`
              );
            }
          }
        }
      }
    });

    // Assertions
    expect(
      unauthorizedLeaks,
      `Detected unauthorized plain-text master password usage in files:\n${unauthorizedLeaks.join('\n')}`
    ).toEqual([]);

    expect(
      countExceededFiles,
      `Allowed master password pattern count exceeded in files:\n${countExceededFiles.join('\n')}`
    ).toEqual([]);
  });
});
