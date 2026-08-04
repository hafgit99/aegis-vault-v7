import type { VaultItem } from '../types';
import { androidAutofillTargetLabel, type AndroidAutofillRequest } from './androidAutofill';

function normalizeHost(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return parsed.hostname.replace(/^www\./, '') || null;
  } catch {
    return trimmed
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      .replace(/^www\./, '') || null;
  }
}

const COMMON_PUBLIC_SUFFIXES = new Set([
  'co.uk', 'com.au', 'co.jp', 'com.br', 'co.in', 'com.tr', 'gov.uk', 'org.uk', 'edu.au', 'net.au', 'or.jp'
]);

function getEffectiveDomain(host: string): string {
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join('.');
  if (COMMON_PUBLIC_SUFFIXES.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

function hostsMatch(itemHost: string, targetHost: string): boolean {
  if (itemHost === targetHost) return true;
  if (itemHost.endsWith(`.${targetHost}`) || targetHost.endsWith(`.${itemHost}`)) {
    return true;
  }
  return getEffectiveDomain(itemHost) === getEffectiveDomain(targetHost);
}

export function isAndroidAutofillTargetMatch(item: VaultItem, request: AndroidAutofillRequest | null | undefined): boolean {
  if (item.category !== 'login') return false;

  const target = androidAutofillTargetLabel(request);
  if (!target) return false;

  const itemHost = normalizeHost(item.url);
  const targetHost = normalizeHost(target);
  if (!itemHost || !targetHost) return false;

  return hostsMatch(itemHost, targetHost);
}

export function sortAndroidAutofillMatches(items: VaultItem[], request: AndroidAutofillRequest | null | undefined): VaultItem[] {
  if (!androidAutofillTargetLabel(request)) return items;

  return [...items].sort((a, b) => {
    const aMatches = isAndroidAutofillTargetMatch(a, request);
    const bMatches = isAndroidAutofillTargetMatch(b, request);
    if (aMatches === bMatches) return 0;
    return aMatches ? -1 : 1;
  });
}
