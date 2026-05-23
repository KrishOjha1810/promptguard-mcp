// Content script: runs in the page context of claude.ai and chatgpt.com.
// For v0.2.0 this is intentionally minimal. Real DOM detection of the prompt
// textarea and inline scanning arrive in v0.2.1.

const VERSION = "0.0.1";

function init() {
  const host = window.location.hostname;
  // Log only once per page, behind a marker so multiple injections do not stack.
  if ((window as unknown as { __promptguardLoaded?: boolean }).__promptguardLoaded) return;
  (window as unknown as { __promptguardLoaded?: boolean }).__promptguardLoaded = true;
  console.log(
    `[PromptGuard v${VERSION}] loaded on ${host}. Detection arrives in v0.2.1.`,
  );
}

init();

export {};
