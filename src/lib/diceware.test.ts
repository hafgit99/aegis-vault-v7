import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureRandomIndex = vi.hoisted(() => vi.fn());

vi.mock('./random', () => ({
  secureRandomIndex,
}));

import { calculateDicewareEntropyBits, generateDiceware, getDicewareWordPool } from './diceware';

beforeEach(() => {
  secureRandomIndex.mockReset();
});

describe('diceware passphrase generator', () => {
  it('uses an EFF-sized word pool for each supported language', () => {
    expect(getDicewareWordPool('tr')).toHaveLength(7776);
    expect(getDicewareWordPool('en')).toHaveLength(7776);
    expect(calculateDicewareEntropyBits({
      language: 'en',
      wordCount: 4,
      addNumber: false,
      addSymbol: false,
    })).toBeGreaterThan(51);
  });

  it('generates capitalized Turkish words with hyphen separators and appended numbers', () => {
    secureRandomIndex
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(42)
      .mockReturnValueOnce(1);

    expect(generateDiceware({
      wordCount: 2,
      separator: 'hyphen',
      language: 'tr',
      capitalize: true,
      addNumber: true,
      addSymbol: false,
    })).toBe('Kalem-Kagit-42');
  });

  it('generates lowercase English words with underscore separators and prepended symbols', () => {
    secureRandomIndex
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(2)
      .mockReturnValueOnce(0);

    expect(generateDiceware({
      wordCount: 2,
      separator: 'underscore',
      language: 'en',
      capitalize: false,
      addNumber: false,
      addSymbol: true,
    })).toBe('#_apple_river');
  });

  it('forces later camel-case words to uppercase even when capitalize is disabled', () => {
    secureRandomIndex
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(2);

    expect(generateDiceware({
      wordCount: 3,
      separator: 'camel',
      language: 'en',
      capitalize: false,
      addNumber: false,
      addSymbol: false,
    })).toBe('appleRiverStone');
  });

  it('omits separators around numbers and symbols for none-style passphrases', () => {
    secureRandomIndex
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(7)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(3)
      .mockReturnValueOnce(1);

    expect(generateDiceware({
      wordCount: 2,
      separator: 'none',
      language: 'en',
      capitalize: true,
      addNumber: true,
      addSymbol: true,
    })).toBe('7AppleRiver$');
  });

  it('covers dot and default space separators with prepended and appended numbers', () => {
    secureRandomIndex
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(8)
      .mockReturnValueOnce(0);

    expect(generateDiceware({
      wordCount: 2,
      separator: 'dot',
      language: 'en',
      capitalize: false,
      addNumber: true,
      addSymbol: false,
    })).toBe('8.apple.river');

    secureRandomIndex.mockReset();
    secureRandomIndex
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(9)
      .mockReturnValueOnce(1);

    expect(generateDiceware({
      wordCount: 2,
      separator: 'space',
      language: 'en',
      capitalize: false,
      addNumber: true,
      addSymbol: false,
    })).toBe('apple river 9');
  });

  it('covers symbol placement with camel and normal separators', () => {
    secureRandomIndex
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(0);

    expect(generateDiceware({
      wordCount: 2,
      separator: 'camel',
      language: 'en',
      capitalize: false,
      addNumber: false,
      addSymbol: true,
    })).toBe('@appleRiver');

    secureRandomIndex.mockReset();
    secureRandomIndex
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(4)
      .mockReturnValueOnce(1);

    expect(generateDiceware({
      wordCount: 2,
      separator: 'hyphen',
      language: 'en',
      capitalize: false,
      addNumber: false,
      addSymbol: true,
    })).toBe('apple-river-%');
  });

  it('appends numbers without separators for camel-case passphrases', () => {
    secureRandomIndex
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(11)
      .mockReturnValueOnce(1);

    expect(generateDiceware({
      wordCount: 2,
      separator: 'camel',
      language: 'en',
      capitalize: false,
      addNumber: true,
      addSymbol: false,
    })).toBe('appleRiver11');
  });

  it('adds entropy for optional numbers and symbols', () => {
    const baseEntropy = calculateDicewareEntropyBits({
      language: 'en',
      wordCount: 4,
      addNumber: false,
      addSymbol: false,
    });
    const hardenedEntropy = calculateDicewareEntropyBits({
      language: 'en',
      wordCount: 4,
      addNumber: true,
      addSymbol: true,
    });

    expect(hardenedEntropy).toBeGreaterThan(baseEntropy + 10);
  });
});
