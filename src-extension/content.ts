import { translate, getPreferredLanguage } from './i18n';
import { extractRegistrableDomain } from './psl-utils';

const activeLanguage = getPreferredLanguage();

// CSS injected dynamically for the inline overlay, icon, and premium banner
const inlineStyle = `
  .aegis-input-container {
    position: relative !important;
  }
  .aegis-icon-btn {
    position: absolute !important;
    right: 8px !important;
    top: 50% !important;
    transform: translateY(-50%) !important;
    width: 20px !important;
    height: 20px !important;
    border-radius: 4px !important;
    background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%) !important;
    color: white !important;
    border: none !important;
    font-family: sans-serif !important;
    font-weight: bold !important;
    font-size: 11px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    z-index: 99999 !important;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
    opacity: 0.7 !important;
    transition: opacity 0.2s, transform 0.2s !important;
  }
  .aegis-icon-btn:hover {
    opacity: 1 !important;
    transform: translateY(-50%) scale(1.1) !important;
  }
  .aegis-dropdown {
    position: absolute !important;
    background: rgba(15, 23, 42, 0.95) !important;
    backdrop-filter: blur(8px) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-radius: 8px !important;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5) !important;
    z-index: 1000000 !important;
    width: 240px !important;
    max-height: 250px !important;
    overflow-y: auto !important;
    font-family: 'Inter', sans-serif !important;
    padding: 6px !important;
    margin-top: 4px !important;
    animation: aegis-fade-in 0.2s ease-out !important;
  }
  .aegis-dropdown-item {
    padding: 8px 10px !important;
    border-radius: 6px !important;
    color: #f8fafc !important;
    font-size: 12px !important;
    cursor: pointer !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 2px !important;
    transition: background 0.15s !important;
  }
  .aegis-dropdown-item:hover {
    background: rgba(255, 255, 255, 0.08) !important;
  }
  .aegis-dropdown-title {
    font-weight: 600 !important;
  }
  .aegis-dropdown-user {
    color: #94a3b8 !important;
    font-size: 10px !important;
  }
  .aegis-dropdown-locked {
    padding: 10px !important;
    color: #94a3b8 !important;
    font-size: 11px !important;
    text-align: center !important;
  }
  .aegis-banner {
    position: fixed !important;
    top: -100px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    width: 90% !important;
    max-width: 520px !important;
    background: rgba(15, 23, 42, 0.9) !important;
    backdrop-filter: blur(12px) !important;
    -webkit-backdrop-filter: blur(12px) !important;
    border: 1px solid rgba(16, 185, 129, 0.25) !important;
    border-radius: 12px !important;
    box-shadow: 0 20px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1) !important;
    padding: 12px 18px !important;
    z-index: 2147483647 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 16px !important;
    font-family: 'Inter', system-ui, sans-serif !important;
    transition: top 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
  }
  .aegis-banner.show {
    top: 16px !important;
  }
  .aegis-banner-info {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    flex: 1 !important;
  }
  .aegis-banner-logo {
    width: 32px !important;
    height: 32px !important;
    background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%) !important;
    border-radius: 8px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    color: white !important;
    font-weight: bold !important;
    font-size: 16px !important;
  }
  .aegis-banner-text {
    display: flex !important;
    flex-direction: column !important;
    gap: 2px !important;
    text-align: left !important;
  }
  .aegis-banner-title {
    color: #ffffff !important;
    font-weight: 700 !important;
    font-size: 13px !important;
  }
  .aegis-banner-desc {
    color: #94a3b8 !important;
    font-size: 11px !important;
  }
  .aegis-banner-actions {
    display: flex !important;
    gap: 8px !important;
  }
  .aegis-banner-btn {
    padding: 6px 14px !important;
    border-radius: 6px !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    cursor: pointer !important;
    border: none !important;
    transition: background 0.15s, transform 0.1s !important;
  }
  .aegis-banner-btn:active {
    transform: scale(0.96) !important;
  }
  .aegis-banner-btn-save {
    background: #10b981 !important;
    color: white !important;
  }
  .aegis-banner-btn-save:hover {
    background: #059669 !important;
  }
  .aegis-banner-btn-dismiss {
    background: rgba(255, 255, 255, 0.08) !important;
    color: #cbd5e1 !important;
  }
  .aegis-banner-btn-dismiss:hover {
    background: rgba(255, 255, 255, 0.15) !important;
  }
  @keyframes aegis-fade-in {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Phishing Alert Banner Styles */
  .aegis-phishing-alert-banner {
    position: fixed !important;
    top: -180px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    width: 90% !important;
    max-width: 600px !important;
    background: linear-gradient(135deg, rgba(220, 38, 38, 0.95) 0%, rgba(185, 28, 28, 0.98) 100%) !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    border: 1px solid rgba(248, 113, 113, 0.45) !important;
    border-radius: 16px !important;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
    padding: 16px 24px !important;
    z-index: 2147483647 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 20px !important;
    font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
    transition: top 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
  }
  .aegis-phishing-alert-banner.show {
    top: 24px !important;
  }
  .aegis-phishing-alert-icon {
    font-size: 28px !important;
    flex-shrink: 0 !important;
    animation: aegis-wiggle 1s ease-in-out infinite alternate !important;
  }
  .aegis-phishing-alert-info {
    display: flex !important;
    flex-direction: column !important;
    gap: 4px !important;
    flex: 1 !important;
    text-align: left !important;
  }
  .aegis-phishing-alert-title {
    color: #ffffff !important;
    font-weight: 800 !important;
    font-size: 15px !important;
    letter-spacing: 0.3px !important;
  }
  .aegis-phishing-alert-desc {
    color: #fee2e2 !important;
    font-size: 12px !important;
    line-height: 1.4 !important;
    opacity: 0.95 !important;
  }
  .aegis-phishing-alert-domain {
    font-family: monospace !important;
    font-size: 11px !important;
    color: #fef08a !important;
    background: rgba(254, 240, 138, 0.15) !important;
    padding: 2px 6px !important;
    border-radius: 4px !important;
    border: 1px solid rgba(254, 240, 138, 0.2) !important;
    display: inline-block !important;
    margin-top: 4px !important;
    word-break: break-all !important;
  }
  .aegis-phishing-alert-btn {
    padding: 8px 18px !important;
    border-radius: 8px !important;
    font-size: 12px !important;
    font-weight: 700 !important;
    cursor: pointer !important;
    border: none !important;
    background: #ffffff !important;
    color: #dc2626 !important;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1) !important;
    transition: background 0.15s, transform 0.1s, box-shadow 0.15s !important;
  }
  .aegis-phishing-alert-btn:hover {
    background: #fecaca !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 6px 12px rgba(0,0,0,0.15) !important;
  }
  .aegis-phishing-alert-btn:active {
    transform: translateY(0) !important;
  }
  @keyframes aegis-wiggle {
    0% { transform: rotate(-8deg); }
    100% { transform: rotate(8deg); }
  }
`;

