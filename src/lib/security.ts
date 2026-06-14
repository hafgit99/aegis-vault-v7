/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultItem, GeneratorOptions, AuditReport } from '../types';
import { secureRandomIndex } from './random';
import zxcvbn from 'zxcvbn';
import { registerOnCloseSession } from './vaultSession';

/**
 * In-memory score cache: avoids re-running zxcvbn for the same password string.
 * Bounded to MAX_SCORE_CACHE_SIZE entries to prevent unbounded memory growth.
 */
const MAX_SCORE_CACHE_SIZE = 2000;
const passwordScoreCache = new Map<string, number>();

registerOnCloseSession(() => {
  passwordScoreCache.clear();
});

function getCachedOrComputeScore(password: string): number {
  if (!password) return 0;
  const cached = passwordScoreCache.get(password);
  if (cached !== undefined) return cached;

  const result = zxcvbn(password);
  const baseScore = (result.score / 4) * 100;
  const lengthBonus = password.length >= 20 ? 8 : password.length >= 16 ? 4 : 0;
  const shortPenalty = password.length < 12 ? 20 : 0;
  const score = Math.max(0, Math.min(100, Math.round(baseScore + lengthBonus - shortPenalty)));

  // Evict oldest entries if cache is full
  if (passwordScoreCache.size >= MAX_SCORE_CACHE_SIZE) {
    const firstKey = passwordScoreCache.keys().next().value;
    if (firstKey !== undefined) passwordScoreCache.delete(firstKey);
  }
  passwordScoreCache.set(password, score);
  return score;
}

/**
 * Fast heuristic-based password score that does NOT call zxcvbn.
 * Used for bulk operations (large vaults) where zxcvbn would block the main thread.
 */
function fastPasswordScore(password: string): number {
  if (!password) return 0;

  let score = 0;
  const len = password.length;

  // Length scoring (major factor)
  if (len >= 20) score += 45;
  else if (len >= 16) score += 38;
  else if (len >= 12) score += 34;
  else if (len >= 8) score += 20;
  else score += 5;

  // Character class diversity
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const classCount = [hasUpper, hasLower, hasDigit, hasSymbol].filter(Boolean).length;

  score += classCount * 12;

  // Penalize passwords with only one character class (very weak brute-force resistance)
  if (classCount <= 1) {
    score -= 15;
  }

  // Penalize very short passwords
  if (len < 8) score -= 20;
  if (len < 6) score -= 15;

  // Bonus for no repeating patterns
  const uniqueChars = new Set(password).size;
  const uniqueRatio = uniqueChars / len;
  if (uniqueRatio > 0.7) score += 8;
  else if (uniqueRatio < 0.3) score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Calculates security score for a single password from 0 to 100.
 * Uses cached zxcvbn results to avoid redundant computations.
 */
export function calculatePasswordScore(password: string): number {
  return getCachedOrComputeScore(password);
}

/**
 * Categorizes a password according to its strength score.
 * Uses fastPasswordScore to prevent rendering freezes in lists.
 */
export function getStrengthLabel(password: string): {
  label: 'WEAK' | 'MEDIUM' | 'STRONG' | 'SECURE';
  colorClass: string;
} {
  if (!password || password.length < 8) {
    return { label: 'WEAK', colorClass: 'bg-brand-error/20 text-brand-error' };
  }

  const score = fastPasswordScore(password);
  if (score >= 90) {
    return { label: 'SECURE', colorClass: 'bg-brand-tertiary/20 text-brand-tertiary border border-brand-tertiary/20' };
  } else if (score >= 70) {
    return { label: 'STRONG', colorClass: 'bg-brand-secondary/20 text-brand-secondary border border-brand-secondary/10' };
  } else if (score >= 40) {
    return { label: 'MEDIUM', colorClass: 'bg-amber-500/20 text-amber-300' };
  } else {
    return { label: 'WEAK', colorClass: 'bg-brand-error/20 text-brand-error' };
  }
}

/**
 * Performs a comprehensive audit of the entire vault collection.
 * Identifies weak and reused values.
 * Uses a fast heuristic scorer instead of zxcvbn for all bulk auditing 
 * to avoid blocking the main thread under any circumstances.
 */
export function runVaultAudit(items: VaultItem[]): AuditReport {
  if (items.length === 0) {
    return { score: 100, weakCount: 0, reusedCount: 0, secureCount: 0, totalCount: 0 };
  }

  let totalIndividualScore = 0;
  let weakCount = 0;
  let reusedCount = 0;
  let secureCount = 0;

  // Record frequencies of passwords to detect duplicates
  const passwordFreq: Record<string, number> = {};
  items.forEach((item) => {
    const pw = item.password || '';
    if (pw) {
      passwordFreq[pw] = (passwordFreq[pw] || 0) + 1;
    }
  });

  items.forEach((item) => {
    const pw = item.password || '';
    const score = fastPasswordScore(pw);
    totalIndividualScore += score;

    if (pw.length < 8 || score < 40) {
      weakCount++;
    } else if (score >= 85) {
      secureCount++;
    }

    if (pw && passwordFreq[pw] > 1) {
      reusedCount++;
    }
  });

  // Calculate overall security rating
  // Deduct penalty for vulnerabilities like reused or weak items
  const averageScore = totalIndividualScore / items.length;
  const reusedPenalty = (reusedCount / items.length) * 35;
  const weakPenalty = (weakCount / items.length) * 45;
  const rawScore = averageScore - reusedPenalty - weakPenalty;
  const finalScore = Math.max(10, Math.min(100, Math.round(rawScore)));

  return {
    score: finalScore,
    weakCount,
    reusedCount,
    secureCount,
    totalCount: items.length,
  };
}

/**
 * Generates a randomized password using cryptographically secure randomness when available.
 */
export function generatePassword(options: GeneratorOptions): string {
  const uppercaseChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercaseChars = 'abcdefghijklmnopqrstuvwxyz';
  const numberChars = '0123456789';
  const symbolChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  let pool = '';
  let requiredChars = '';

  if (options.uppercase) {
    pool += uppercaseChars;
    requiredChars += uppercaseChars[secureRandomIndex(uppercaseChars.length)];
  }
  if (options.lowercase) {
    pool += lowercaseChars;
    requiredChars += lowercaseChars[secureRandomIndex(lowercaseChars.length)];
  }
  if (options.numbers) {
    pool += numberChars;
    requiredChars += numberChars[secureRandomIndex(numberChars.length)];
  }
  if (options.symbols) {
    pool += symbolChars;
    requiredChars += symbolChars[secureRandomIndex(symbolChars.length)];
  }

  // Fallback to lowercase if no options chosen
  if (!pool) {
    pool = lowercaseChars;
    requiredChars += lowercaseChars[secureRandomIndex(lowercaseChars.length)];
  }

  let passwordArray: string[] = requiredChars.split('');

  // Fill up to target length
  const remainingLength = options.length - passwordArray.length;
  for (let i = 0; i < remainingLength; i++) {
    passwordArray.push(pool[secureRandomIndex(pool.length)]);
  }

  // Shuffle password characters
  for (let i = passwordArray.length - 1; i > 0; i--) {
    const j = secureRandomIndex(i + 1);
    [passwordArray[i], passwordArray[j]] = [passwordArray[j], passwordArray[i]];
  }

  return passwordArray.join('');
}
