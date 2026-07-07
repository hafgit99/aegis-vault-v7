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
      "banner.dismissBtn": "Yoksay",
      "settings.autoSubmit": "Otomatik G\xF6nder"
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
      "banner.dismissBtn": "Dismiss",
      "settings.autoSubmit": "Auto-Submit"
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
      "banner.dismissBtn": "\u5FFD\u7565",
      "settings.autoSubmit": "\u81EA\u52A8\u63D0\u4EA4"
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
  function savePreferredLanguage(lang) {
    localStorage.setItem("aegis-extension-language", lang);
  }
  function translate(key, lang) {
    const currentLang = lang || getPreferredLanguage();
    return extensionTranslations[currentLang][key] || extensionTranslations["en"][key] || key;
  }

  // src-extension/popup.ts
  var activeLanguage = getPreferredLanguage();
  var activeUrl = "";
  var lockedScreen = document.getElementById("lockedScreen");
  var credentialList = document.getElementById("credentialList");
  var searchWrapper = document.getElementById("searchWrapper");
  var searchInput = document.getElementById("searchInput");
  var phishingBanner = document.getElementById("phishingBanner");
  var phishingText = document.getElementById("phishingText");
  var langSelect = document.getElementById("langSelect");
  var themeToggle = document.getElementById("themeToggle");
  var toast = document.getElementById("toast");
  var focusAppBtn = document.getElementById("focusAppBtn");
  var autoSubmitToggle = document.getElementById("autoSubmitToggle");
  var autoSubmitLabel = document.getElementById("autoSubmitLabel");
  chrome.storage.local.get(["autoSubmit"], (res) => {
    autoSubmitToggle.checked = res.autoSubmit === true;
  });
  autoSubmitToggle.addEventListener("change", (e) => {
    chrome.storage.local.set({ autoSubmit: e.target.checked });
  });
  var lockedTitle = document.getElementById("lockedTitle");
  var lockedDesc = document.getElementById("lockedDesc");
  langSelect.value = activeLanguage;
  langSelect.addEventListener("change", (e) => {
    activeLanguage = e.target.value;
    savePreferredLanguage(activeLanguage);
    applyTranslations();
    refreshUI();
  });
  focusAppBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "focus_window" });
  });
  var currentTheme = localStorage.getItem("aegis-extension-theme") || "dark";
  document.body.className = currentTheme;
  themeToggle.textContent = currentTheme === "dark" ? "\u2600\uFE0F" : "\u{1F319}";
  themeToggle.addEventListener("click", () => {
    const newTheme = document.body.className === "dark" ? "light" : "dark";
    document.body.className = newTheme;
    localStorage.setItem("aegis-extension-theme", newTheme);
    themeToggle.textContent = newTheme === "dark" ? "\u2600\uFE0F" : "\u{1F319}";
  });
  function showToast(messageKey) {
    toast.textContent = translate(messageKey, activeLanguage);
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, 1500);
  }
  function applyTranslations() {
    lockedTitle.textContent = translate("locked.title", activeLanguage);
    lockedDesc.textContent = translate("locked.description", activeLanguage);
    focusAppBtn.textContent = translate("btn.openApp", activeLanguage);
    searchInput.placeholder = translate("search.placeholder", activeLanguage);
    phishingText.textContent = translate("phishing.warning", activeLanguage);
    autoSubmitLabel.title = translate("settings.autoSubmit", activeLanguage);
  }
  function checkPhishing(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname;
      if (hostname.includes("xn--")) {
        return true;
      }
      const asciiRegex = /^[\x00-\x7F]*$/;
      if (!asciiRegex.test(hostname)) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
  var allCredentials = [];
  var suggestedCredentials = [];
  var favoriteCredentials = [];
  async function refreshUI() {
    applyTranslations();
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      activeUrl = activeTab && activeTab.url ? activeTab.url : "";
      if (activeUrl && checkPhishing(activeUrl)) {
        phishingBanner.style.display = "flex";
      } else {
        phishingBanner.style.display = "none";
      }
      chrome.runtime.sendMessage(
        { action: "list_credentials" },
        (response) => {
          if (!response || response.locked || response.error) {
            lockedScreen.style.display = "flex";
            credentialList.style.display = "none";
            searchWrapper.style.display = "none";
            allCredentials = [];
            suggestedCredentials = [];
            favoriteCredentials = [];
            return;
          }
          lockedScreen.style.display = "none";
          credentialList.style.display = "flex";
          searchWrapper.style.display = "block";
          allCredentials = response.credentials || [];
          if (activeUrl && (activeUrl.startsWith("http://") || activeUrl.startsWith("https://"))) {
            try {
              const parsedActive = new URL(activeUrl);
              const activeHost = parsedActive.hostname.toLowerCase().replace(/^www\./, "");
              if (activeHost) {
                suggestedCredentials = allCredentials.filter((item) => {
                  if (!item.url) return false;
                  let itemHost = "";
                  try {
                    let itemUrl = item.url.trim().toLowerCase();
                    if (!/^https?:\/\//i.test(itemUrl)) {
                      itemUrl = "https://" + itemUrl;
                    }
                    const parsedItem = new URL(itemUrl);
                    itemHost = parsedItem.hostname.toLowerCase().replace(/^www\./, "");
                  } catch {
                    itemHost = item.url.toLowerCase().trim().replace(/^www\./, "");
                  }
                  if (!itemHost) return false;
                  return activeHost === itemHost || activeHost.endsWith("." + itemHost) || itemHost.endsWith("." + activeHost);
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
          favoriteCredentials = allCredentials.filter((item) => item.favorite === true);
          displayInitialScreen();
        }
      );
    });
  }
  function displayInitialScreen() {
    credentialList.innerHTML = "";
    if (suggestedCredentials.length > 0) {
      const header = document.createElement("div");
      header.style.fontSize = "11px";
      header.style.fontWeight = "600";
      header.style.textTransform = "uppercase";
      header.style.color = "var(--text-secondary)";
      header.style.letterSpacing = "0.5px";
      header.style.margin = "4px 0 10px 0";
      header.textContent = translate("section.suggested", activeLanguage);
      credentialList.appendChild(header);
      renderItemsToList(suggestedCredentials);
    } else if (favoriteCredentials.length > 0) {
      const header = document.createElement("div");
      header.style.fontSize = "11px";
      header.style.fontWeight = "600";
      header.style.textTransform = "uppercase";
      header.style.color = "var(--text-secondary)";
      header.style.letterSpacing = "0.5px";
      header.style.margin = "4px 0 10px 0";
      header.textContent = translate("section.favorites", activeLanguage);
      credentialList.appendChild(header);
      renderItemsToList(favoriteCredentials.slice(0, 10));
    } else {
      const invite = document.createElement("div");
      invite.className = "locked-desc";
      invite.style.padding = "40px 16px";
      invite.style.textAlign = "center";
      invite.textContent = translate("search.invitation", activeLanguage);
      credentialList.appendChild(invite);
    }
  }
  searchInput.oninput = (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (q === "") {
      displayInitialScreen();
    } else {
      const filtered = allCredentials.filter(
        (item) => item.title.toLowerCase().includes(q) || item.username.toLowerCase().includes(q) || item.url.toLowerCase().includes(q)
      );
      credentialList.innerHTML = "";
      renderItemsToList(filtered);
    }
  };
  function renderItemsToList(items) {
    if (items.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "locked-desc";
      emptyMsg.style.padding = "20px 0";
      emptyMsg.textContent = translate("no.matching", activeLanguage);
      credentialList.appendChild(emptyMsg);
      return;
    }
    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "credential-item";
      const info = document.createElement("div");
      info.className = "credential-info";
      const title = document.createElement("span");
      title.className = "item-title";
      title.textContent = item.title;
      info.appendChild(title);
      const sub = document.createElement("span");
      sub.className = "item-subtitle";
      sub.textContent = item.username || "---";
      info.appendChild(sub);
      if (activeUrl.includes("localhost") || activeUrl.includes("127.0.0.1")) {
        const devBadge = document.createElement("span");
        devBadge.className = "dev-indicator";
        devBadge.textContent = translate("dev.localhost", activeLanguage);
        info.appendChild(devBadge);
      }
      card.appendChild(info);
      const actions = document.createElement("div");
      actions.className = "credential-actions";
      const fillBtn = document.createElement("button");
      fillBtn.className = "btn-fill";
      fillBtn.textContent = activeLanguage === "tr" ? "Doldur" : activeLanguage === "zh" ? "\u81EA\u52A8\u586B\u5145" : "Fill";
      fillBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage({
          action: "autofill_page",
          username: item.username,
          password: item.password || ""
        });
      });
      actions.appendChild(fillBtn);
      const copyUserBtn = document.createElement("button");
      copyUserBtn.className = "btn-icon";
      copyUserBtn.innerHTML = "\u{1F464}";
      copyUserBtn.title = translate("item.username", activeLanguage);
      copyUserBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(item.username);
        showToast("copied.feedback");
      });
      actions.appendChild(copyUserBtn);
      if (item.password) {
        const copyPassBtn = document.createElement("button");
        copyPassBtn.className = "btn-icon";
        copyPassBtn.innerHTML = "\u{1F511}";
        copyPassBtn.title = translate("item.password", activeLanguage);
        copyPassBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(item.password || "");
          showToast("copied.feedback");
        });
        actions.appendChild(copyPassBtn);
      }
      card.appendChild(actions);
      card.addEventListener("click", () => {
        chrome.runtime.sendMessage({
          action: "autofill_page",
          username: item.username,
          password: item.password || ""
        });
      });
      credentialList.appendChild(card);
    });
  }
  refreshUI();
})();
//# sourceMappingURL=popup.js.map