// Inject Styles
const styleEl = document.createElement('style');
styleEl.textContent = inlineStyle;
document.head?.appendChild(styleEl);

// ─── Content Phishing Detection Engine ─────────────────────────────────────────
let activePhishingThreat: any = null;

const CONFUSABLE_MAP: Record<string, string> = {
  '\u0430': 'a', '\u0435': 'e', '\u043e': 'o', '\u0440': 'p', '\u0441': 'c',
  '\u0443': 'y', '\u0445': 'x', '\u0456': 'i', '\u0458': 'j', '\u04bb': 'h',
  '\u0455': 's', '\u0491': 'g', '\u04c0': 'l', '\u0501': 'd', '\u051b': 'q',
  '\u0261': 'g', '\u026a': 'i', '\u0280': 'r', '\u1d00': 'a', '\u1d04': 'c',
  '\u1d05': 'd', '\u1d07': 'e', '\u1d0b': 'k', '\u1d0d': 'm', '\u1d0f': 'o',
  '\u1d18': 'p', '\u1d1b': 't', '\u1d1c': 'u', '\u1d20': 'v', '\u1d21': 'w',
  '\u1d22': 'z', '\u0251': 'a', '\u025b': 'e', '\u0254': 'o',
  '\u2160': 'i', '\u2170': 'i', '\u217a': 'x', '\u2169': 'x',
  '\uff41': 'a', '\uff42': 'b', '\uff43': 'c', '\uff44': 'd', '\uff45': 'e',
  '\uff46': 'f', '\uff47': 'g', '\uff48': 'h', '\uff49': 'i', '\uff4a': 'j',
  '\uff4b': 'k', '\uff4c': 'l', '\uff4d': 'm', '\uff4e': 'n', '\uff4f': 'o',
  '\uff50': 'p', '\uff51': 'q', '\uff52': 'r', '\uff53': 's', '\uff54': 't',
  '\uff55': 'u', '\uff56': 'v', '\uff57': 'w', '\uff58': 'x', '\uff59': 'y',
  '\uff5a': 'z',
  '0': 'o', '1': 'l', '!': 'i',
};

// extractRegistrableDomain is now imported from './psl-utils' (PSL-based, security fix Y1/Y2)

function normalizeConfusables(text: string): string {
  return [...text].map(ch => CONFUSABLE_MAP[ch] || ch).join('');
}

function hasConfusableChars(hostname: string): boolean {
  for (const ch of hostname) {
    if (CONFUSABLE_MAP[ch] !== undefined) return true;
  }
  return false;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i]![j] = Math.min(dp[i]![j]!, dp[i - 2]![j - 2]! + cost);
      }
    }
  }
  return dp[m]![n]!;
}

function checkContentPhishing(url: string, trustedDomains: string[] = []): any {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // 1. IDN Punycode homograph detection
    if (hostname.includes('xn--')) {
      return { isSuspicious: true, threatType: 'homograph', details: hostname };
    }

    // 2. Non-ASCII / Unicode confusable detection
    const asciiRegex = /^[\x00-\x7F]*$/;
    if (!asciiRegex.test(hostname)) {
      const isConf = hasConfusableChars(hostname);
      return { isSuspicious: true, threatType: isConf ? 'confusable' : 'homograph', details: hostname };
    }

    // 3. Confusable character substitution in ASCII domain
    const activeDomain = extractRegistrableDomain(hostname);
    if (hasConfusableChars(activeDomain)) {
      const normalized = normalizeConfusables(activeDomain);
      for (const trusted of trustedDomains) {
        if (normalized === trusted && activeDomain !== trusted) {
          return { isSuspicious: true, threatType: 'confusable', matchedDomain: trusted, details: activeDomain };
        }
      }
    }

    // 4. Typo-squatting
    if (trustedDomains.length > 0) {
      for (const trusted of trustedDomains) {
        if (activeDomain === trusted) continue;
        const dist = levenshteinDistance(activeDomain, trusted);
        const maxLen = Math.max(activeDomain.length, trusted.length);
        const similarity = 1 - dist / maxLen;

        if (similarity >= 0.85 && dist > 0 && dist <= 3) {
          return { isSuspicious: true, threatType: 'typosquat', matchedDomain: trusted, details: activeDomain };
        }

        const normalizedActive = normalizeConfusables(activeDomain);
        const normalizedTrusted = normalizeConfusables(trusted);
        if (normalizedActive === normalizedTrusted && activeDomain !== trusted) {
          return { isSuspicious: true, threatType: 'confusable', matchedDomain: trusted, details: activeDomain };
        }
      }
    }
  } catch {}
  return null;
}

