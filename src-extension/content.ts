import { translate, getPreferredLanguage } from './i18n';
import { extractRegistrableDomain, extractRegistrableDomainFromUrl, isSuspiciousIdnHostname } from './psl-utils';

const activeLanguage = getPreferredLanguage();

// CSS injected dynamically for the inline overlay, icon, and premium banner
const inlineStyle = `
  .KalderaShield-input-container {
    position: relative !important;
  }
  .KalderaShield-icon-btn {
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
    padding: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    z-index: 99999 !important;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
    opacity: 0.7 !important;
    transition: opacity 0.2s, transform 0.2s !important;
  }
  .KalderaShield-icon-btn:hover {
    opacity: 1 !important;
    transform: translateY(-50%) scale(1.1) !important;
  }
  .KalderaShield-dropdown {
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
    animation: KalderaShield-fade-in 0.2s ease-out !important;
  }
  .KalderaShield-dropdown-item {
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
  .KalderaShield-dropdown-item:hover {
    background: rgba(255, 255, 255, 0.08) !important;
  }
  .KalderaShield-dropdown-title {
    font-weight: 600 !important;
  }
  .KalderaShield-dropdown-user {
    color: #94a3b8 !important;
    font-size: 10px !important;
  }
  .KalderaShield-dropdown-locked {
    padding: 10px !important;
    color: #94a3b8 !important;
    font-size: 11px !important;
    text-align: center !important;
  }
  .KalderaShield-banner {
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
  .KalderaShield-banner.show {
    top: 16px !important;
  }
  .KalderaShield-banner-info {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    flex: 1 !important;
  }
        .KalderaShield-banner-logo {
          width: 32px !important;
          height: 32px !important;
          background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%) !important;
          border-radius: 8px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          color: white !important;
        }
  .KalderaShield-banner-text {
    display: flex !important;
    flex-direction: column !important;
    gap: 2px !important;
    text-align: left !important;
  }
  .KalderaShield-banner-title {
    color: #ffffff !important;
    font-weight: 700 !important;
    font-size: 13px !important;
  }
  .KalderaShield-banner-desc {
    color: #94a3b8 !important;
    font-size: 11px !important;
  }
  .KalderaShield-banner-actions {
    display: flex !important;
    gap: 8px !important;
  }
  .KalderaShield-banner-btn {
    padding: 6px 14px !important;
    border-radius: 6px !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    cursor: pointer !important;
    border: none !important;
    transition: background 0.15s, transform 0.1s !important;
  }
  .KalderaShield-banner-btn:active {
    transform: scale(0.96) !important;
  }
  .KalderaShield-banner-btn-save {
    background: #10b981 !important;
    color: white !important;
  }
  .KalderaShield-banner-btn-save:hover {
    background: #059669 !important;
  }
  .KalderaShield-banner-btn-dismiss {
    background: rgba(255, 255, 255, 0.08) !important;
    color: #cbd5e1 !important;
  }
  .KalderaShield-banner-btn-dismiss:hover {
    background: rgba(255, 255, 255, 0.15) !important;
  }
  @keyframes KalderaShield-fade-in {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Phishing Alert Banner Styles */
  .KalderaShield-phishing-alert-banner {
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
  .KalderaShield-phishing-alert-banner.show {
    top: 24px !important;
  }
  .KalderaShield-phishing-alert-icon {
    font-size: 28px !important;
    flex-shrink: 0 !important;
    animation: KalderaShield-wiggle 1s ease-in-out infinite alternate !important;
  }
  .KalderaShield-phishing-alert-info {
    display: flex !important;
    flex-direction: column !important;
    gap: 4px !important;
    flex: 1 !important;
    text-align: left !important;
  }
  .KalderaShield-phishing-alert-title {
    color: #ffffff !important;
    font-weight: 800 !important;
    font-size: 15px !important;
    letter-spacing: 0.3px !important;
  }
  .KalderaShield-phishing-alert-desc {
    color: #fee2e2 !important;
    font-size: 12px !important;
    line-height: 1.4 !important;
    opacity: 0.95 !important;
  }
  .KalderaShield-phishing-alert-domain {
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
  .KalderaShield-phishing-alert-btn {
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
  .KalderaShield-phishing-alert-btn:hover {
    background: #fecaca !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 6px 12px rgba(0,0,0,0.15) !important;
  }
  .KalderaShield-phishing-alert-btn:active {
    transform: translateY(0) !important;
  }
  @keyframes KalderaShield-wiggle {
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
    // P2-17 / R-2: Exempt well-known internationalized TLDs from unconditional flagging
    if (isSuspiciousIdnHostname(hostname)) {
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
  .KalderaShield-dropdown {
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
  .KalderaShield-dropdown-item {
    padding: 8px 10px !important;
    border-radius: 6px !important;
    cursor: pointer !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 2px !important;
    transition: background 0.15s ease !important;
    color: #f8fafc !important;
  }
  .KalderaShield-dropdown-item:hover {
    background: rgba(255, 255, 255, 0.08) !important;
  }
  .KalderaShield-dropdown-title {
    font-weight: 600 !important;
    color: #f8fafc !important;
    font-size: 13px !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }
  .KalderaShield-dropdown-user {
    font-size: 11px !important;
    color: #94a3b8 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }
  .KalderaShield-dropdown-locked {
    padding: 10px !important;
    text-align: center !important;
    color: #94a3b8 !important;
    font-size: 12px !important;
  }
  .KalderaShield-phishing-alert-banner {
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
  .KalderaShield-phishing-alert-banner.show {
    transform: translateX(-50%) translateY(0) !important;
    opacity: 1 !important;
  }
  .KalderaShield-phishing-alert-icon {
    font-size: 24px !important;
    flex-shrink: 0 !important;
  }
  .KalderaShield-phishing-alert-info {
    display: flex !important;
    flex-direction: column !important;
    gap: 2px !important;
    flex: 1 !important;
  }
  .KalderaShield-phishing-alert-title {
    font-weight: 700 !important;
    font-size: 14px !important;
    color: #ffffff !important;
  }
  .KalderaShield-phishing-alert-desc {
    font-size: 12px !important;
    color: #fecdd3 !important;
  }
  .KalderaShield-phishing-alert-domain {
    font-family: monospace !important;
    background: rgba(0, 0, 0, 0.2) !important;
    padding: 2px 6px !important;
    border-radius: 4px !important;
    font-size: 11px !important;
    color: #fde047 !important;
    display: inline-block !important;
    margin-top: 4px !important;
  }
  .KalderaShield-phishing-alert-btn {
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
  .KalderaShield-phishing-alert-btn:hover {
    background: rgba(255, 255, 255, 0.3) !important;
  }
  .KalderaShield-banner {
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
  .KalderaShield-banner.show {
    transform: translateY(0) !important;
    opacity: 1 !important;
  }
  .KalderaShield-banner-info {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
  }
        .KalderaShield-banner-logo {
          width: 28px !important;
          height: 28px !important;
          background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%) !important;
          border-radius: 8px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          color: white !important;
        }
  .KalderaShield-banner-text {
    display: flex !important;
    flex-direction: column !important;
    gap: 2px !important;
  }
  .KalderaShield-banner-title {
    font-weight: 700 !important;
    font-size: 13px !important;
    color: #f8fafc !important;
  }
  .KalderaShield-banner-desc {
    font-size: 11px !important;
    color: #94a3b8 !important;
  }
  .KalderaShield-banner-actions {
    display: flex !important;
    gap: 8px !important;
  }
  .KalderaShield-banner-btn {
    padding: 6px 12px !important;
    border-radius: 6px !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    cursor: pointer !important;
    border: none !important;
  }
  .KalderaShield-banner-btn-save {
    background: #10b981 !important;
    color: white !important;
  }
  .KalderaShield-banner-btn-save:hover {
    background: #059669 !important;
  }
  .KalderaShield-banner-btn-dismiss {
    background: rgba(255, 255, 255, 0.1) !important;
    color: #94a3b8 !important;
  }
  .KalderaShield-banner-btn-dismiss:hover {
    background: rgba(255, 255, 255, 0.15) !important;
    color: #f8fafc !important;
  }
`;

