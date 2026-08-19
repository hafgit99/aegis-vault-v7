import type { VaultItem } from '../types';
import { androidAutofillTargetLabel, type AndroidAutofillRequest } from './androidAutofill';

function normalizeHost(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return parsed.hostname.replace(/^www\./, '') || null;
  } catch {
    const segment = trimmed
      .replace(/^https?:\/\//, '')
      .split('/')[0];
    return segment ? segment.replace(/^www\./, '') || null : null;
  }
}

const COMMON_PUBLIC_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk',
  'com.tr', 'org.tr', 'net.tr', 'gov.tr', 'edu.tr', 'bel.tr', 'k12.tr', 'av.tr', 'dr.tr', 'biz.tr', 'info.tr', 'tv.tr', 'gen.tr', 'name.tr',
  'co.jp', 'ne.jp', 'or.jp', 'go.jp', 'ac.jp', 'ad.jp', 'ed.jp', 'gr.jp', 'lg.jp',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'id.au', 'asn.au', 'csiro.au',
  'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz', 'school.nz', 'iwi.nz',
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br', 'ind.br', 'inf.br', 'tur.br', 'b.br',
  'com.de', 'co.at', 'or.at', 'gv.at', 'ac.at', 'co.ch',
  'com.mx', 'org.mx', 'net.mx', 'edu.mx', 'gob.mx',
  'com.ar', 'org.ar', 'net.ar', 'gov.ar', 'edu.ar',
  'co.in', 'net.in', 'org.in', 'gen.in', 'firm.in', 'ind.in', 'nic.in', 'ac.in', 'edu.in', 'res.in', 'gov.in',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
  'com.hk', 'org.hk', 'net.hk', 'edu.hk', 'gov.hk', 'idv.hk',
  'com.sg', 'org.sg', 'net.sg', 'edu.sg', 'gov.sg', 'per.sg',
  'co.kr', 'ne.kr', 'or.kr', 're.kr', 'pe.kr', 'go.kr', 'ac.kr',
  'com.tw', 'org.tw', 'net.tw', 'edu.tw', 'gov.tw', 'idv.tw',
  'co.za', 'net.za', 'org.za', 'gov.za', 'edu.za',
  'com.eg', 'edu.eg', 'gov.eg', 'org.eg',
  'com.sa', 'net.sa', 'org.sa', 'gov.sa', 'edu.sa',
  'com.ae', 'net.ae', 'org.ae', 'gov.ae', 'ac.ae',
  'co.il', 'org.il', 'net.il', 'ac.il', 'gov.il', 'k12.il',
  'com.ca', 'co.ca', 'ab.ca', 'bc.ca', 'mb.ca', 'nb.ca', 'nl.ca', 'ns.ca', 'nt.ca', 'nu.ca', 'on.ca', 'pe.ca', 'qc.ca', 'sk.ca', 'yk.ca',
  'com.es', 'nom.es', 'org.es', 'gob.es', 'edu.es',
  'com.fr', 'asso.fr', 'gouv.fr',
  'co.it', 'gov.it',
  'com.nl', 'co.nl',
  'co.no', 'org.no',
  'com.se', 'org.se',
  'com.fi', 'co.fi',
  'com.dk', 'co.dk',
  'com.pl', 'net.pl', 'org.pl', 'biz.pl', 'info.pl',
  'com.ru', 'net.ru', 'org.ru', 'pp.ru',
  'com.ua', 'net.ua', 'org.ua', 'gov.ua', 'edu.ua',
  'com.co', 'net.co', 'nom.co',
  'github.io', 'gitlab.io', 'vercel.app', 'netlify.app', 'cloudflare.dev', 'fly.dev', 'render.com', 'azurewebsites.net', 'cloudapp.net', 's3.amazonaws.com', 'pages.dev'
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