let shadowHost: HTMLElement | null = null;
let shadowRootRef: ShadowRoot | null = null;

const EXTENSION_SHADOW_STYLES = `
  :host {
    all: initial !important;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
  }
  .aegis-dropdown {
    position: absolute !important;
    z-index: 2147483647 !important;
    background: #0f172a !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    border-radius: 10px !important;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5) !important;
    padding: 6px !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 4px !important;
    max-height: 280px !important;
    overflow-y: auto !important;
    backdrop-filter: blur(12px) !important;
    font-size: 13px !important;
    color: #f8fafc !important;
    box-sizing: border-box !important;
  }
  .aegis-dropdown-item {
    padding: 8px 10px !important;
    border-radius: 6px !important;
    cursor: pointer !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 2px !important;
    transition: background 0.15s ease !important;
    color: #f8fafc !important;
  }
  .aegis-dropdown-item:hover {
    background: rgba(255, 255, 255, 0.08) !important;
  }
  .aegis-dropdown-title {
    font-weight: 600 !important;
    color: #f8fafc !important;
    font-size: 13px !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }
  .aegis-dropdown-user {
    font-size: 11px !important;
    color: #94a3b8 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }
  .aegis-dropdown-locked {
    padding: 10px !important;
    text-align: center !important;
    color: #94a3b8 !important;
    font-size: 12px !important;
  }
  .aegis-phishing-alert-banner {
    position: fixed !important;
    top: 12px !important;
    left: 50% !important;
    transform: translateX(-50%) translateY(-20px) !important;
    z-index: 2147483647 !important;
    width: 90% !important;
    max-width: 600px !important;
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.95) 0%, rgba(185, 28, 28, 0.98) 100%) !important;
    border: 1px solid #ef4444 !important;
    border-radius: 12px !important;
    padding: 12px 16px !important;
    color: #ffffff !important;
    box-shadow: 0 16px 40px rgba(239, 68, 68, 0.35) !important;
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    opacity: 0 !important;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
    box-sizing: border-box !important;
  }
  .aegis-phishing-alert-banner.show {
    transform: translateX(-50%) translateY(0) !important;
    opacity: 1 !important;
  }
  .aegis-phishing-alert-icon {
    font-size: 24px !important;
    flex-shrink: 0 !important;
  }
  .aegis-phishing-alert-info {
    display: flex !important;
    flex-direction: column !important;
    gap: 2px !important;
    flex: 1 !important;
  }
  .aegis-phishing-alert-title {
    font-weight: 700 !important;
    font-size: 14px !important;
    color: #ffffff !important;
  }
  .aegis-phishing-alert-desc {
    font-size: 12px !important;
    color: #fecdd3 !important;
  }
  .aegis-phishing-alert-domain {
    font-family: monospace !important;
    background: rgba(0, 0, 0, 0.2) !important;
    padding: 2px 6px !important;
    border-radius: 4px !important;
    font-size: 11px !important;
    color: #fde047 !important;
    display: inline-block !important;
    margin-top: 4px !important;
  }
  .aegis-phishing-alert-btn {
    background: rgba(255, 255, 255, 0.2) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #ffffff !important;
    padding: 6px 12px !important;
    border-radius: 6px !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    cursor: pointer !important;
    flex-shrink: 0 !important;
  }
  .aegis-phishing-alert-btn:hover {
    background: rgba(255, 255, 255, 0.3) !important;
  }
  .aegis-banner {
    position: fixed !important;
    top: 12px !important;
    right: 12px !important;
    z-index: 2147483647 !important;
    background: #0f172a !important;
    border: 1px solid rgba(16, 185, 129, 0.4) !important;
    border-radius: 12px !important;
    padding: 12px 16px !important;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5) !important;
    display: flex !important;
    align-items: center !important;
    gap: 16px !important;
    color: #f8fafc !important;
    transform: translateY(-20px) !important;
    opacity: 0 !important;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
    box-sizing: border-box !important;
  }
  .aegis-banner.show {
    transform: translateY(0) !important;
    opacity: 1 !important;
  }
  .aegis-banner-info {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
  }
  .aegis-banner-logo {
    width: 28px !important;
    height: 28px !important;
    background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%) !important;
    border-radius: 8px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-weight: bold !important;
    color: white !important;
    font-size: 14px !important;
  }
  .aegis-banner-text {
    display: flex !important;
    flex-direction: column !important;
    gap: 2px !important;
  }
  .aegis-banner-title {
    font-weight: 700 !important;
    font-size: 13px !important;
    color: #f8fafc !important;
  }
  .aegis-banner-desc {
    font-size: 11px !important;
    color: #94a3b8 !important;
  }
  .aegis-banner-actions {
    display: flex !important;
    gap: 8px !important;
  }
  .aegis-banner-btn {
    padding: 6px 12px !important;
    border-radius: 6px !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    cursor: pointer !important;
    border: none !important;
  }
  .aegis-banner-btn-save {
    background: #10b981 !important;
    color: white !important;
  }
  .aegis-banner-btn-save:hover {
    background: #059669 !important;
  }
  .aegis-banner-btn-dismiss {
    background: rgba(255, 255, 255, 0.1) !important;
    color: #94a3b8 !important;
  }
  .aegis-banner-btn-dismiss:hover {
    background: rgba(255, 255, 255, 0.15) !important;
    color: #f8fafc !important;
  }
`;

