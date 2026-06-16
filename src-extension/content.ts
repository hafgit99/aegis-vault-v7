// CSS injected dynamically for the inline overlay and icon
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
    max-height: 200px !important;
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

// Clean active dropdown on click elsewhere
document.addEventListener('click', (e) => {
  if (activeDropdown && !activeDropdown.contains(e.target as Node)) {
    closeDropdown();
  }
});

function closeDropdown() {
  if (activeDropdown) {
    activeDropdown.remove();
    activeDropdown = null;
  }
}

// Handle messages from background service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'fill_inputs') {
    fillPageCredentials(message.username, message.password);
  }
});

// Scan inputs and inject 'A' icon button
function scanAndInject() {
  const passwordInputs = document.querySelectorAll('input[type="password"]');
  passwordInputs.forEach((passInput) => {
    // Avoid double injection
    if (passInput.getAttribute('data-aegis-injected') === 'true') return;
    passInput.setAttribute('data-aegis-injected', 'true');

    // Find parent or wrap it to position the icon
    const parent = passInput.parentElement;
    if (!parent) return;

    // We can position the icon relative to the parent if parent has relative position
    // Or we apply position relative to the parent
    parent.classList.add('aegis-input-container');

    const iconBtn = document.createElement('button');
    iconBtn.className = 'aegis-icon-btn';
    iconBtn.textContent = 'A';
    iconBtn.type = 'button';
    iconBtn.title = 'Aegis Vault Auto-fill';

    iconBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // If dropdown is already open, close it
      if (activeDropdown) {
        closeDropdown();
        return;
      }

      // Fetch matching credentials from background
      chrome.runtime.sendMessage(
        { action: 'query_credentials', url: window.location.href },
        (response) => {
          showDropdown(passInput as HTMLInputElement, response);
        }
      );
    });

    parent.appendChild(iconBtn);
  });
}

function showDropdown(targetInput: HTMLInputElement, response: any) {
  closeDropdown();

  const rect = targetInput.getBoundingClientRect();
  const dropdown = document.createElement('div');
  dropdown.className = 'aegis-dropdown';
  
  // Position it below the input field
  dropdown.style.left = `${targetInput.offsetLeft}px`;
  dropdown.style.top = `${targetInput.offsetTop + targetInput.offsetHeight}px`;

  if (!response || response.locked) {
    const lockedMsg = document.createElement('div');
    lockedMsg.className = 'aegis-dropdown-locked';
    lockedMsg.textContent = 'Aegis Vault is Locked';
    dropdown.appendChild(lockedMsg);
  } else {
    const credentials = response.credentials || [];
    if (credentials.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'aegis-dropdown-locked';
      emptyMsg.textContent = 'No credentials found';
      dropdown.appendChild(emptyMsg);
    } else {
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

        option.addEventListener('click', () => {
          fillPageCredentials(item.username, item.password || '');
          closeDropdown();
        });

        dropdown.appendChild(option);
      });
    }
  }

  targetInput.parentElement?.appendChild(dropdown);
  activeDropdown = dropdown;
}

// Find login/password form fields and fill them
function fillPageCredentials(username: string, password: string) {
  const passwordInputs = document.querySelectorAll('input[type="password"]');
  if (passwordInputs.length === 0) return;

  passwordInputs.forEach((passEl) => {
    const passInput = passEl as HTMLInputElement;
    passInput.value = password;
    
    // Trigger standard input events
    passInput.dispatchEvent(new Event('input', { bubbles: true }));
    passInput.dispatchEvent(new Event('change', { bubbles: true }));

    // Try to find the username field inside the same form or adjacent to the password field
    const form = passInput.form;
    let usernameInput: HTMLInputElement | null = null;

    if (form) {
      // Find typical username inputs in the form
      usernameInput = form.querySelector('input[type="text"], input[type="email"], input[name="username"], input[name="login"]') as HTMLInputElement;
    }

    if (!usernameInput) {
      // Fallback: search adjacent text fields
      const textInputs = document.querySelectorAll('input[type="text"], input[type="email"]');
      let minDistance = Infinity;
      textInputs.forEach((textEl) => {
        const textInput = textEl as HTMLInputElement;
        if (textInput === passInput) return;
        
        // Simple distance metric based on DOM position
        const compare = passInput.compareDocumentPosition(textInput);
        if (compare & Node.DOCUMENT_POSITION_PRECEDING || compare & Node.DOCUMENT_POSITION_FOLLOWING) {
          usernameInput = textInput;
        }
      });
    }

    if (usernameInput) {
      usernameInput.value = username;
      usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
      usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

// Setup mutation observer to scan for dynamically loaded SPA fields
const observer = new MutationObserver(() => {
  scanAndInject();
});
observer.observe(document.body, { childList: true, subtree: true });

// Initial scan
scanAndInject();
