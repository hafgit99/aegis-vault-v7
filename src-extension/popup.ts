import { translate, getPreferredLanguage, savePreferredLanguage, ExtensionLanguage } from './i18n';
import { extractRegistrableDomain, extractRegistrableDomainFromUrl, isSuspiciousIdnHostname } from './psl-utils';

// Interfaces for response credentials
interface CredentialItem {
  id: string;
  title: string;
  username: string;
  password?: string;
  url: string;
  category: string;
  favorite?: boolean;
}

let activeLanguage = getPreferredLanguage();
let activeUrl = '';

// DOM elements
const lockedScreen = document.getElementById('lockedScreen') as HTMLDivElement;
const credentialList = document.getElementById('credentialList') as HTMLDivElement;
const searchWrapper = document.getElementById('searchWrapper') as HTMLDivElement;
const searchInput = document.getElementById('searchInput') as HTMLInputElement;
const phishingBanner = document.getElementById('phishingBanner') as HTMLDivElement;
const phishingText = document.getElementById('phishingText') as HTMLSpanElement;
const langSelect = document.getElementById('langSelect') as HTMLSelectElement;
const themeToggle = document.getElementById('themeToggle') as HTMLButtonElement;
const toast = document.getElementById('toast') as HTMLDivElement;
const focusAppBtn = document.getElementById('focusAppBtn') as HTMLButtonElement;
const autoSubmitBtn = document.getElementById('autoSubmitBtn') as HTMLButtonElement;
const autoSubmitText = document.getElementById('autoSubmitText') as HTMLSpanElement;

// Helper to update auto-submit button visual state
function updateAutoSubmitState(isEnabled: boolean) {
  if (autoSubmitBtn) {
    autoSubmitBtn.classList.toggle('active', isEnabled);
    autoSubmitBtn.setAttribute('aria-pressed', String(isEnabled));
  }
}

// Load auto-submit setting
chrome.storage.local.get(['autoSubmit'], (res) => {
  updateAutoSubmitState(res.autoSubmit === true);
});

if (autoSubmitBtn) {
  autoSubmitBtn.addEventListener('click', () => {
    chrome.storage.local.get(['autoSubmit'], (res) => {
      const nextState = !(res.autoSubmit === true);
      chrome.storage.local.set({ autoSubmit: nextState }, () => {
        updateAutoSubmitState(nextState);
      });
    });
  });
}

// Text Elements for translation
const lockedTitle = document.getElementById('lockedTitle') as HTMLHeadingElement;
const lockedDesc = document.getElementById('lockedDesc') as HTMLParagraphElement;

// Initialize language dropdown
langSelect.value = activeLanguage;
langSelect.addEventListener('change', (e) => {
  activeLanguage = (e.target as HTMLSelectElement).value as ExtensionLanguage;
  savePreferredLanguage(activeLanguage);
  applyTranslations();
  refreshUI();
});

// Bind click handler for focusAppBtn
focusAppBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'focus_window' });
});

// Initialize theme
const currentTheme = localStorage.getItem('aegis-extension-theme') || 'dark';
document.body.className = currentTheme;
themeToggle.textContent = currentTheme === 'dark' ? '☀️' : '🌙';

themeToggle.addEventListener('click', () => {
  const newTheme = document.body.className === 'dark' ? 'light' : 'dark';
  document.body.className = newTheme;
  localStorage.setItem('aegis-extension-theme', newTheme);
  themeToggle.textContent = newTheme === 'dark' ? '☀️' : '🌙';
});

// Toast Helper
function showToast(message: string) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

// Clipboard copy helper with 30s auto-clear matching desktop policy
let extensionClipboardTimer: ReturnType<typeof setTimeout> | null = null;

export function copyToClipboardSecurely(text: string, isSensitive = true) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('copied.feedback');

    if (isSensitive && text) {
      if (extensionClipboardTimer) {
        clearTimeout(extensionClipboardTimer);
      }
      extensionClipboardTimer = setTimeout(() => {
        navigator.clipboard.readText().then((current) => {
          if (current === text) {
            navigator.clipboard.writeText('').catch(() => {});
          }
        }).catch(() => {
          // L-8 / Security fix D1: Do NOT wipe clipboard blindly if reading fails (preserves user's other data)
        });
      }, 30000); // 30s auto-clear policy
    }
  }).catch(() => {});
}