function getAegisShadowRoot(): ShadowRoot {
  if (!shadowHost || !shadowHost.isConnected) {
    shadowHost = document.createElement('aegis-autofill-host');
    shadowHost.id = 'aegis-root-host';
    shadowHost.style.cssText = 'position: absolute !important; top: 0 !important; left: 0 !important; width: 0 !important; height: 0 !important; z-index: 2147483647 !important; pointer-events: none !important; border: none !important; margin: 0 !important; padding: 0 !important;';
    
    shadowRootRef = shadowHost.attachShadow({ mode: 'closed' });
    
    const styleEl = document.createElement('style');
    styleEl.textContent = EXTENSION_SHADOW_STYLES;
    shadowRootRef.appendChild(styleEl);
    
    (document.body || document.documentElement).appendChild(shadowHost);
  }
  return shadowRootRef!;
}

function showInPagePhishingBanner(result: any) {
  const root = getAegisShadowRoot();
  if (root.querySelector('.aegis-phishing-alert-banner')) return;

  const banner = document.createElement('div');
  banner.className = 'aegis-phishing-alert-banner';
  banner.style.pointerEvents = 'auto';

  const icon = document.createElement('div');
  icon.className = 'aegis-phishing-alert-icon';
  icon.textContent = result.threatType === 'homograph' ? '🛡️' : 
                     result.threatType === 'confusable' ? '🔤' :
                     result.threatType === 'typosquat' ? '🎯' : '⚠️';

  const info = document.createElement('div');
  info.className = 'aegis-phishing-alert-info';

  const title = document.createElement('span');
  title.className = 'aegis-phishing-alert-title';
  
  let titleKey = 'phishing.warning';
  let descKey = 'phishing.warning';
  if (result.threatType === 'homograph') {
    titleKey = 'phishing.homograph';
    descKey = 'phishing.homograph.desc';
  } else if (result.threatType === 'confusable') {
    titleKey = 'phishing.confusable';
    descKey = 'phishing.confusable.desc';
  } else if (result.threatType === 'typosquat') {
    titleKey = 'phishing.typosquat';
    descKey = 'phishing.typosquat.desc';
  }

  title.textContent = translate(titleKey as any, activeLanguage);

  const desc = document.createElement('span');
  desc.className = 'aegis-phishing-alert-desc';
  let descText = translate(descKey as any, activeLanguage);
  if (result.matchedDomain && (result.threatType === 'typosquat' || result.threatType === 'confusable')) {
    descText += ` ${result.matchedDomain}`;
  }
  desc.textContent = descText;

  info.appendChild(title);
  info.appendChild(desc);

  if (result.details) {
    const details = document.createElement('span');
    details.className = 'aegis-phishing-alert-domain';
    details.textContent = result.details;
    info.appendChild(details);
  }

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'aegis-phishing-alert-btn';
  dismissBtn.textContent = translate('phishing.page.dismiss', activeLanguage);
  dismissBtn.addEventListener('click', () => {
    banner.classList.remove('show');
    setTimeout(() => banner.remove(), 500);
  });

  banner.appendChild(icon);
  banner.appendChild(info);
  banner.appendChild(dismissBtn);

  root.appendChild(banner);
  setTimeout(() => {
    banner.classList.add('show');
  }, 100);
}

function initializePhishingCheck() {
  chrome.runtime.sendMessage({ action: 'query_credentials', url: window.location.href }, (response) => {
    if (response && response.credentials) {
      const trustedDomains: string[] = [];
      response.credentials.forEach((item: any) => {
        if (item.url) {
          try {
            let cleanUrl = item.url.trim().toLowerCase();
            if (!/^https?:\/\//i.test(cleanUrl)) cleanUrl = 'https://' + cleanUrl;
            const parsed = new URL(cleanUrl);
            const domain = extractRegistrableDomain(parsed.hostname);
            if (domain && !trustedDomains.includes(domain)) {
              trustedDomains.push(domain);
            }
          } catch {}
        }
      });

      const result = checkContentPhishing(window.location.href, trustedDomains);
      if (result && result.isSuspicious) {
        activePhishingThreat = result;
        showInPagePhishingBanner(result);
      }
    }
  });
}

// Keep track of active dropdown
let activeDropdown: HTMLDivElement | null = null;
let activeTargetInput: HTMLInputElement | null = null;
let lastFilledCredential: { username: string; password: string; timestamp: number } | null = null;

function wipeLastFilledCredential() {
  if (lastFilledCredential) {
    lastFilledCredential.username = '';
    lastFilledCredential.password = '';
    lastFilledCredential.timestamp = 0;
    lastFilledCredential = null;
  }
}

// Clean active dropdown on click elsewhere (inspecting composedPath for Shadow DOM elements)
document.addEventListener('click', (e) => {
  const path = e.composedPath ? e.composedPath() : [];
  const clickedInsideDropdown = activeDropdown && path.includes(activeDropdown);
  if (activeDropdown && !clickedInsideDropdown && e.target !== activeTargetInput) {
    closeDropdown();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDropdown();
  }
});

function closeDropdown() {
  if (activeDropdown) {
    activeDropdown.remove();
    activeDropdown = null;
  }
  activeTargetInput = null;
  window.removeEventListener('scroll', closeDropdown);
  window.removeEventListener('resize', closeDropdown);
}

// Handle messages from background service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'fill_inputs') {
    if (activePhishingThreat) {
      alert(translate('phishing.autofill.blocked', activeLanguage));
      return;
    }
    const activeEl = document.activeElement as HTMLInputElement;
    const target = (activeEl && isLoginInput(activeEl)) ? activeEl : (document.querySelector('input[type="password"], input[type="email"], input[type="text"]') as HTMLInputElement);
    if (target) {
      fillPageCredentials(target, message.username, message.password);
    }
  } else if (message.action === 'aegis_phishing_alert') {
    activePhishingThreat = {
      isSuspicious: true,
      threatType: message.threatType,
      matchedDomain: message.matchedDomain,
      details: message.details
    };
    showInPagePhishingBanner(activePhishingThreat);
  }
});

