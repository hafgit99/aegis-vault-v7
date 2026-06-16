const HOST_NAME = 'com.hafgit99.aegisvault7';

interface NativeRequest {
  action: string;
  url?: string;
}

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'query_credentials') {
    const url = request.url || '';
    
    // Send message to native messaging host
    chrome.runtime.sendNativeMessage(
      HOST_NAME,
      { action: 'get_credentials', url: url } as NativeRequest,
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn('Native messaging error:', chrome.runtime.lastError.message);
          sendResponse({ locked: true, credentials: [], error: chrome.runtime.lastError.message });
        } else {
          sendResponse(response);
        }
      }
    );
    return true; // Keep message channel open for async response
  }

  if (request.action === 'list_credentials') {
    chrome.runtime.sendNativeMessage(
      HOST_NAME,
      { action: 'list_credentials' } as NativeRequest,
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

  if (request.action === 'is_locked') {
    chrome.runtime.sendNativeMessage(
      HOST_NAME,
      { action: 'is_locked' } as NativeRequest,
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

  if (request.action === 'autofill_page') {
    // Forward autofill request to the active tab's content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab && activeTab.id) {
        chrome.tabs.sendMessage(activeTab.id, {
          action: 'fill_inputs',
          username: request.username,
          password: request.password
        });
      }
    });
    sendResponse({ status: 'ok' });
    return false;
  }
});