// Translate page static elements
function applyTranslations() {
  document.documentElement.dir = activeLanguage === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = activeLanguage;
  lockedTitle.textContent = translate('locked.title', activeLanguage);
  lockedDesc.textContent = translate('locked.description', activeLanguage);
  focusAppBtn.textContent = translate('btn.openApp', activeLanguage);
  searchInput.placeholder = translate('search.placeholder', activeLanguage);
  phishingText.textContent = translate('phishing.warning', activeLanguage);
  if (autoSubmitText) {
    autoSubmitText.textContent = translate('settings.autoSubmitCompact' as any, activeLanguage);
  }
  if (autoSubmitBtn) {
    autoSubmitBtn.title = translate('settings.autoSubmitTooltip' as any, activeLanguage) || translate('settings.autoSubmit', activeLanguage);
  }
}

// ─── Advanced Phishing Detection Engine ───────────────────────────────────────

// Unicode confusable character map: characters that visually resemble Latin letters
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

// Latin look-alike substitutions for typo-squatting detection
const TYPOSQUAT_SUBS: Record<string, string[]> = {
  'a': ['4', '@', '\u00e0', '\u00e1', '\u00e2', '\u00e3', '\u00e4'],
  'e': ['3', '\u00e8', '\u00e9', '\u00ea', '\u00eb'],
  'i': ['1', '!', 'l', '|', '\u00ec', '\u00ed', '\u00ee', '\u00ef'],
  'l': ['1', '!', 'i', '|'],
  'o': ['0', '\u00f2', '\u00f3', '\u00f4', '\u00f5', '\u00f6'],
  's': ['5', '$', '\u015f'],
  't': ['7', '+'],
  'g': ['9', 'q'],
  'b': ['8', 'd'],
  'n': ['m'],
  'm': ['n', 'rn'],
};

type PhishingThreatType = 'homograph' | 'confusable' | 'typosquat' | null;

interface PhishingResult {
  isSuspicious: boolean;
  threatType: PhishingThreatType;
  matchedDomain?: string;
  details?: string;
}

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
      // Transposition (Damerau)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i]![j] = Math.min(dp[i]![j]!, dp[i - 2]![j - 2]! + cost);
      }
    }
  }
  return dp[m]![n]!;
}

function checkPhishing(url: string, trustedDomains: string[] = []): PhishingResult {
  const result: PhishingResult = { isSuspicious: false, threatType: null };
  if (!url) return result;

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // 1. IDN Punycode homograph detection (R-2)
    if (isSuspiciousIdnHostname(hostname)) {
      result.isSuspicious = true;
      result.threatType = 'homograph';
      result.details = hostname;
      return result;
    }

    // 2. Non-ASCII / Unicode confusable detection
    const asciiRegex = /^[\x00-\x7F]*$/;
    if (!asciiRegex.test(hostname)) {
      result.isSuspicious = true;
      result.threatType = hasConfusableChars(hostname) ? 'confusable' : 'homograph';
      result.details = hostname;
      return result;
    }

    // 3. Confusable character substitution in ASCII domain
    //    (e.g. paypa1.com where 1 looks like l)
    const activeDomain = extractRegistrableDomain(hostname);
    if (hasConfusableChars(activeDomain)) {
      const normalized = normalizeConfusables(activeDomain);
      for (const trusted of trustedDomains) {
        if (normalized === trusted && activeDomain !== trusted) {
          result.isSuspicious = true;
          result.threatType = 'confusable';
          result.matchedDomain = trusted;
          result.details = activeDomain;
          return result;
        }
      }
    }

    // 4. Typo-squatting: Levenshtein distance against vault domains
    if (trustedDomains.length > 0) {
      for (const trusted of trustedDomains) {
        if (activeDomain === trusted) continue; // exact match, safe

        const dist = levenshteinDistance(activeDomain, trusted);
        const maxLen = Math.max(activeDomain.length, trusted.length);
        const similarity = 1 - dist / maxLen;

        // Flag if similarity >= 85% but not identical
        if (similarity >= 0.85 && dist > 0 && dist <= 3) {
          result.isSuspicious = true;
          result.threatType = 'typosquat';
          result.matchedDomain = trusted;
          result.details = activeDomain;
          return result;
        }

        // Also check with confusable normalization
        const normalizedActive = normalizeConfusables(activeDomain);
        const normalizedTrusted = normalizeConfusables(trusted);
        if (normalizedActive === normalizedTrusted && activeDomain !== trusted) {
          result.isSuspicious = true;
          result.threatType = 'confusable';
          result.matchedDomain = trusted;
          result.details = activeDomain;
          return result;
        }
      }
    }

    return result;
  } catch {
    return result;
  }
}