function isLoginInput(el: HTMLInputElement): boolean {
  if (el.type === 'password') return true;
  
  if (el.type === 'text' || el.type === 'email') {
    const name = (el.name || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const placeholder = (el.placeholder || '').toLowerCase();
    const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
    
    if (autocomplete === 'username' || autocomplete === 'email' || autocomplete === 'username email') {
      return true;
    }
    
    const loginKeywords = ['username', 'login', 'email', 'identifier', 'loginfmt', 'userid', 'user_id', 'eposta', 'kullanici'];
    for (const keyword of loginKeywords) {
      if (name.includes(keyword) || id.includes(keyword) || placeholder.includes(keyword)) {
        return true;
      }
    }
  }
  return false;
}

function isElementVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  let parent = el.parentElement;
  while (parent) {
    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden') {
      return false;
    }
    parent = parent.parentElement;
  }
  return true;
}

function triggerAutoSubmitIfEnabled(inputElement: HTMLInputElement) {
  chrome.storage.local.get(['autoSubmit'], (res) => {
    if (res.autoSubmit === true) {
      setTimeout(() => {
        const form = inputElement.form || inputElement.closest('form');
        if (form) {
          const submitBtn = form.querySelector('input[type="submit"], button[type="submit"]');
          if (submitBtn) {
            (submitBtn as HTMLElement).click();
          } else {
            form.submit();
          }
        } else {
          const parent = inputElement.closest('div');
          if (parent) {
            const buttons = parent.querySelectorAll('button, input[type="button"]');
            for (const btn of Array.from(buttons)) {
              const text = btn.textContent?.toLowerCase() || '';
              if (text.includes('login') || text.includes('giriş') || text.includes('next') || text.includes('ileri') || text.includes('sign')) {
                (btn as HTMLElement).click();
                break;
              }
            }
          }
        }
      }, 250);
    }
  });
}

function checkAndAutofillPendingPassword() {
  if (!lastFilledCredential) return;
  if (Date.now() - lastFilledCredential.timestamp > 15000) {
    wipeLastFilledCredential();
    return;
  }
  
  const passwordInputs = document.querySelectorAll('input[type="password"]');
  passwordInputs.forEach((passEl) => {
    const passInput = passEl as HTMLInputElement;
    if (passInput && !passInput.value && isElementVisible(passInput)) {
      passInput.value = lastFilledCredential!.password;
      passInput.dispatchEvent(new Event('input', { bubbles: true }));
      passInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      wipeLastFilledCredential();
      triggerAutoSubmitIfEnabled(passInput);
    }
  });
}

// Scan inputs and inject 'A' icon button
function scanAndInject() {
  if (typeof document === 'undefined' || !document.body) return;
  const inputs = document.querySelectorAll('input');
  inputs.forEach((inputEl) => {
    const input = inputEl as HTMLInputElement;
    if (!isLoginInput(input)) return;
    
    // Avoid double injection
    if (input.getAttribute('data-aegis-injected') === 'true') return;
    input.setAttribute('data-aegis-injected', 'true');

    const parent = input.parentElement;
    if (!parent) return;

    parent.classList.add('aegis-input-container');

    const iconBtn = document.createElement('button');
    iconBtn.className = 'aegis-icon-btn';
    iconBtn.textContent = 'A';
    iconBtn.type = 'button';
    iconBtn.title = 'Aegis Vault Auto-fill';

    iconBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (activeDropdown && activeTargetInput === input) {
        closeDropdown();
        return;
      }

      chrome.runtime.sendMessage(
        { action: 'query_credentials', url: window.location.href },
        (response) => {
          showDropdown(input, response);
        }
      );
    });

    input.addEventListener('focus', () => {
      chrome.runtime.sendMessage(
        { action: 'query_credentials', url: window.location.href },
        (response) => {
          showDropdown(input, response);
        }
      );
    });
    
    input.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage(
        { action: 'query_credentials', url: window.location.href },
        (response) => {
          showDropdown(input, response);
        }
      );
    });

    parent.appendChild(iconBtn);
  });
  
  checkAndAutofillPendingPassword();
}

