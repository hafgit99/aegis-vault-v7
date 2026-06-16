(() => {
  // src-extension/i18n.ts
  var extensionTranslations = {
    tr: {
      "locked.title": "Aegis Vault Kilitli",
      "locked.description": "Kasan\u0131z\u0131n kilidini a\xE7mak i\xE7in l\xFCtfen masa\xFCst\xFC uygulamas\u0131n\u0131 kullan\u0131n.",
      "btn.openApp": "Masa\xFCst\xFC Uygulamas\u0131n\u0131 A\xE7",
      "search.placeholder": "Kasa i\xE7inde ara...",
      "copied.feedback": "Kopyaland\u0131!",
      "no.matching": "E\u015Fle\u015Fen kay\u0131t bulunamad\u0131.",
      "dev.localhost": "Geli\u015Ftirici ortam\u0131 aktif.",
      "item.totp": "TOTP Kodu",
      "item.username": "Kullan\u0131c\u0131 Ad\u0131",
      "item.password": "\u015Eifre",
      "item.cardNumber": "Kart Numaras\u0131",
      "phishing.warning": "\u26A0\uFE0F Dikkat: Oltalama (Phishing) \u015E\xFCphesi! Alan ad\u0131n\u0131 kontrol edin.",
      "section.suggested": "E\u015Fle\u015Fen Hesaplar",
      "section.favorites": "S\u0131k Kullan\u0131lanlar (\u2605)",
      "search.invitation": "T\xFCm kasan\u0131zda aramak i\xE7in yukar\u0131daki kutuyu kullan\u0131n.",
      "section.generate": "\u{1F512} Yeni G\xFCvenli \u015Eifre \xDCret",
      "banner.saveTitle": "Yeni Kay\u0131t Alg\u0131land\u0131",
      "banner.saveDesc": "Bu sitedeki giri\u015F bilgilerini kasan\u0131za kaydetmek ister misiniz?",
      "banner.saveBtn": "Kaydet",
      "banner.dismissBtn": "Yoksay"
    },
    en: {
      "locked.title": "Aegis Vault Locked",
      "locked.description": "Please use the desktop application to unlock your vault.",
      "btn.openApp": "Open Desktop App",
      "search.placeholder": "Search vault...",
      "copied.feedback": "Copied!",
      "no.matching": "No matching records found.",
      "dev.localhost": "Developer environment active.",
      "item.totp": "TOTP Code",
      "item.username": "Username",
      "item.password": "Password",
      "item.cardNumber": "Card Number",
      "phishing.warning": "\u26A0\uFE0F Warning: Suspected Phishing! Check the domain name.",
      "section.suggested": "Suggested Accounts",
      "section.favorites": "Favorites (\u2605)",
      "search.invitation": "Use the search box above to search your entire vault.",
      "section.generate": "\u{1F512} Generate New Secure Password",
      "banner.saveTitle": "New Credential Detected",
      "banner.saveDesc": "Would you like to save these credentials to your vault?",
      "banner.saveBtn": "Save",
      "banner.dismissBtn": "Dismiss"
    },
    zh: {
      "locked.title": "Aegis Vault \u5DF2\u9501\u5B9A",
      "locked.description": "\u8BF7\u4F7F\u7528\u684C\u9762\u5E94\u7528\u89E3\u9501\u60A8\u7684\u4FDD\u9669\u5E93\u3002",
      "btn.openApp": "\u6253\u5F00\u684C\u9762\u5BA2\u6237\u7AEF",
      "search.placeholder": "\u5728\u4FDD\u7BA1\u5E93\u4E2D\u641C\u7D22...",
      "copied.feedback": "\u5DF2\u590D\u5236\uFF01",
      "no.matching": "\u672A\u627E\u5230\u5339\u914D\u7684\u8BB0\u5F55\u3002",
      "dev.localhost": "\u5F00\u53D1\u73AF\u5883\u5DF2\u6FC0\u6D3B\u3002",
      "item.totp": "\u53CC\u91CD\u8BA4\u8BC1\u7801",
      "item.username": "\u7528\u6237\u540D",
      "item.password": "\u5BC6\u7801",
      "item.cardNumber": "\u5361\u53F7",
      "phishing.warning": "\u26A0\uFE0F \u8B66\u544A\uFF1A\u7591\u4F3C\u9493\u9C7C\u7F51\u7AD9\uFF01\u8BF7\u6838\u5BF9\u57DF\u540D\u3002",
      "section.suggested": "\u63A8\u8350\u8D26\u6237",
      "section.favorites": "\u5E38\u7528\u6536\u85CF (\u2605)",
      "search.invitation": "\u4F7F\u7528\u4E0A\u65B9\u641C\u7D22\u6846\u8FDB\u884C\u5168\u5E93\u641C\u7D22\u3002",
      "section.generate": "\u{1F512} \u751F\u6210\u65B0\u7684\u5B89\u5168\u5BC6\u7801",
      "banner.saveTitle": "\u68C0\u6D4B\u5230\u65B0\u51ED\u636E",
      "banner.saveDesc": "\u60A8\u60F3\u5C06\u6B64\u767B\u5F55\u51ED\u636E\u4FDD\u5B58\u5230\u60A8\u7684\u4FDD\u9669\u5E93\u4E2D\u5417\uFF1F",
      "banner.saveBtn": "\u4FDD\u5B58",
      "banner.dismissBtn": "\u5FFD\u7565"
    }
  };
  function getPreferredLanguage() {
    const saved = localStorage.getItem("aegis-extension-language");
    if (saved && ["tr", "en", "zh"].includes(saved)) {
      return saved;
    }
    const browserLang = navigator.language.substring(0, 2);
    if (browserLang === "zh") return "zh";
    if (browserLang === "tr") return "tr";
    return "en";
  }
  function translate(key, lang) {
    const currentLang = lang || getPreferredLanguage();
    return extensionTranslations[currentLang][key] || extensionTranslations["en"][key] || key;
  }

  // src-extension/content.ts
  var activeLanguage = getPreferredLanguage();
  var inlineStyle = `
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
  var styleEl = document.createElement("style");
  styleEl.textContent = inlineStyle;
  document.head?.appendChild(styleEl);
  var activeDropdown = null;
  document.addEventListener("click", (e) => {
    if (activeDropdown && !activeDropdown.contains(e.target)) {
      closeDropdown();
    }
  });
  function closeDropdown() {
    if (activeDropdown) {
      activeDropdown.remove();
      activeDropdown = null;
    }
  }
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "fill_inputs") {
      fillPageCredentials(message.username, message.password);
    }
  });
  function scanAndInject() {
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    passwordInputs.forEach((passInput) => {
      if (passInput.getAttribute("data-aegis-injected") === "true") return;
      passInput.setAttribute("data-aegis-injected", "true");
      const parent = passInput.parentElement;
      if (!parent) return;
      parent.classList.add("aegis-input-container");
      const iconBtn = document.createElement("button");
      iconBtn.className = "aegis-icon-btn";
      iconBtn.textContent = "A";
      iconBtn.type = "button";
      iconBtn.title = "Aegis Vault Auto-fill";
      iconBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (activeDropdown) {
          closeDropdown();
          return;
        }
        chrome.runtime.sendMessage(
          { action: "query_credentials", url: window.location.href },
          (response) => {
            showDropdown(passInput, response);
          }
        );
      });
      parent.appendChild(iconBtn);
    });
  }
  function showDropdown(targetInput, response) {
    closeDropdown();
    const rect = targetInput.getBoundingClientRect();
    const dropdown = document.createElement("div");
    dropdown.className = "aegis-dropdown";
    dropdown.style.left = `${targetInput.offsetLeft}px`;
    dropdown.style.top = `${targetInput.offsetTop + targetInput.offsetHeight}px`;
    if (!response || response.locked) {
      const lockedMsg = document.createElement("div");
      lockedMsg.className = "aegis-dropdown-locked";
      lockedMsg.textContent = translate("locked.title", activeLanguage);
      dropdown.appendChild(lockedMsg);
    } else {
      const credentials = response.credentials || [];
      if (credentials.length > 0) {
        credentials.forEach((item) => {
          const option = document.createElement("div");
          option.className = "aegis-dropdown-item";
          const title = document.createElement("span");
          title.className = "aegis-dropdown-title";
          title.textContent = item.title;
          option.appendChild(title);
          const user = document.createElement("span");
          user.className = "aegis-dropdown-user";
          user.textContent = item.username || "---";
          option.appendChild(user);
          option.addEventListener("click", () => {
            fillPageCredentials(item.username, item.password || "");
            closeDropdown();
          });
          dropdown.appendChild(option);
        });
      } else {
        const emptyMsg = document.createElement("div");
        emptyMsg.className = "aegis-dropdown-locked";
        emptyMsg.textContent = translate("no.matching", activeLanguage);
        dropdown.appendChild(emptyMsg);
      }
    }
    const genDivider = document.createElement("div");
    genDivider.style.borderTop = "1px solid rgba(255, 255, 255, 0.08)";
    genDivider.style.margin = "4px 0";
    dropdown.appendChild(genDivider);
    const genOption = document.createElement("div");
    genOption.className = "aegis-dropdown-item";
    genOption.style.background = "rgba(16, 185, 129, 0.1)";
    genOption.style.border = "1px dashed rgba(16, 185, 129, 0.3)";
    genOption.style.marginTop = "4px";
    const genTitle = document.createElement("span");
    genTitle.className = "aegis-dropdown-title";
    genTitle.style.color = "#10b981";
    genTitle.style.fontWeight = "bold";
    genTitle.style.display = "flex";
    genTitle.style.alignItems = "center";
    genTitle.style.gap = "4px";
    genTitle.textContent = translate("section.generate", activeLanguage);
    genOption.appendChild(genTitle);
    genOption.addEventListener("click", (e) => {
      e.stopPropagation();
      const generated = generateSecurePassword(18);
      targetInput.value = generated;
      targetInput.dispatchEvent(new Event("input", { bubbles: true }));
      targetInput.dispatchEvent(new Event("change", { bubbles: true }));
      navigator.clipboard.writeText(generated);
      const form = targetInput.form;
      if (form) {
        const otherPasswords = form.querySelectorAll('input[type="password"]');
        otherPasswords.forEach((pwEl) => {
          if (pwEl !== targetInput) {
            pwEl.value = generated;
            pwEl.dispatchEvent(new Event("input", { bubbles: true }));
            pwEl.dispatchEvent(new Event("change", { bubbles: true }));
          }
        });
      }
      closeDropdown();
    });
    dropdown.appendChild(genOption);
    targetInput.parentElement?.appendChild(dropdown);
    activeDropdown = dropdown;
  }
  function fillPageCredentials(username, password) {
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    if (passwordInputs.length === 0) return;
    passwordInputs.forEach((passEl) => {
      const passInput = passEl;
      passInput.value = password;
      passInput.dispatchEvent(new Event("input", { bubbles: true }));
      passInput.dispatchEvent(new Event("change", { bubbles: true }));
      const form = passInput.form;
      let usernameInput = null;
      if (form) {
        usernameInput = form.querySelector('input[type="text"], input[type="email"], input[name="username"], input[name="login"]');
      }
      if (!usernameInput) {
        const textInputs = document.querySelectorAll('input[type="text"], input[type="email"]');
        let minDistance = Infinity;
        textInputs.forEach((textEl) => {
          const textInput = textEl;
          if (textInput === passInput) return;
          const compare = passInput.compareDocumentPosition(textInput);
          if (compare & Node.DOCUMENT_POSITION_PRECEDING || compare & Node.DOCUMENT_POSITION_FOLLOWING) {
            usernameInput = textInput;
          }
        });
      }
      if (usernameInput) {
        usernameInput.value = username;
        usernameInput.dispatchEvent(new Event("input", { bubbles: true }));
        usernameInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }
  function generateSecurePassword(length = 16) {
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";
    const symbols = "!@#$%^&*()-_=+[]{}|;:,.<>?";
    const allChars = lowercase + uppercase + numbers + symbols;
    let password = "";
    const randomBytes = new Uint32Array(length);
    crypto.getRandomValues(randomBytes);
    password += lowercase[randomBytes[0] % lowercase.length];
    password += uppercase[randomBytes[1] % uppercase.length];
    password += numbers[randomBytes[2] % numbers.length];
    password += symbols[randomBytes[3] % symbols.length];
    for (let i = 4; i < length; i++) {
      password += allChars[randomBytes[i] % allChars.length];
    }
    return password.split("").sort(() => 0.5 - Math.random()).join("");
  }
  function showSavePromptBanner(cred) {
    if (document.querySelector(".aegis-banner")) return;
    const banner = document.createElement("div");
    banner.className = "aegis-banner";
    const info = document.createElement("div");
    info.className = "aegis-banner-info";
    const logo = document.createElement("div");
    logo.className = "aegis-banner-logo";
    logo.textContent = "A";
    const text = document.createElement("div");
    text.className = "aegis-banner-text";
    const title = document.createElement("span");
    title.className = "aegis-banner-title";
    title.textContent = translate("banner.saveTitle", activeLanguage);
    const desc = document.createElement("span");
    desc.className = "aegis-banner-desc";
    desc.textContent = translate("banner.saveDesc", activeLanguage) + (cred.username ? ` (${cred.username})` : "");
    text.appendChild(title);
    text.appendChild(desc);
    info.appendChild(logo);
    info.appendChild(text);
    const actions = document.createElement("div");
    actions.className = "aegis-banner-actions";
    const saveBtn = document.createElement("button");
    saveBtn.className = "aegis-banner-btn aegis-banner-btn-save";
    saveBtn.textContent = translate("banner.saveBtn", activeLanguage);
    saveBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({
        action: "save_new_credential",
        credential: cred
      }, () => {
        banner.classList.remove("show");
        setTimeout(() => banner.remove(), 400);
      });
    });
    const dismissBtn = document.createElement("button");
    dismissBtn.className = "aegis-banner-btn aegis-banner-btn-dismiss";
    dismissBtn.textContent = translate("banner.dismissBtn", activeLanguage);
    dismissBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "clear_pending_credential" }, () => {
        banner.classList.remove("show");
        setTimeout(() => banner.remove(), 400);
      });
    });
    actions.appendChild(saveBtn);
    actions.appendChild(dismissBtn);
    banner.appendChild(info);
    banner.appendChild(actions);
    document.body.appendChild(banner);
    setTimeout(() => {
      banner.classList.add("show");
    }, 200);
  }
  function updateDraftCredential(inputEl) {
    const form = inputEl.form || inputEl.closest("form") || inputEl.closest("div");
    if (!form) return;
    const passwordInput = form.querySelector('input[type="password"]');
    if (!passwordInput || !passwordInput.value) return;
    const usernameInput = form.querySelector('input[type="text"], input[type="email"], input[name="username"], input[name="login"]');
    const username = usernameInput ? usernameInput.value.trim() : "";
    const password = passwordInput.value;
    if (password.length < 4) return;
    chrome.runtime.sendMessage({
      action: "update_draft_credential",
      credential: {
        title: document.title || window.location.hostname,
        username,
        password,
        url: window.location.href
      }
    });
  }
  function handleFormSubmit(form) {
    const passwordInput = form.querySelector('input[type="password"]');
    if (!passwordInput || !passwordInput.value) return;
    const usernameInput = form.querySelector('input[type="text"], input[type="email"], input[name="username"], input[name="login"]');
    const username = usernameInput ? usernameInput.value.trim() : "";
    const password = passwordInput.value;
    if (password.length < 4) return;
    chrome.runtime.sendMessage({
      action: "set_pending_credential",
      credential: {
        title: document.title || window.location.hostname,
        username,
        password,
        url: window.location.href
      }
    });
  }
  document.addEventListener("blur", (e) => {
    const target = e.target;
    if (target && target.tagName === "INPUT" && (target.type === "password" || target.type === "text" || target.type === "email")) {
      updateDraftCredential(target);
    }
  }, true);
  document.addEventListener("change", (e) => {
    const target = e.target;
    if (target && target.tagName === "INPUT" && (target.type === "password" || target.type === "text" || target.type === "email")) {
      updateDraftCredential(target);
    }
  }, true);
  document.addEventListener("submit", (e) => {
    handleFormSubmit(e.target);
  }, true);
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (target && (target.tagName === "BUTTON" || target.tagName === "INPUT")) {
      const type = target.getAttribute("type");
      const isSubmit = type === "submit" || target.innerText?.toLowerCase().includes("giri\u015F") || target.innerText?.toLowerCase().includes("login") || target.innerText?.toLowerCase().includes("kaydet") || target.innerText?.toLowerCase().includes("save") || target.innerText?.toLowerCase().includes("register") || target.innerText?.toLowerCase().includes("sign");
      if (isSubmit) {
        const form = target.closest("form") || target.closest("div");
        if (form) {
          handleFormSubmit(form);
        }
      }
    }
  }, true);
  setTimeout(() => {
    chrome.runtime.sendMessage({ action: "get_pending_credential" }, (response) => {
      if (response && response.credential) {
        const cred = response.credential;
        try {
          const credDomain = new URL(cred.url).hostname.replace("www.", "").toLowerCase();
          const currentDomain = window.location.hostname.replace("www.", "").toLowerCase();
          if (credDomain === currentDomain) {
            chrome.runtime.sendMessage(
              { action: "query_credentials", url: window.location.href },
              (dbResponse) => {
                const exists = dbResponse && dbResponse.credentials && dbResponse.credentials.some((item) => {
                  return item.username === cred.username && item.password === cred.password;
                });
                if (!exists) {
                  showSavePromptBanner(cred);
                } else {
                  chrome.runtime.sendMessage({ action: "clear_pending_credential" });
                }
              }
            );
          }
        } catch (e) {
          console.warn("Pending credentials verification failed:", e);
        }
      }
    });
  }, 800);
  var observer = new MutationObserver(() => {
    scanAndInject();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  scanAndInject();
})();
//# sourceMappingURL=content.js.map
