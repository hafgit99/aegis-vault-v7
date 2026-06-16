(() => {
  // src-extension/background.ts
  var HOST_NAME = "com.hafgit99.aegisvault7";
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "query_credentials") {
      const url = request.url || "";
      chrome.runtime.sendNativeMessage(
        HOST_NAME,
        { action: "get_credentials", url },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn("Native messaging error:", chrome.runtime.lastError.message);
            sendResponse({ locked: true, credentials: [], error: chrome.runtime.lastError.message });
          } else {
            sendResponse(response);
          }
        }
      );
      return true;
    }
    if (request.action === "list_credentials") {
      chrome.runtime.sendNativeMessage(
        HOST_NAME,
        { action: "list_credentials" },
        (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ locked: true, credentials: [], error: chrome.runtime.lastError.message });
          } else {
            sendResponse(response);
          }
        }
      );
      return true;
    }
    if (request.action === "is_locked") {
      chrome.runtime.sendNativeMessage(
        HOST_NAME,
        { action: "is_locked" },
        (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ locked: true, error: chrome.runtime.lastError.message });
          } else {
            sendResponse(response);
          }
        }
      );
      return true;
    }
    if (request.action === "focus_window") {
      chrome.runtime.sendNativeMessage(
        HOST_NAME,
        { action: "focus_window" },
        (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: chrome.runtime.lastError.message });
          } else {
            sendResponse(response);
          }
        }
      );
      return true;
    }
    if (request.action === "autofill_page") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (activeTab && activeTab.id) {
          chrome.tabs.sendMessage(activeTab.id, {
            action: "fill_inputs",
            username: request.username,
            password: request.password
          });
        }
      });
      sendResponse({ status: "ok" });
      return false;
    }
  });
})();
//# sourceMappingURL=background.js.map