function showDropdown(targetInput: HTMLInputElement, response: any) {
  closeDropdown();
  activeTargetInput = targetInput;

  const rect = targetInput.getBoundingClientRect();
  const dropdown = document.createElement('div');
  dropdown.className = 'aegis-dropdown';
  dropdown.style.pointerEvents = 'auto';
  
  // Set floating styles and absolute coordinates relative to the page viewport bounds
  dropdown.style.position = 'absolute';
  dropdown.style.left = `${rect.left + window.scrollX}px`;
  dropdown.style.top = `${rect.bottom + window.scrollY + 4}px`;
  dropdown.style.width = `${Math.max(240, Math.min(360, rect.width))}px`;

  window.addEventListener('scroll', closeDropdown, { passive: true });
  window.addEventListener('resize', closeDropdown, { passive: true });

  if (activePhishingThreat) {
    const warningMsg = document.createElement('div');
    warningMsg.className = 'aegis-dropdown-locked';
    warningMsg.style.color = '#ef4444';
    warningMsg.style.fontWeight = 'bold';
    warningMsg.textContent = translate('phishing.autofill.blocked', activeLanguage);
    dropdown.appendChild(warningMsg);
  } else if (!response || response.locked) {
    const lockedMsg = document.createElement('div');
    lockedMsg.className = 'aegis-dropdown-locked';
    lockedMsg.textContent = translate('locked.title', activeLanguage);
    dropdown.appendChild(lockedMsg);
  } else {
    const credentials = response.credentials || [];
    if (credentials.length > 0) {
      credentials.forEach((item: any) => {
        const option = document.createElement('div');
        option.className = 'aegis-dropdown-item';
        
        const title = document.createElement('span');
        title.className = 'aegis-dropdown-title';
        title.textContent = item.title;
        option.appendChild(title);

        const user = document.createElement('span');
        user.className = 'aegis-dropdown-user';
        user.textContent = item.username || '---';
        option.appendChild(user);

        option.addEventListener('click', (e) => {
          e.stopPropagation();
          fillPageCredentials(targetInput, item.username, item.password || '');
          closeDropdown();
        });

        dropdown.appendChild(option);
      });
    } else {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'aegis-dropdown-locked';
      emptyMsg.textContent = translate('no.matching', activeLanguage);
      dropdown.appendChild(emptyMsg);
    }
  }

  // Enjekte edilen "Güvenli Şifre Üret" Butonu
  const genDivider = document.createElement('div');
  genDivider.style.borderTop = '1px solid rgba(255, 255, 255, 0.08)';
  genDivider.style.margin = '4px 0';
  dropdown.appendChild(genDivider);

  const genOption = document.createElement('div');
  genOption.className = 'aegis-dropdown-item';
  genOption.style.background = 'rgba(16, 185, 129, 0.1)';
  genOption.style.border = '1px dashed rgba(16, 185, 129, 0.3)';
  genOption.style.marginTop = '4px';

  const genTitle = document.createElement('span');
  genTitle.className = 'aegis-dropdown-title';
  genTitle.style.color = '#10b981';
  genTitle.style.fontWeight = 'bold';
  genTitle.style.display = 'flex';
  genTitle.style.alignItems = 'center';
  genTitle.style.gap = '4px';
  genTitle.textContent = translate('section.generate', activeLanguage);
  
  genOption.appendChild(genTitle);

let extensionClipboardTimer: any = null;

function copyToClipboardWithAutoClear(text: string, timeoutMs = 30000) {
  if (extensionClipboardTimer) {
    clearTimeout(extensionClipboardTimer);
    extensionClipboardTimer = null;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      extensionClipboardTimer = setTimeout(() => {
        if (navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText().then((current) => {
            if (current === text) {
              navigator.clipboard.writeText('').catch(() => {});
            }
          }).catch(() => {
            // Security fix D1: Do NOT wipe clipboard if reading fails (preserves user's other data)
          });
        }
      }, timeoutMs);
    }).catch(() => {});
  }
}

  genOption.addEventListener('click', (e) => {
    e.stopPropagation();
    const generated = generateSecurePassword(18);
    
    targetInput.value = generated;
    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
    targetInput.dispatchEvent(new Event('change', { bubbles: true }));

    copyToClipboardWithAutoClear(generated, 30000);

    const form = targetInput.form || targetInput.closest('form');
    if (form) {
      const otherPasswords = form.querySelectorAll('input[type="password"]');
      otherPasswords.forEach((pwEl) => {
        if (pwEl !== targetInput) {
          (pwEl as HTMLInputElement).value = generated;
          pwEl.dispatchEvent(new Event('input', { bubbles: true }));
          pwEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }

    closeDropdown();
  });

  dropdown.appendChild(genOption);

  const root = getAegisShadowRoot();
  root.appendChild(dropdown);
  activeDropdown = dropdown;
}

// Find login/password form fields and fill them
function fillPageCredentials(activeInput: HTMLInputElement, username: string, password: string) {
  if (activePhishingThreat) {
    alert(translate('phishing.autofill.blocked', activeLanguage));
    return;
  }
  lastFilledCredential = { username, password, timestamp: Date.now() };

  const fillInput = (el: HTMLInputElement, val: string) => {
    // Security fix D2: Call native HTMLInputElement.prototype value setter to protect against prototype tampering
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(el, val);
    } else {
      el.value = val;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const passwordInputs = Array.from(document.querySelectorAll('input[type="password"]')) as HTMLInputElement[];
  
  if (activeInput.type === 'password') {
    fillInput(activeInput, password);
    
    const form = activeInput.form || activeInput.closest('form');
    let usernameInput: HTMLInputElement | null = null;
    if (form) {
      usernameInput = form.querySelector('input[type="text"], input[type="email"], input[name="username"], input[name="login"]') as HTMLInputElement;
    }
    if (!usernameInput) {
      const textInputs = document.querySelectorAll('input[type="text"], input[type="email"]');
      textInputs.forEach((textEl) => {
        const textInput = textEl as HTMLInputElement;
        const compare = activeInput.compareDocumentPosition(textInput);
        if (compare & Node.DOCUMENT_POSITION_PRECEDING || compare & Node.DOCUMENT_POSITION_FOLLOWING) {
          usernameInput = textInput;
        }
      });
    }
    
    if (usernameInput) {
      fillInput(usernameInput, username);
    }
    
    wipeLastFilledCredential();
    triggerAutoSubmitIfEnabled(activeInput);
  } else {
    fillInput(activeInput, username);
    
    const form = activeInput.form || activeInput.closest('form');
    let passwordInput: HTMLInputElement | null = null;
    if (form) {
      passwordInput = form.querySelector('input[type="password"]') as HTMLInputElement;
    }
    if (!passwordInput && passwordInputs.length > 0) {
      passwordInput = passwordInputs[0]!;
    }
    
    if (passwordInput) {
      fillInput(passwordInput, password);
      wipeLastFilledCredential();
      triggerAutoSubmitIfEnabled(passwordInput);
    } else {
      triggerAutoSubmitIfEnabled(activeInput);
    }
  }
}

function secureRandomIndex(maxExclusive: number): number {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error('Invalid secure random range');
  }

  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const sample = new Uint32Array(1);
  do {
    crypto.getRandomValues(sample);
  } while (sample[0]! >= limit);

  return sample[0]! % maxExclusive;
}

function chooseSecureChar(charset: string): string {
  return charset[secureRandomIndex(charset.length)]!;
}

function secureShuffle(chars: string[]): string[] {
  for (let index = chars.length - 1; index > 0; index--) {
    const swapIndex = secureRandomIndex(index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex]!, chars[index]!];
  }
  return chars;
}

// Cryptographically secure password generator
export function generateSecurePassword(length = 16): string {
  const safeLength = Math.max(4, Math.floor(length));
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()-_=+[]{}|;:,.<>?';
  const allChars = lowercase + uppercase + numbers + symbols;

  const passwordChars = [
    chooseSecureChar(lowercase),
    chooseSecureChar(uppercase),
    chooseSecureChar(numbers),
    chooseSecureChar(symbols),
  ];

  for (let index = passwordChars.length; index < safeLength; index++) {
    passwordChars.push(chooseSecureChar(allChars));
  }

  return secureShuffle(passwordChars).join('');
}

// Show premium glassmorphic top prompt banner inside isolated Shadow DOM
function showSavePromptBanner(cred: any) {
  const root = getAegisShadowRoot();
  if (root.querySelector('.aegis-banner')) return;

  const banner = document.createElement('div');
  banner.className = 'aegis-banner';
  banner.style.pointerEvents = 'auto';
  
  const info = document.createElement('div');
  info.className = 'aegis-banner-info';
  
  const logo = document.createElement('div');
  logo.className = 'aegis-banner-logo';
  logo.textContent = 'A';
  
  const text = document.createElement('div');
  text.className = 'aegis-banner-text';
  
  const title = document.createElement('span');
  title.className = 'aegis-banner-title';
  title.textContent = translate('banner.saveTitle', activeLanguage);
  
  const desc = document.createElement('span');
  desc.className = 'aegis-banner-desc';
  desc.textContent = translate('banner.saveDesc', activeLanguage) + (cred.username ? ` (${cred.username})` : '');
  
  text.appendChild(title);
  text.appendChild(desc);
  info.appendChild(logo);
  info.appendChild(text);
  
  const actions = document.createElement('div');
  actions.className = 'aegis-banner-actions';
  
  const saveBtn = document.createElement('button');
  saveBtn.className = 'aegis-banner-btn aegis-banner-btn-save';
  saveBtn.textContent = translate('banner.saveBtn', activeLanguage);
  saveBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      action: 'save_new_credential',
      credential: cred
    }, () => {
      banner.classList.remove('show');
      setTimeout(() => banner.remove(), 400);
    });
  });
  
  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'aegis-banner-btn aegis-banner-btn-dismiss';
  dismissBtn.textContent = translate('banner.dismissBtn', activeLanguage);
  dismissBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'clear_pending_credential' }, () => {
      banner.classList.remove('show');
      setTimeout(() => banner.remove(), 400);
    });
  });
  
  actions.appendChild(saveBtn);
  actions.appendChild(dismissBtn);
  
  banner.appendChild(info);
  banner.appendChild(actions);
  
  root.appendChild(banner);
  
  // Animation delay
  setTimeout(() => {
    banner.classList.add('show');
  }, 200);
}

