/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dicewareWords from '../../scripts/diceware-words.json';

// Single source of truth for diceware word lists (shared with scripts/aegis-cli.cjs).
export const TURKISH_WORDS: string[] = dicewareWords.turkish;
export const ENGLISH_WORDS: string[] = dicewareWords.english;