let allCredentials: CredentialItem[] = [];
let suggestedCredentials: CredentialItem[] = [];
let favoriteCredentials: CredentialItem[] = [];

// Fetch and render credentials
async function refreshUI() {
  applyTranslations();

  // Query active tab URL
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    activeUrl = activeTab && activeTab.url ? activeTab.url : '';
    
    // Query all credentials first so we can use domains for typo-squatting detection
    chrome.runtime.sendMessage(
      { action: 'list_credentials' },
      (response) => {
        if (!response || response.locked || response.error) {
          // Still check basic phishing even when locked
          const basicResult = checkPhishing(activeUrl);
          renderPhishingBanner(basicResult);

          lockedScreen.style.display = 'flex';
          credentialList.style.display = 'none';
          searchWrapper.style.display = 'none';
          allCredentials = [];
          suggestedCredentials = [];
          favoriteCredentials = [];
          return;
        }

        lockedScreen.style.display = 'none';
        credentialList.style.display = 'flex';
        searchWrapper.style.display = 'block';

        allCredentials = response.credentials || [];

        // Extract trusted domains from vault for typo-squatting comparison
        const trustedDomains: string[] = [];
        allCredentials.forEach(item => {
          if (item.url) {
            try {
              let cleanUrl = item.url.trim().toLowerCase();
              if (!/^https?:\/\//i.test(cleanUrl)) cleanUrl = 'https://' + cleanUrl;
              const parsed = new URL(cleanUrl);
              const domain = extractRegistrableDomain(parsed.hostname);
              if (domain && !trustedDomains.includes(domain)) {
                trustedDomains.push(domain);
              }
            } catch { /* skip unparseable URLs */ }
          }
        });

        // Run advanced phishing check with vault domains
        const phishingResult = checkPhishing(activeUrl, trustedDomains);
        renderPhishingBanner(phishingResult);

        // Filter suggested credentials based on active URL domain (only HTTP/HTTPS)
        if (activeUrl && (activeUrl.startsWith('http://') || activeUrl.startsWith('https://'))) {
          try {
            const parsedActive = new URL(activeUrl);
            const activeHost = parsedActive.hostname.toLowerCase().replace(/^www\./, '');

            if (activeHost) {
              suggestedCredentials = allCredentials.filter(item => {
                if (!item.url) return false;
                
                let itemHost = '';
                try {
                  let itemUrl = item.url.trim().toLowerCase();
                  if (!/^https?:\/\//i.test(itemUrl)) {
                    itemUrl = 'https://' + itemUrl;
                  }
                  const parsedItem = new URL(itemUrl);
                  itemHost = parsedItem.hostname.toLowerCase().replace(/^www\./, '');
                } catch {
                  // Fallback string extraction if parsing fails
                  itemHost = item.url.toLowerCase().trim().replace(/^www\./, '');
                }

                if (!itemHost) return false;

                // Match with PSL-aware registrable domain or hostname
                const activeRegDomain = extractRegistrableDomain(activeHost) || activeHost;
                const itemRegDomain = extractRegistrableDomain(itemHost) || itemHost;

                return activeHost === itemHost || 
                       activeHost.endsWith('.' + itemHost) || 
                       itemHost.endsWith('.' + activeHost) ||
                       (activeRegDomain && itemRegDomain && activeRegDomain === itemRegDomain);
              });
            } else {
              suggestedCredentials = [];
            }
          } catch {
            suggestedCredentials = [];
          }
        } else {
          suggestedCredentials = [];
        }

        // Filter favorite credentials
        favoriteCredentials = allCredentials.filter(item => item.favorite === true);

        // Show matching suggestions or favorites, preventing full exposure of 400+ items
        displayInitialScreen();
      }
    );
  });
}

