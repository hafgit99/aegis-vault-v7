/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VaultItem } from '../types';
import { secureRandomToken } from './random';

/**
 * Creates fresh demo items with randomly generated passwords each time.
 * This avoids hardcoded credentials in production vaults (P0 security finding).
 */
export function createDemoItems(): VaultItem[] {
  return [
    {
      id: '1',
      title: 'Demo Developer Portal',
      username: 'demo.dev@example.test',
      password: `Demo-${secureRandomToken(16)}!`,
      url: 'dev-portal.example.test',
      notes: 'Synthetic sample record. Replace it with your own credential.',
      createdAt: '2023-11-12',
      updatedAt: '2024-01-24',
      category: 'login',
      favorite: true,
    },
    {
      id: '2',
      title: 'Demo Team Admin',
      username: 'demo.admin@example.test',
      password: `Demo-${secureRandomToken(16)}!`,
      url: 'team-admin.example.test',
      notes: 'Synthetic admin sample for layout and audit testing.',
      createdAt: '2023-10-05',
      updatedAt: '2024-02-18',
      category: 'login',
    },
    {
      id: '3',
      title: 'Demo Billing Vault',
      username: 'demo.billing@example.test',
      password: `Demo-${secureRandomToken(16)}!`,
      url: 'billing.example.test',
      notes: 'Synthetic billing sample. No real financial service is represented.',
      createdAt: '2022-04-12',
      updatedAt: '2023-12-01',
      category: 'login',
    },
    {
      id: '4',
      title: 'Demo Media Account',
      username: 'demo.media@example.test',
      password: `Demo-${secureRandomToken(16)}!`,
      url: 'media.example.test',
      notes: 'Synthetic shared-account sample.',
      createdAt: '2023-01-15',
      updatedAt: '2024-03-10',
      category: 'login',
    },
  ];
}

/**
 * @deprecated Use createDemoItems() instead — generates unique passwords per invocation.
 * Kept for backward compatibility with existing test mocks.
 */
export const INITIAL_DEMO_ITEMS: VaultItem[] = createDemoItems();