function getKalderaShieldShadowRoot(): ShadowRoot {
  if (!shadowHost || !shadowHost.isConnected) {
    shadowHost = document.createElement('KalderaShield-autofill-host');
    shadowHost.id = 'KalderaShield-root-host';
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
  const root = getKalderaShieldShadowRoot();
  if (root.querySelector('.KalderaShield-phishing-alert-banner')) return;

  const banner = document.createElement('div');
  banner.className = 'KalderaShield-phishing-alert-banner';
  banner.style.pointerEvents = 'auto';

  const icon = document.createElement('div');
  icon.className = 'KalderaShield-phishing-alert-icon';
  icon.textContent = result.threatType === 'homograph' ? '🛡️' : 
                     result.threatType === 'confusable' ? '🔤' :
                     result.threatType === 'typosquat' ? '🎯' : '⚠️';

  const info = document.createElement('div');
  info.className = 'KalderaShield-phishing-alert-info';

  const title = document.createElement('span');
  title.className = 'KalderaShield-phishing-alert-title';
  
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
  desc.className = 'KalderaShield-phishing-alert-desc';
  let descText = translate(descKey as any, activeLanguage);
  if (result.matchedDomain && (result.threatType === 'typosquat' || result.threatType === 'confusable')) {
    descText += ` ${result.matchedDomain}`;
  }
  desc.textContent = descText;

  info.appendChild(title);
  info.appendChild(desc);

  if (result.details) {
    const details = document.createElement('span');
    details.className = 'KalderaShield-phishing-alert-domain';
    details.textContent = result.details;
    info.appendChild(details);
  }

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'KalderaShield-phishing-alert-btn';
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
let lastFilledCredential: { username: string; password: string; timestamp: number; formElement: HTMLFormElement | null } | null = null;

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

function showSecurityToast(message: string): void {
  const root = getKalderaShieldShadowRoot();
  const existing = root.querySelector('.KalderaShield-security-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'KalderaShield-security-toast';
  toast.style.cssText = `
    position: fixed !important; top: 20px !important; right: 20px !important; z-index: 2147483647 !important;
    background: #ef4444 !important; color: #ffffff !important; padding: 12px 18px !important; border-radius: 8px !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    font-size: 13px !important; font-weight: 600 !important; box-shadow: 0 4px 16px rgba(0,0,0,0.3) !important;
    display: flex !important; align-items: center !important; gap: 8px !important; transition: opacity 0.3s ease !important;
    pointer-events: auto !important;
  `;
  const icon = document.createElement('span');
  icon.textContent = '🛡️';
  const text = document.createElement('span');
  text.textContent = message;
  toast.appendChild(icon);
  toast.appendChild(text);
  root.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Handle messages from background service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'fill_inputs') {
    if (activePhishingThreat) {
      showSecurityToast(translate('phishing.autofill.blocked', activeLanguage));
      return;
    }
    const activeEl = document.activeElement as HTMLInputElement;
    const target = (activeEl && isLoginInput(activeEl)) ? activeEl : (document.querySelector('input[type="password"], input[type="email"], input[type="text"]') as HTMLInputElement);
    if (target) {
      fillPageCredentials(target, message.username, message.password);
    }
  } else if (message.action === 'KalderaShield_phishing_alert') {
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
  
  // P1-7b: Only refill password inputs that belong to the same <form> as the
  // originally filled field. This prevents a malicious page from injecting a
  // hidden password input outside the legitimate form to exfiltrate the password.
  const originalForm = lastFilledCredential.formElement || null;
  const passwordInputs = document.querySelectorAll('input[type="password"]');
  passwordInputs.forEach((passEl) => {
    const passInput = passEl as HTMLInputElement;
    if (passInput && !passInput.value && isElementVisible(passInput)) {
      // If we have a reference to the original form, restrict refill to the same form
      if (originalForm && passInput.form !== originalForm) {
        return; // Skip — different form
      }
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
    if (input.getAttribute('data-KalderaShield-injected') === 'true') return;
    input.setAttribute('data-KalderaShield-injected', 'true');

    const parent = input.parentElement;
    if (!parent) return;

    parent.classList.add('KalderaShield-input-container');

      const iconBtn = document.createElement('button');
      iconBtn.className = 'KalderaShield-icon-btn';
      // A shield mark rather than a letter: the old single "A" initial read as a
      // leftover from the previous name and looked like a stray character in the
      // password field rather than a control.
      iconBtn.innerHTML =
        '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" ' +
        'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>' +
        '<path d="m9 12 2 2 4-4"/></svg>';
      iconBtn.type = 'button';
      iconBtn.title = 'KalderaShield Auto-fill';
      iconBtn.setAttribute('aria-label', 'KalderaShield Auto-fill');

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
  dropdown.className = 'KalderaShield-dropdown';
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
    warningMsg.className = 'KalderaShield-dropdown-locked';
    warningMsg.style.color = '#ef4444';
    warningMsg.style.fontWeight = 'bold';
    warningMsg.textContent = translate('phishing.autofill.blocked', activeLanguage);
    dropdown.appendChild(warningMsg);
  } else if (!response || response.locked) {
    const lockedMsg = document.createElement('div');
    lockedMsg.className = 'KalderaShield-dropdown-locked';
    lockedMsg.textContent = translate('locked.title', activeLanguage);
    dropdown.appendChild(lockedMsg);
  } else {
    const credentials = response.credentials || [];
    if (credentials.length > 0) {
      credentials.forEach((item: any) => {
        const option = document.createElement('div');
        option.className = 'KalderaShield-dropdown-item';
        
        const title = document.createElement('span');
        title.className = 'KalderaShield-dropdown-title';
        title.textContent = item.title;
        option.appendChild(title);

        const user = document.createElement('span');
        user.className = 'KalderaShield-dropdown-user';
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
      emptyMsg.className = 'KalderaShield-dropdown-locked';
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
  genOption.className = 'KalderaShield-dropdown-item';
  genOption.style.background = 'rgba(16, 185, 129, 0.1)';
  genOption.style.border = '1px dashed rgba(16, 185, 129, 0.3)';
  genOption.style.marginTop = '4px';

  const genTitle = document.createElement('span');
  genTitle.className = 'KalderaShield-dropdown-title';
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

  const root = getKalderaShieldShadowRoot();
  root.appendChild(dropdown);
  activeDropdown = dropdown;
}

// Find login/password form fields and fill them
function fillPageCredentials(activeInput: HTMLInputElement, username: string, password: string) {
  if (activePhishingThreat) {
    showSecurityToast(translate('phishing.autofill.blocked', activeLanguage));
    return;
  }
  // P1-7b: Track the form element for refill containment
  const formElement = activeInput?.form || (document.activeElement as HTMLInputElement | null)?.form || null;
  lastFilledCredential = { username, password, timestamp: Date.now(), formElement };

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

export interface CapturedCredentialPayload {
  title?: string;
  username?: string;
  password?: string;
  url?: string;
  category?: string;
}

interface VaultQueryCredential {
  id?: string;
  title?: string;
  username?: string;
  password?: string;
  url?: string;
  category?: string;
  favorite?: boolean;
}

// Show premium glassmorphic top prompt banner inside isolated Shadow DOM
function showSavePromptBanner(cred: CapturedCredentialPayload) {
  const root = getKalderaShieldShadowRoot();
  if (root.querySelector('.KalderaShield-banner')) return;

  const banner = document.createElement('div');
  banner.className = 'KalderaShield-banner';
  banner.style.pointerEvents = 'auto';
  
  const info = document.createElement('div');
  info.className = 'KalderaShield-banner-info';
  
  const logo = document.createElement('div');
  logo.className = 'KalderaShield-banner-logo';
  logo.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>' +
    '<path d="m9 12 2 2 4-4"/></svg>';
  
  const text = document.createElement('div');
  text.className = 'KalderaShield-banner-text';
  
  const title = document.createElement('span');
  title.className = 'KalderaShield-banner-title';
  title.textContent = translate('banner.saveTitle', activeLanguage);
  
  const desc = document.createElement('span');
  desc.className = 'KalderaShield-banner-desc';
  desc.textContent = translate('banner.saveDesc', activeLanguage) + (cred.username ? ` (${cred.username})` : '');
  
  text.appendChild(title);
  text.appendChild(desc);
  info.appendChild(logo);
  info.appendChild(text);
  
  const actions = document.createElement('div');
  actions.className = 'KalderaShield-banner-actions';
  
  const saveBtn = document.createElement('button');
  saveBtn.className = 'KalderaShield-banner-btn KalderaShield-banner-btn-save';
  saveBtn.textContent = translate('banner.saveBtn', activeLanguage);
  saveBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      action: 'save_new_credential',
      credential: {
        title: cred.title || document.title || window.location.hostname,
        username: cred.username || '',
        password: cred.password || '',
        url: cred.url || window.location.href,
        category: 'login'
      }
    }, () => {
      banner.classList.remove('show');
      setTimeout(() => banner.remove(), 400);
    });
  });
  
  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'KalderaShield-banner-btn KalderaShield-banner-btn-dismiss';
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

function isNonUsernameInput(el: HTMLInputElement): boolean {
  if (!el || el.type === 'password' || el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'search' || el.type === 'checkbox' || el.type === 'radio' || el.type === 'file') {
    return true;
  }
  if (el.disabled || el.readOnly) return true;
  if (!isElementVisible(el)) return true;

  const combined = `${el.name || ''} ${el.id || ''} ${el.className || ''} ${el.getAttribute('placeholder') || ''} ${el.getAttribute('aria-label') || ''}`.toLowerCase();
  
  const ignoredKeywords = [
    'search', 'query', 'arama', 'filter', 'filtre', 'captcha', 'recaptcha',
    'csrf', 'xsrf', 'token', 'otp', 'totp', '2fa', 'pin', 'coupon', 'promo', 'discount',
    'indirim', 'comment', 'yorum', 'msg', 'message', 'mesaj', 'cvv', 'cvc', 'card', 'kart',
    'phone', 'tel', 'telefon', 'mobile', 'address', 'adres', 'city', 'sehir', 'zip', 'postakodu'
  ];

  for (const kw of ignoredKeywords) {
    if (el.name.toLowerCase() === kw || el.id.toLowerCase() === kw) return true;
    if (combined.includes(kw) && !combined.includes('user') && !combined.includes('login') && !combined.includes('email') && !combined.includes('kullanici') && !combined.includes('kullanıcı')) {
      return true;
    }
  }

  return false;
}

function scoreUsernameCandidate(el: HTMLInputElement, passwordInput: HTMLInputElement): number {
  if (isNonUsernameInput(el)) return -1;

  let score = 0;
  const name = (el.name || '').toLowerCase();
  const id = (el.id || '').toLowerCase();
  const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
  const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
  const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();

  // Autocomplete standard attribute
  if (autocomplete === 'username' || autocomplete === 'email') score += 100;
  else if (autocomplete.includes('username') || autocomplete.includes('email')) score += 80;

  // Type email
  if (el.type === 'email') score += 90;

  // Strong keyword matches
  const highKeywords = ['username', 'login', 'email', 'user_id', 'userid', 'loginfmt', 'identifier', 'user_name', 'eposta', 'kullanici', 'kullanıcı'];
  for (const kw of highKeywords) {
    if (name === kw || id === kw) score += 85;
    else if (name.includes(kw) || id.includes(kw)) score += 70;
    if (placeholder.includes(kw) || ariaLabel.includes(kw)) score += 60;
  }

  // Preceding closeness bonus (closer to password input in DOM is more likely to be username)
  if ((el.compareDocumentPosition(passwordInput) & Node.DOCUMENT_POSITION_PRECEDING) !== 0) {
    score += 20;
  }

  // If the input has a non-empty value, major priority boost
  if (el.value && el.value.trim().length > 0) {
    score += 50;
  }

  return score;
}

function pickBestUsernameCandidate(inputs: HTMLInputElement[], passwordInput: HTMLInputElement): HTMLInputElement | null {
  let bestInput: HTMLInputElement | null = null;
  let bestScore = 0;

  for (const input of inputs) {
    if (input === passwordInput) continue;
    const score = scoreUsernameCandidate(input, passwordInput);
    if (score > bestScore) {
      bestScore = score;
      bestInput = input;
    }
  }

  return bestInput;
}

// Helper to find the best matching username input associated with a password input
function findAssociatedUsernameInput(passwordInput: HTMLInputElement): HTMLInputElement | null {
  // 1. Search inside the enclosing form
  const form = passwordInput.form || passwordInput.closest('form');
  if (form) {
    const inputs = Array.from(form.querySelectorAll('input')) as HTMLInputElement[];
    const best = pickBestUsernameCandidate(inputs, passwordInput);
    if (best) return best;
  }

  // 2. Search upwards through ancestor containers (up to 6 levels)
  let parent = passwordInput.parentElement;
  let depth = 0;
  while (parent && depth < 6 && parent !== document.body) {
    const inputs = Array.from(parent.querySelectorAll('input')) as HTMLInputElement[];
    const best = pickBestUsernameCandidate(inputs, passwordInput);
    if (best) return best;
    parent = parent.parentElement;
    depth++;
  }

  // 3. Fallback: Search all preceding visible text/email inputs in document order
  const allInputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
  const preceding = allInputs.filter(input => (input.compareDocumentPosition(passwordInput) & Node.DOCUMENT_POSITION_PRECEDING) !== 0);
  const bestPreceding = pickBestUsernameCandidate(preceding, passwordInput);
  if (bestPreceding) return bestPreceding;

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
    username = userInput?.value ? userInput.value.trim() : (lastActiveUsername || '');
  } else {
    // If user is typing in a non-password field:
    // Ignore search bars, comments, captcha, etc.
    if (isNonUsernameInput(inputEl)) {
      return;
    }

    const val = inputEl.value.trim();
    if (val && isLoginInput(inputEl)) {
      lastActiveUsername = val;
      username = val;
    } else if (val) {
      username = val;
    }

    const pwInput = findPasswordInput(inputEl.form || inputEl.parentElement);
    if (pwInput) {
      password = pwInput.value;
    }
  }

  if (username && isLoginInput(inputEl)) lastActiveUsername = username;
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
    username = userInput?.value ? userInput.value.trim() : '';
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
      if (!cred.password || cred.password.length < 4) {
        chrome.runtime.sendMessage({ action: 'clear_pending_credential' });
        return;
      }
      try {
        const credDomain = extractRegistrableDomainFromUrl(cred.url || window.location.href);
        const currentDomain = extractRegistrableDomainFromUrl(window.location.href);
        
        if (!credDomain || !currentDomain || credDomain === currentDomain) {
          // Verify if it doesn't already exist in matches to prevent duplicate save prompts
          chrome.runtime.sendMessage(
            { action: 'query_credentials', url: window.location.href },
            (dbResponse) => {
              const matchingList = (dbResponse && dbResponse.credentials) ? dbResponse.credentials : [];
              const exists = matchingList.some((item: VaultQueryCredential) => {
                const sameUser = !cred.username || !item.username || item.username.toLowerCase() === cred.username.toLowerCase();
                const samePass = Boolean(item.password && cred.password && item.password === cred.password);
                return sameUser && samePass;
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
