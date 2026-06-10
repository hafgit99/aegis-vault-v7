/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generates a deterministic 6-digit TOTP code based on a secret and the current epoch.
 */
export function generateTOTP(secret: string): string {
  if (!secret) return '000 000';
  
  // Get 30-second step epoch
  const step = Math.floor(Date.now() / 30000);
  
  // Basic deterministic hash function from seed string
  let hash = 0;
  const seedString = `${secret}-${step}`;
  for (let i = 0; i < seedString.length; i++) {
    hash = (hash << 5) - hash + seedString.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  
  // Ensure positive number and map to a 6-digit range [100000, 999999]
  const rawCode = Math.abs(hash) % 900000 + 100000;
  const rawString = rawCode.toString();
  
  // Format as "123 456"
  return `${rawString.slice(0, 3)} ${rawString.slice(3, 6)}`;
}

/**
 * Returns the remaining seconds in the current 30-second cycle.
 */
export function getTOTPTimeRemaining(): number {
  const ms = Date.now() % 30000;
  return Math.ceil((30000 - ms) / 1000);
}
