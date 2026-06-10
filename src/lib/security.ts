/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultItem, GeneratorOptions, AuditReport } from '../types';
import { secureRandomIndex } from './random';

/**
 * Calculates security score for a single password from 0 to 100.
 */
export function calculatePasswordScore(password: string): number {
  if (!password) return 0;
  let score = 0;

  // Length constraints
  if (password.length >= 16) score += 35;
  else if (password.length >= 12) score += 25;
  else if (password.length >= 8) score += 15;
  else score += 5;

  // Diversity checks
  if (/[A-Z]/.test(password)) score += 15;
  if (/[a-z]/.test(password)) score += 15;
  if (/[0-9]/.test(password)) score += 15;
  if (/[^A-Za-z0-9]/.test(password)) score += 20;

  return Math.min(100, score);
}

/**
 * Categorizes a password according to its strength score.
 */
export function getStrengthLabel(password: string): {
  label: 'WEAK' | 'MEDIUM' | 'STRONG' | 'SECURE';
  colorClass: string;
} {
  if (!password || password.length < 8) {
    return { label: 'WEAK', colorClass: 'bg-brand-error/20 text-brand-error' };
  }

  const score = calculatePasswordScore(password);
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
    const score = calculatePasswordScore(pw);
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
