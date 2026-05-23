// Background service worker. Runs in the extension's own context.
// For v0.2.0 this is a lifecycle stub. Future versions handle:
//   - aggregating scan stats across tabs
//   - storing user-customized patterns via chrome.storage
//   - routing messages between content scripts and the popup

const VERSION = "0.0.2";

chrome.runtime.onInstalled.addListener((details) => {
  console.log(
    `[PromptGuard v${VERSION}] installed. Reason: ${details.reason}.`,
  );
});

// Placeholder message handler so the popup can ask the worker for status later.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "ping") {
    sendResponse({ ok: true, version: VERSION });
    return true;
  }
  return false;
});

export {};