// ─── Phishing Banner Renderer ─────────────────────────────────────────────────
function renderPhishingBanner(result: PhishingResult) {
  if (!result.isSuspicious) {
    phishingBanner.style.display = 'none';
    return;
  }

  phishingBanner.style.display = 'flex';

  // Dynamic title & description based on threat type
  let titleKey: string;
  let descKey: string;
  switch (result.threatType) {
    case 'homograph':
      titleKey = 'phishing.homograph';
      descKey = 'phishing.homograph.desc';
      break;
    case 'confusable':
      titleKey = 'phishing.confusable';
      descKey = 'phishing.confusable.desc';
      break;
    case 'typosquat':
      titleKey = 'phishing.typosquat';
      descKey = 'phishing.typosquat.desc';
      break;
    default:
      titleKey = 'phishing.warning';
      descKey = 'phishing.warning';
  }

  const titleText = translate(titleKey as any, activeLanguage);
  let descText = translate(descKey as any, activeLanguage);

  // Append matched domain for typosquat/confusable
  if (result.matchedDomain && (result.threatType === 'typosquat' || result.threatType === 'confusable')) {
    descText += ` ${result.matchedDomain}`;
  }

  // Build banner content
  phishingBanner.innerHTML = '';
  
  const iconSpan = document.createElement('span');
  iconSpan.className = 'warning-icon';
  iconSpan.textContent = result.threatType === 'homograph' ? '🛡️' : 
                          result.threatType === 'confusable' ? '🔤' :
                          result.threatType === 'typosquat' ? '🎯' : '⚠️';
  phishingBanner.appendChild(iconSpan);

  const textContainer = document.createElement('div');
  textContainer.className = 'phishing-text-container';

  const titleEl = document.createElement('div');
  titleEl.className = 'phishing-title';
  titleEl.textContent = titleText;
  textContainer.appendChild(titleEl);

  const descEl = document.createElement('div');
  descEl.className = 'phishing-desc';
  descEl.textContent = descText;
  textContainer.appendChild(descEl);

  if (result.details) {
    const detailsEl = document.createElement('div');
    detailsEl.className = 'phishing-domain';
    detailsEl.textContent = result.details;
    textContainer.appendChild(detailsEl);
  }

  phishingBanner.appendChild(textContainer);

  // Also notify the content script to show in-page warning
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'aegis_phishing_alert',
        threatType: result.threatType,
        matchedDomain: result.matchedDomain,
        details: result.details
      });
    }
  });
}

function displayInitialScreen() {
  credentialList.innerHTML = '';

  if (suggestedCredentials.length > 0) {
    // Render suggested matches header
    const header = document.createElement('div');
    header.style.fontSize = '11px';
    header.style.fontWeight = '600';
    header.style.textTransform = 'uppercase';
    header.style.color = 'var(--text-secondary)';
    header.style.letterSpacing = '0.5px';
    header.style.margin = '4px 0 10px 0';
    header.textContent = translate('section.suggested', activeLanguage);
    credentialList.appendChild(header);

    renderItemsToList(suggestedCredentials);
  } else if (favoriteCredentials.length > 0) {
    // Render favorites header
    const header = document.createElement('div');
    header.style.fontSize = '11px';
    header.style.fontWeight = '600';
    header.style.textTransform = 'uppercase';
    header.style.color = 'var(--text-secondary)';
    header.style.letterSpacing = '0.5px';
    header.style.margin = '4px 0 10px 0';
    header.textContent = translate('section.favorites', activeLanguage);
    credentialList.appendChild(header);

    // Limit to 10 favorites to keep it clean and performant
    renderItemsToList(favoriteCredentials.slice(0, 10));
  } else {
    // Search invitation placeholder
    const invite = document.createElement('div');
    invite.className = 'locked-desc';
    invite.style.padding = '40px 16px';
    invite.style.textAlign = 'center';
    invite.textContent = translate('search.invitation', activeLanguage);
    credentialList.appendChild(invite);
  }
}

