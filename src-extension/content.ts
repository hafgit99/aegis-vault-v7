import { translate, getPreferredLanguage } from './i18n';

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
`;

// Inject Styles
const styleEl = document.createElement('style');
styleEl.textContent = inlineStyle;
document.head?.appendChild(styleEl);

// Keep track of active dropdown
let activeDropdown: HTMLDivElement | null = null;
let activeTargetInput: HTMLInputElement | null = null;
let lastFilledCredential: { username: string; password: string; timestamp: number } | null = null;

// Clean active dropdown on click elsewhere
document.addEventListener('click', (e) => {
  if (activeDropdown && !activeDropdown.contains(e.target as Node) && e.target !== activeTargetInput) {
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
    const activeEl = document.activeElement as HTMLInputElement;
    const target = (activeEl && isLoginInput(activeEl)) ? activeEl : (document.querySelector('input[type="password"], input[type="email"], input[type="text"]') as HTMLInputElement);
    if (target) {
      fillPageCredentials(target, message.username, message.password);
    }
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
  if (Date.now() - lastFilledCredential.timestamp > 60000) {
    lastFilledCredential = null;
    return;
  }
  
  const passwordInputs = document.querySelectorAll('input[type="password"]');
  passwordInputs.forEach((passEl) => {
    const passInput = passEl as HTMLInputElement;
    if (passInput && !passInput.value && isElementVisible(passInput)) {
      passInput.value = lastFilledCredential!.password;
      passInput.dispatchEvent(new Event('input', { bubbles: true }));
      passInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      lastFilledCredential = null;
      triggerAutoSubmitIfEnabled(passInput);
    }
  });
}

// Scan inputs and inject 'A' icon button
function scanAndInject() {
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
  
  // Set floating styles and absolute coordinates relative to the page viewport bounds
  dropdown.style.position = 'absolute';
  dropdown.style.left = `${rect.left + window.scrollX}px`;
  dropdown.style.top = `${rect.bottom + window.scrollY + 4}px`;
  dropdown.style.width = `${Math.max(240, Math.min(360, rect.width))}px`;

  window.addEventListener('scroll', closeDropdown, { passive: true });
  window.addEventListener('resize', closeDropdown, { passive: true });

  if (!response || response.locked) {
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

  genOption.addEventListener('click', (e) => {
    e.stopPropagation();
    const generated = generateSecurePassword(18);
    
    targetInput.value = generated;
    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
    targetInput.dispatchEvent(new Event('change', { bubbles: true }));

    navigator.clipboard.writeText(generated);

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

  document.body.appendChild(dropdown);
  activeDropdown = dropdown;
}

// Find login/password form fields and fill them
function fillPageCredentials(activeInput: HTMLInputElement, username: string, password: string) {
  lastFilledCredential = { username, password, timestamp: Date.now() };

  const fillInput = (el: HTMLInputElement, val: string) => {
    el.value = val;
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
    
    triggerAutoSubmitIfEnabled(activeInput);
  } else {
    fillInput(activeInput, username);
    
    const form = activeInput.form || activeInput.closest('form');
    let passwordInput: HTMLInputElement | null = null;
    if (form) {
      passwordInput = form.querySelector('input[type="password"]') as HTMLInputElement;
    }
    if (!passwordInput && passwordInputs.length > 0) {
      passwordInput = passwordInputs[0];
    }
    
    if (passwordInput) {
      fillInput(passwordInput, password);
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
  } while (sample[0] >= limit);

  return sample[0] % maxExclusive;
}

function chooseSecureChar(charset: string): string {
  return charset[secureRandomIndex(charset.length)];
}

function secureShuffle(chars: string[]): string[] {
  for (let index = chars.length - 1; index > 0; index--) {
    const swapIndex = secureRandomIndex(index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
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

// Show premium glassmorphic top prompt banner
function showSavePromptBanner(cred: any) {
  // Check if banner already exists
  if (document.querySelector('.aegis-banner')) return;

  const banner = document.createElement('div');
  banner.className = 'aegis-banner';
  
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
  
  document.body.appendChild(banner);
  
  // Animation delay
  setTimeout(() => {
    banner.classList.add('show');
  }, 200);
}

// Update draft credential in background script as user types/blurs
function updateDraftCredential(inputEl: HTMLInputElement) {
  const form = inputEl.form || inputEl.closest('form') || inputEl.closest('div');
  if (!form) return;

  const passwordInput = form.querySelector('input[type="password"]') as HTMLInputElement;
  if (!passwordInput || !passwordInput.value) return;

  const usernameInput = form.querySelector('input[type="text"], input[type="email"], input[name="username"], input[name="login"]') as HTMLInputElement;
  const username = usernameInput ? usernameInput.value.trim() : '';
  const password = passwordInput.value;

  if (password.length < 4) return;

  chrome.runtime.sendMessage({
    action: 'update_draft_credential',
    credential: {
      title: document.title || window.location.hostname,
      username: username,
      password: password,
      url: window.location.href
    }
  });
}

// Intercept form submissions
function handleFormSubmit(form: HTMLElement) {
  const passwordInput = form.querySelector('input[type="password"]') as HTMLInputElement;
  if (!passwordInput || !passwordInput.value) return;

  const usernameInput = form.querySelector('input[type="text"], input[type="email"], input[name="username"], input[name="login"]') as HTMLInputElement;
  const username = usernameInput ? usernameInput.value.trim() : '';
  const password = passwordInput.value;

  if (password.length < 4) return;

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
  handleFormSubmit(e.target as HTMLFormElement);
}, true);

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target && (target.tagName === 'BUTTON' || target.tagName === 'INPUT')) {
    const type = target.getAttribute('type');
    const isSubmit = type === 'submit' || 
                     target.innerText?.toLowerCase().includes('giriş') ||
                     target.innerText?.toLowerCase().includes('login') ||
                     target.innerText?.toLowerCase().includes('kaydet') ||
                     target.innerText?.toLowerCase().includes('save') ||
                     target.innerText?.toLowerCase().includes('register') ||
                     target.innerText?.toLowerCase().includes('sign');
    if (isSubmit) {
      const form = target.closest('form') || target.closest('div');
      if (form) {
        handleFormSubmit(form as HTMLElement);
      }
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
const observer = new MutationObserver(() => {
  scanAndInject();
});
observer.observe(document.body, { 
  childList: true, 
  subtree: true,
  attributes: true,
  attributeFilter: ['class', 'style', 'hidden', 'type']
});

// Initial scan
scanAndInject();
