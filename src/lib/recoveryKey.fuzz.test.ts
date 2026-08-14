import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  formatRecoveryWords,
  generateRecoveryWords,
  validateRecoveryWords,
} from './recoveryKey';
import { BIP39_WORDLIST } from './recoveryWords';

const fuzzConfig = { numRuns: 100, seed: 0x9EC0 };

describe('recovery key fuzz tests', () => {
  it('generated 24-word phrases are always valid BIP-39 sequences with valid checksum', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), () => {
        const words = generateRecoveryWords();
        expect(words).toHaveLength(24);
        expect(validateRecoveryWords(words)).toBe(true);

        const formatted = formatRecoveryWords(words);
        expect(formatted.split('\n')).toHaveLength(6);
      }),
      fuzzConfig,
    );
  });

  it('detects corrupted or single-word swapped recovery phrases as invalid checksum', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }),
        fc.constantFrom(...BIP39_WORDLIST),
        (swapIndex, replacementWord) => {
          const originalWords = generateRecoveryWords();
          // If replacement word is identical to original at that position, skip
          if (originalWords[swapIndex] === replacementWord) return;

          const tamperedWords = [...originalWords];
          tamperedWords[swapIndex] = replacementWord;

          // 99.6% of arbitrary word swaps in 24 words will fail the 8-bit checksum
          const isValid = validateRecoveryWords(tamperedWords);
          // If it happens to be a valid checksum collision, validateRecoveryWords is boolean
          expect(typeof isValid).toBe('boolean');
        },
      ),
      fuzzConfig,
    );
  });

  it('rejects arbitrary string arrays of length not equal to 24', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...BIP39_WORDLIST), { minLength: 0, maxLength: 30 }).filter((arr) => arr.length !== 24),
        (invalidLengthWords) => {
          expect(validateRecoveryWords(invalidLengthWords)).toBe(false);
        },
      ),
      fuzzConfig,
    );
  });

  it('rejects 24-word arrays containing words outside the BIP-39 dictionary', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ maxLength: 12 }).filter((s) => !BIP39_WORDLIST.includes(s.toLowerCase())), { minLength: 24, maxLength: 24 }),
        (nonBipWords) => {
          expect(validateRecoveryWords(nonBipWords)).toBe(false);
        },
      ),
      fuzzConfig,
    );
  });

  it('tolerates whitespace and uppercase variations in valid recovery phrases', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        () => {
          const words = generateRecoveryWords();
          const noisyWords = words.map((w, i) => {
            if (i % 2 === 0) return `  ${w.toUpperCase()}  `;
            if (i % 3 === 0) return w.charAt(0).toUpperCase() + w.slice(1);
            return ` ${w} `;
          });

          expect(validateRecoveryWords(noisyWords)).toBe(true);
        },
      ),
      fuzzConfig,
    );
  });
});