// Bind Search input globally
searchInput.oninput = (e) => {
  const q = (e.target as HTMLInputElement).value.toLowerCase().trim();
  if (q === '') {
    displayInitialScreen();
  } else {
    // Search across ALL credentials in the vault
    const filtered = allCredentials.filter(item => 
      item.title.toLowerCase().includes(q) || 
      item.username.toLowerCase().includes(q) ||
      item.url.toLowerCase().includes(q)
    );
    
    credentialList.innerHTML = '';
    renderItemsToList(filtered);
  }
};

function renderItemsToList(items: CredentialItem[]) {
  if (items.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'locked-desc';
    emptyMsg.style.padding = '20px 0';
    emptyMsg.textContent = translate('no.matching', activeLanguage);
    credentialList.appendChild(emptyMsg);
    return;
  }

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'credential-item';

    const info = document.createElement('div');
    info.className = 'credential-info';
    
    const title = document.createElement('span');
    title.className = 'item-title';
    title.textContent = item.title;
    info.appendChild(title);

    const sub = document.createElement('span');
    sub.className = 'item-subtitle';
    sub.textContent = item.username || '---';
    info.appendChild(sub);

    // If it's a localhost / local dev domain
    if (activeUrl.includes('localhost') || activeUrl.includes('127.0.0.1')) {
      const devBadge = document.createElement('span');
      devBadge.className = 'dev-indicator';
      devBadge.textContent = translate('dev.localhost', activeLanguage);
      info.appendChild(devBadge);
    }

    card.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'credential-actions';

    // Autofill button — with domain validation gate (security fix Y1)
    const fillBtn = document.createElement('button');
    fillBtn.className = 'btn-fill';
    fillBtn.textContent = translate('btn.fill', activeLanguage);
    fillBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      validateAndAutofill(item);
    });
    actions.appendChild(fillBtn);

    // Copy Username icon
    const copyUserBtn = document.createElement('button');
    copyUserBtn.className = 'btn-icon';
    copyUserBtn.innerHTML = '👤';
    copyUserBtn.title = translate('item.username', activeLanguage);
    copyUserBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboardSecurely(item.username, false);
    });
    actions.appendChild(copyUserBtn);

    // Copy Password icon
    if (item.password) {
      const copyPassBtn = document.createElement('button');
      copyPassBtn.className = 'btn-icon';
      copyPassBtn.innerHTML = '🔑';
      copyPassBtn.title = translate('item.password', activeLanguage);
      copyPassBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyToClipboardSecurely(item.password || '', true);
      });
      actions.appendChild(copyPassBtn);
    }

    card.appendChild(actions);
    
    // Clicking card fills automatically — with domain validation gate (security fix Y1)
    card.addEventListener('click', () => {
      validateAndAutofill(item);
    });

    credentialList.appendChild(card);
  });
}

/**
 * Security gate: Validates that the credential's domain matches the active tab's
 * domain before allowing autofill. Prevents phishing attacks where a user manually
 * selects a credential and fills it into a malicious page. (Security fix Y1)
 */
function validateAndAutofill(item: CredentialItem): void {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    const tabUrl = activeTab?.url || '';

    // If no URL available (e.g., chrome:// pages), block autofill entirely
    if (!tabUrl || (!tabUrl.startsWith('http://') && !tabUrl.startsWith('https://'))) {
      showToast('⚠️ Autofill not available on this page.');
      return;
    }

    const tabDomain = extractRegistrableDomainFromUrl(tabUrl);
    const credDomain = item.url ? extractRegistrableDomainFromUrl(
      item.url.startsWith('http') ? item.url : `https://${item.url}`
    ) : '';

    // If credential has a matching domain → proceed directly
    if (credDomain && tabDomain === credDomain) {
      sendAutofillMessage(item);
      return;
    }

    // Domain mismatch or URL-less credential detected — show confirmation warning (R-3)
    showDomainMismatchWarning(item, tabDomain, credDomain);
  });
}

/**
 * Shows a domain mismatch warning overlay in the popup.
 * User must explicitly confirm to proceed with autofill. (Security fix Y1 / R-3)
 */