// Global state tracking for robust multi-step or separated DOM field detection
let lastActiveUsername = '';
let lastActivePassword = '';

// Helper to find the best matching username input associated with a password input
function findAssociatedUsernameInput(passwordInput: HTMLInputElement): HTMLInputElement | null {
  const USERNAME_SELECTORS = [
    'input[autocomplete="username"]',
    'input[autocomplete="email"]',
    'input[type="email"]',
    'input[name*="user" i]',
    'input[name*="login" i]',
    'input[name*="email" i]',
    'input[name*="identifier" i]',
    'input[id*="user" i]',
    'input[id*="login" i]',
    'input[id*="email" i]',
    'input[id*="identifier" i]',
    'input[type="text"]'
  ];

  // 1. Search inside the enclosing form
  if (passwordInput.form) {
    for (const selector of USERNAME_SELECTORS) {
      const match = passwordInput.form.querySelector(selector) as HTMLInputElement;
      if (match && match !== passwordInput && match.type !== 'hidden') {
        return match;
      }
    }
  }

  // 2. Search upwards through ancestor containers (up to 6 levels)
  let parent = passwordInput.parentElement;
  let depth = 0;
  while (parent && depth < 6 && parent !== document.body) {
    for (const selector of USERNAME_SELECTORS) {
      const match = parent.querySelector(selector) as HTMLInputElement;
      if (match && match !== passwordInput && match.type !== 'hidden') {
        return match;
      }
    }
    parent = parent.parentElement;
    depth++;
  }

  // 3. Fallback: Search all preceding visible text/email inputs in document order
  const allInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="password"]):not([type="submit"]):not([type="button"])')) as HTMLInputElement[];
  const preceding = allInputs.filter(input => (input.compareDocumentPosition(passwordInput) & Node.DOCUMENT_POSITION_PRECEDING) !== 0 && input.value);
  if (preceding.length > 0) {
    return preceding[preceding.length - 1]!;
  }

  return null;
}

