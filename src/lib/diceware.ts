/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { secureRandomIndex } from './random';

import { ENGLISH_WORDS, TURKISH_WORDS } from './dicewareWords';

export interface DicewareOptions {
  wordCount: number;
  separator: 'space' | 'hyphen' | 'dot' | 'underscore' | 'none' | 'camel';
  language: 'tr' | 'en';
  capitalize: boolean;
  addNumber: boolean;
  addSymbol: boolean;
}

const DICEWARE_TARGET_WORD_POOL_SIZE = 7776;

function expandWordPool(baseWords: string[], targetSize = DICEWARE_TARGET_WORD_POOL_SIZE): string[] {
  const words = [...baseWords];
  const seen = new Set(words);

  for (let left = 0; left < baseWords.length && words.length < targetSize; left++) {
    for (let right = 0; right < baseWords.length && words.length < targetSize; right++) {
      const candidate = `${baseWords[left]}${baseWords[right]}`;
      if (!seen.has(candidate)) {
        seen.add(candidate);
        words.push(candidate);
      }
    }
  }

  return words;
}

const EXPANDED_TURKISH_WORDS = expandWordPool(TURKISH_WORDS);
const EXPANDED_ENGLISH_WORDS = expandWordPool(ENGLISH_WORDS);

export function getDicewareWordPool(language: DicewareOptions['language']): string[] {
  return language === 'tr' ? EXPANDED_TURKISH_WORDS : EXPANDED_ENGLISH_WORDS;
}

export function calculateDicewareEntropyBits(options: Pick<DicewareOptions, 'language' | 'wordCount' | 'addNumber' | 'addSymbol'>): number {
  const poolEntropy = Math.log2(getDicewareWordPool(options.language).length) * options.wordCount;
  const numberEntropy = options.addNumber ? Math.log2(100) : 0;
  const symbolEntropy = options.addSymbol ? Math.log2(12) : 0;
  return Math.round((poolEntropy + numberEntropy + symbolEntropy) * 10) / 10;
}

export function generateDiceware(options: DicewareOptions): string {
  const wordPool = getDicewareWordPool(options.language);
  const pickedWords: string[] = [];

  for (let i = 0; i < options.wordCount; i++) {
    const randomIndex = secureRandomIndex(wordPool.length);
    let word = wordPool[randomIndex] ?? 'aegis';

    if (options.capitalize) {
      word = word.charAt(0).toUpperCase() + word.slice(1);
    } else {
      word = word.toLowerCase();
    }
    pickedWords.push(word);
  }

  // Connect them with selected separator
  let sep = ' ';
  if (options.separator === 'hyphen') sep = '-';
  else if (options.separator === 'dot') sep = '.';
  else if (options.separator === 'underscore') sep = '_';
  else if (options.separator === 'none') sep = '';
  else if (options.separator === 'camel') {
    sep = '';
    // If CamelCase is chosen, make sure each word is capitalized except possibly the first, or all for consistency.
    // We already handled individual word capitalization according to 'options.capitalize'.
    // Let's force-capitalize all words from 2nd word onwards if Camel is chosen.
    for (let i = 0; i < pickedWords.length; i++) {
      const currentWord = pickedWords[i];
      if (currentWord && (i > 0 || options.capitalize)) {
        pickedWords[i] = currentWord.charAt(0).toUpperCase() + currentWord.slice(1);
      }
    }
  }

  let finalPassphrase = pickedWords.join(sep);

  // Optionally append or insert a number
  if (options.addNumber) {
    const randomNum = secureRandomIndex(100); // 0-99
    // Append or pre-pend based on a random toggle
    if (secureRandomIndex(2) === 0) {
      finalPassphrase = randomNum + (options.separator === 'none' || options.separator === 'camel' ? '' : sep) + finalPassphrase;
    } else {
      finalPassphrase = finalPassphrase + (options.separator === 'none' || options.separator === 'camel' ? '' : sep) + randomNum;
    }
  }

  // Optionally append or insert a symbol
  if (options.addSymbol) {
    const symbols = '!@#$%&*?+-=';
    const randomSymbol = symbols[secureRandomIndex(symbols.length)];
    if (secureRandomIndex(2) === 0) {
      finalPassphrase = randomSymbol + (options.separator === 'none' || options.separator === 'camel' ? '' : sep) + finalPassphrase;
    } else {
      finalPassphrase = finalPassphrase + (options.separator === 'none' || options.separator === 'camel' ? '' : sep) + randomSymbol;
    }
  }

  return finalPassphrase;
}
