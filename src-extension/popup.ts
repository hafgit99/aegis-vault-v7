import { translate, getPreferredLanguage, savePreferredLanguage, ExtensionLanguage } from './i18n';

// Interfaces for response credentials
interface CredentialItem {
  id: string;
  title: string;
  username: string;
  password?: string;
  url: string;
  category: string;
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
function showToast(messageKey: 'copied.feedback') {
  toast.textContent = translate(messageKey, activeLanguage);
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 1500);
}

// Translate page static elements
function applyTranslations() {
  lockedTitle.textContent = translate('locked.title', activeLanguage);
  lockedDesc.textContent = translate('locked.description', activeLanguage);
  focusAppBtn.textContent = translate('btn.openApp', activeLanguage);
  searchInput.placeholder = translate('search.placeholder', activeLanguage);
  phishingText.textContent = translate('phishing.warning', activeLanguage);
}

// Homograph Phishing detection
function checkPhishing(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    // Check if Punycode
    if (hostname.includes('xn--')) {
      return true;
    }
    // Check for non-ASCII characters in host
    const asciiRegex = /^[\x00-\x7F]*$/;
    if (!asciiRegex.test(hostname)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Fetch and render credentials
async function refreshUI() {
  applyTranslations();

  // Query active tab URL
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (activeTab && activeTab.url) {
      activeUrl = activeTab.url;
      
      // Check homograph phishing
      if (checkPhishing(activeUrl)) {
        phishingBanner.style.display = 'flex';
      } else {
        phishingBanner.style.display = 'none';
      }

      // Query database
      chrome.runtime.sendMessage(
        { action: 'query_credentials', url: activeUrl },
        (response) => {
          renderList(response);
        }
      );
    } else {
      // Default fallback (no active tab URL)
      chrome.runtime.sendMessage(
        { action: 'list_credentials' },
        (response) => {
          renderList(response);
        }
      );
    }
  });
}

function renderList(response: any) {
  if (!response || response.locked) {
    lockedScreen.style.display = 'flex';
    credentialList.style.display = 'none';
    searchWrapper.style.display = 'none';
    return;
  }

  lockedScreen.style.display = 'none';
  credentialList.style.display = 'flex';
  searchWrapper.style.display = 'block';

  const items: CredentialItem[] = response.credentials || [];
  displayCredentials(items);

  // Bind Search input
  searchInput.oninput = (e) => {
    const q = (e.target as HTMLInputElement).value.toLowerCase();
    const filtered = items.filter(item => 
      item.title.toLowerCase().includes(q) || 
      item.username.toLowerCase().includes(q) ||
      item.url.toLowerCase().includes(q)
    );
    displayCredentials(filtered);
  };
}

function displayCredentials(items: CredentialItem[]) {
  credentialList.innerHTML = '';
  
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

    // Autofill button
    const fillBtn = document.createElement('button');
    fillBtn.className = 'btn-fill';
    fillBtn.textContent = activeLanguage === 'tr' ? 'Doldur' : activeLanguage === 'zh' ? '自动填充' : 'Fill';
    fillBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({
        action: 'autofill_page',
        username: item.username,
        password: item.password || ''
      });
    });
    actions.appendChild(fillBtn);

    // Copy Username icon
    const copyUserBtn = document.createElement('button');
    copyUserBtn.className = 'btn-icon';
    copyUserBtn.innerHTML = '👤';
    copyUserBtn.title = translate('item.username', activeLanguage);
    copyUserBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(item.username);
      showToast('copied.feedback');
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
        navigator.clipboard.writeText(item.password || '');
        showToast('copied.feedback');
      });
      actions.appendChild(copyPassBtn);
    }

    card.appendChild(actions);
    
    // Clicking card fills automatically
    card.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        action: 'autofill_page',
        username: item.username,
        password: item.password || ''
      });
    });

    credentialList.appendChild(card);
  });
}

// Initial load
refreshUI();
