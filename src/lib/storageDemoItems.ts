/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VaultItem } from '../types';

export const INITIAL_DEMO_ITEMS: VaultItem[] = [
  {
    id: '1',
    title: 'Demo Developer Portal',
    username: 'demo.dev@example.test',
    password: 'R7!mQ4#vL9$zP2@k',
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
    password: 'N8$cT2!wY6#rH5@p',
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
    password: 'B6@tK9#sV3!qL8%w',
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
    password: 'M4#nR8!vC2$sX7@d',
    url: 'media.example.test',
    notes: 'Synthetic shared-account sample.',
    createdAt: '2023-01-15',
    updatedAt: '2024-03-10',
    category: 'login',
  },
];