// Helper to find active password input on the page or inside container
function findPasswordInput(context?: HTMLElement | null): HTMLInputElement | null {
  if (context) {
    const pw = context.querySelector('input[type="password"]') as HTMLInputElement;
    if (pw && pw.value) return pw;
  }

  // Search inside nearest form
  if (context) {
    const form = context.closest('form');
    if (form) {
      const pw = form.querySelector('input[type="password"]') as HTMLInputElement;
      if (pw && pw.value) return pw;
    }
  }

  // Fallback: document-level password inputs with values
  const allPasswords = Array.from(document.querySelectorAll('input[type="password"]')) as HTMLInputElement[];
  const filled = allPasswords.filter(p => p.value && p.value.length >= 4);
  if (filled.length > 0) {
    return filled[filled.length - 1]!;
  }

  return allPasswords[0] || null;
}

// Update draft credential in background script as user types/blurs
function updateDraftCredential(inputEl: HTMLInputElement) {
  let password = '';
  let username = '';

  if (inputEl.type === 'password') {
    password = inputEl.value;
    const userInput = findAssociatedUsernameInput(inputEl);
    username = userInput ? userInput.value.trim() : lastActiveUsername;
  } else {
    username = inputEl.value.trim();
    if (username) {
      lastActiveUsername = username;
    }
    const pwInput = findPasswordInput(inputEl.form || inputEl.parentElement);
    if (pwInput) {
      password = pwInput.value;
    }
  }

  if (username) lastActiveUsername = username;
  if (password) lastActivePassword = password;

  if (password.length < 4) return;

  chrome.runtime.sendMessage({
    action: 'update_draft_credential',
    credential: {
      title: document.title || window.location.hostname,
      username: username || lastActiveUsername,
      password: password,
      url: window.location.href
    }
  });
}

// Intercept form submissions
function handleFormSubmit(formOrEl?: HTMLElement | null) {
  const passwordInput = findPasswordInput(formOrEl);
  const password = passwordInput?.value || lastActivePassword;
  if (!password || password.length < 4) return;

  let username = '';
  if (passwordInput) {
    const userInput = findAssociatedUsernameInput(passwordInput);
    username = userInput ? userInput.value.trim() : '';
  }
  if (!username) {
    username = lastActiveUsername;
  }

  chrome.runtime.sendMessage({
    action: 'set_pending_credential',
    credential: {
      title: document.title || window.location.hostname,
      username: username,
      password: password,
      url: window.location.href
    }
  });
}

// Setup listeners for submission and real-time typing
document.addEventListener('blur', (e) => {
  const target = e.target as HTMLInputElement;
  if (target && target.tagName === 'INPUT' && (target.type === 'password' || target.type === 'text' || target.type === 'email')) {
    updateDraftCredential(target);
  }
}, true);

document.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  if (target && target.tagName === 'INPUT' && (target.type === 'password' || target.type === 'text' || target.type === 'email')) {
    updateDraftCredential(target);
  }
}, true);

document.addEventListener('submit', (e) => {
  handleFormSubmit(e.target as HTMLElement);
}, true);

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target && (target.tagName === 'BUTTON' || target.tagName === 'INPUT')) {
    const type = target.getAttribute('type');
    const textContent = (target.textContent || '').toLowerCase();
    const isSubmit = type === 'submit' || 
                     textContent.includes('giriş') ||
                     textContent.includes('login') ||
                     textContent.includes('kaydet') ||
                     textContent.includes('save') ||
                     textContent.includes('register') ||
                     textContent.includes('sign') ||
                     textContent.includes('oturumu aç');
    if (isSubmit) {
      handleFormSubmit(target.closest('form') || target.parentElement);
    }
  }
}, true);

// Initial check for pending credentials on load
setTimeout(() => {
  chrome.runtime.sendMessage({ action: 'get_pending_credential' }, (response) => {
    if (response && response.credential) {
      const cred = response.credential;
      try {
        const credDomain = new URL(cred.url).hostname.replace('www.', '').toLowerCase();
        const currentDomain = window.location.hostname.replace('www.', '').toLowerCase();
        
        if (credDomain === currentDomain) {
          // Verify if it doesn't already exist in matches to prevent duplicate saves
          chrome.runtime.sendMessage(
            { action: 'query_credentials', url: window.location.href },
            (dbResponse) => {
              const exists = dbResponse && dbResponse.credentials && dbResponse.credentials.some((item: any) => {
                return item.username === cred.username && item.password === cred.password;
              });

              if (!exists) {
                showSavePromptBanner(cred);
              } else {
                chrome.runtime.sendMessage({ action: 'clear_pending_credential' });
              }
            }
          );
        }
      } catch (e) {
        console.warn('Pending credentials verification failed:', e);
      }
    }
  });
}, 800);

// Setup mutation observer to scan for dynamically loaded SPA fields
if (typeof document !== 'undefined' && document.body) {
  const observer = new MutationObserver(() => {
    scanAndInject();
  });
  observer.observe(document.body, { 
    childList: true, 
    subtree: true,
  });
}

// Initial scan
if (typeof document !== 'undefined' && document.body) {
  scanAndInject();
}
initializePhishingCheck();
