// Popup script: runs when the user clicks the extension icon.
// For v0.2.0 just reflects status and version. Cost estimator,
// optimize, and compress buttons land in later v0.2.x releases.

const VERSION = "0.0.1";

function setStatus(text: string) {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

function setVersion(text: string) {
  const el = document.getElementById("version");
  if (el) el.textContent = text;
}

async function init() {
  setVersion(`v${VERSION}`);

  try {
    const response = await chrome.runtime.sendMessage({ type: "ping" });
    if (response?.ok) {
      setStatus(`Active. Background worker v${response.version} is alive.`);
    } else {
      setStatus("Active. Background worker did not respond.");
    }
  } catch {
    setStatus("Active.");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export {};