function showDomainMismatchWarning(item: CredentialItem, tabDomain: string, credDomain: string): void {
  // Remove any existing warning
  const existing = document.getElementById('domainMismatchOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'domainMismatchOverlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
  `;

  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: var(--bg-card, #1e1e2e); border-radius: 12px;
    padding: 20px; max-width: 320px; width: 100%;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    border: 1px solid var(--border, rgba(255,255,255,0.1));
  `;

  const icon = document.createElement('div');
  icon.textContent = '⚠️';
  icon.style.cssText = 'font-size: 32px; text-align: center; margin-bottom: 12px;';

  const title = document.createElement('div');
  title.textContent = translate('mismatch.title' as any, activeLanguage);
  title.style.cssText = `
    font-size: 15px; font-weight: 700; text-align: center;
    color: var(--text-primary, #fff); margin-bottom: 8px;
  `;

  const desc = document.createElement('div');
  desc.style.cssText = `
    font-size: 12px; color: var(--text-secondary, #aaa);
    text-align: center; line-height: 1.5; margin-bottom: 16px;
  `;
  const warningText = translate('mismatch.desc' as any, activeLanguage);
  const credLabel = translate('mismatch.cred' as any, activeLanguage);
  const pageLabel = translate('mismatch.page' as any, activeLanguage);

  desc.textContent = warningText;

  const detailBox = document.createElement('div');
  detailBox.style.cssText = 'margin-top: 12px; text-align: left; background: rgba(0,0,0,0.25); padding: 8px 12px; border-radius: 6px; font-size: 12px; word-break: break-all;';

  const credLine = document.createElement('div');
  const credStrong = document.createElement('strong');
  credStrong.style.color = 'var(--accent-green, #10b981)';
  credStrong.textContent = `${credLabel}: `;
  const credSpan = document.createElement('span');
  credSpan.textContent = credDomain || '(No domain configured)';
  credLine.appendChild(credStrong);
  credLine.appendChild(credSpan);

  const pageLine = document.createElement('div');
  pageLine.style.marginTop = '4px';
  const pageStrong = document.createElement('strong');
  pageStrong.style.color = 'var(--accent-red, #ef4444)';
  pageStrong.textContent = `${pageLabel}: `;
  const pageSpan = document.createElement('span');
  pageSpan.textContent = tabDomain;
  pageLine.appendChild(pageStrong);
  pageLine.appendChild(pageSpan);

  detailBox.appendChild(credLine);
  detailBox.appendChild(pageLine);
  desc.appendChild(detailBox);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display: flex; gap: 8px; margin-top: 16px;';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = translate('mismatch.cancel' as any, activeLanguage);
  cancelBtn.style.cssText = `
    flex: 1; padding: 10px; border-radius: 8px; border: 1px solid var(--border, rgba(255,255,255,0.15));
    background: transparent; color: var(--text-primary, #fff); cursor: pointer;
    font-size: 13px; font-weight: 600;
  `;
  cancelBtn.addEventListener('click', () => overlay.remove());

  const proceedBtn = document.createElement('button');
  proceedBtn.textContent = translate('mismatch.proceed' as any, activeLanguage);
  proceedBtn.style.cssText = `
    flex: 1; padding: 10px; border-radius: 8px; border: none;
    background: #ef4444; color: #fff; cursor: pointer;
    font-size: 13px; font-weight: 600;
  `;
  proceedBtn.addEventListener('click', () => {
    overlay.remove();
    sendAutofillMessage(item, true /* userConfirmedMismatch */);
  });

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(proceedBtn);
  dialog.appendChild(icon);
  dialog.appendChild(title);
  dialog.appendChild(desc);
  dialog.appendChild(btnRow);
  overlay.appendChild(dialog);

  // Click outside to cancel
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}

/**
 * Sends the autofill message to background, which forwards to the active tab's content script.
 * Includes the credential's target domain and confirmation state for background-side validation.
 */
function sendAutofillMessage(item: CredentialItem, userConfirmedMismatch = false): void {
  const credDomain = item.url ? extractRegistrableDomainFromUrl(
    item.url.startsWith('http') ? item.url : `https://${item.url}`
  ) : '';

  chrome.runtime.sendMessage(
    {
      action: 'autofill_page',
      username: item.username,
      password: item.password || '',
      targetDomain: credDomain,
      userConfirmedMismatch,
    },
    (response: { status?: string; reason?: string } | undefined) => {
      if (response && response.status === 'blocked') {
        showToast('⚠️ Autofill blocked: domain mismatch confirmation required.');
      }
    }
  );
}

// Initial load
refreshUI();
