import { scanText } from "../../src/detectors/secrets.js";
import type { Finding } from "../../src/types.js";
import { PromptGuardOverlay } from "./overlay.js";

const VERSION = "0.0.5";
const SCAN_DEBOUNCE_MS = 300;

interface PromptGuardWindow extends Window {
  __promptguardLoaded?: boolean;
}

interface PromptGuardElement extends HTMLElement {
  __promptguardAttached?: boolean;
}

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getArea(el: Element): number {
  const rect = el.getBoundingClientRect();
  return rect.width * rect.height;
}

function findPromptInput(): HTMLElement | null {
  const candidates: { el: HTMLElement; area: number }[] = [];

  document.querySelectorAll("textarea").forEach((el) => {
    if (isVisible(el)) candidates.push({ el, area: getArea(el) });
  });

  document.querySelectorAll('[contenteditable="true"]').forEach((el) => {
    if (el instanceof HTMLElement && isVisible(el)) {
      candidates.push({ el, area: getArea(el) });
    }
  });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.area - a.area);
  return candidates[0].el;
}

function getText(el: HTMLElement): string {
  if (el instanceof HTMLTextAreaElement) return el.value;
  return el.textContent ?? "";
}

/**
 * Replace the text content of a prompt input in a way that the host site's
 * framework (React on Claude, ProseMirror on Claude/ChatGPT) actually picks up.
 *
 * For textareas: set value and dispatch input event.
 *
 * For contenteditable (ProseMirror, TipTap, etc.): focus the element, select
 * all of its contents, then use execCommand insertText to replace. execCommand
 * is deprecated but it is still the most reliable cross-editor way to
 * simulate "the user typed this text" because it dispatches the full chain of
 * beforeinput + input events that editors expect.
 */
function setInputText(el: HTMLElement, newText: string) {
  if (el instanceof HTMLTextAreaElement) {
    el.value = newText;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  el.focus();
  const sel = window.getSelection();
  if (!sel) return;

  const range = document.createRange();
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);

  document.execCommand("insertText", false, newText);
}

function debounce<F extends (...args: never[]) => void>(
  fn: F,
  delay: number,
): F {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<F>) => {
    if (timeoutId !== null) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as F;
}

const ignoredSignatures = new Set<string>();
const signature = (f: Finding) => `${f.type}:${f.matched}`;

let lastScanText = "";
let lastInputEl: HTMLElement | null = null;
let overlay: PromptGuardOverlay | null = null;

function scanCurrent(el: HTMLElement) {
  lastInputEl = el;
  const text = getText(el);
  if (text === lastScanText) return;
  lastScanText = text;

  try {
    const result = scanText(text);
    const visible = result.findings.filter(
      (f) => !ignoredSignatures.has(signature(f)),
    );
    if (overlay) overlay.setFindings(visible);

    if (visible.length > 0) {
      console.group(
        `%c[PromptGuard] ${visible.length} finding${visible.length === 1 ? "" : "s"} in prompt`,
        "color: #d97706; font-weight: 600;",
      );
      visible.forEach((f: Finding, i: number) => {
        console.log(
          `${i + 1}. [${f.severity.toUpperCase()}] ${f.rule}\n   ${f.explanation}`,
        );
      });
      console.groupEnd();
    }
  } catch (err) {
    console.warn("[PromptGuard] scan error:", err);
  }
}

const debouncedScan = debounce(scanCurrent, SCAN_DEBOUNCE_MS);

function attachToInput(el: HTMLElement) {
  const pgEl = el as PromptGuardElement;
  if (pgEl.__promptguardAttached) return;
  pgEl.__promptguardAttached = true;

  el.addEventListener("input", () => debouncedScan(el));
  console.log(
    "%c[PromptGuard] attached to prompt input",
    "color: #2563eb;",
    el,
  );
}

function tryAttach() {
  const input = findPromptInput();
  if (input) attachToInput(input);
}

function rescanNow() {
  if (lastInputEl) {
    lastScanText = ""; // force re-evaluation
    scanCurrent(lastInputEl);
  }
}

function redactOne(finding: Finding) {
  if (!lastInputEl) return;
  const text = getText(lastInputEl);
  const placeholder = `[REDACTED:${finding.type}]`;
  // Replace only the first occurrence of the matched text to keep behavior
  // predictable when the same value appears twice in the prompt.
  const newText = text.replace(finding.matched, placeholder);
  if (newText === text) {
    // Text shifted since the scan; fall back to a noop and let the next
    // input cycle pick it up.
    console.warn("[PromptGuard] redact target not found in current text");
    return;
  }
  setInputText(lastInputEl, newText);
  // Re-scan immediately so the overlay updates without waiting for the
  // debounce on the next input event.
  setTimeout(rescanNow, 0);
}

function redactAll(findings: Finding[]) {
  if (!lastInputEl) return;
  let text = getText(lastInputEl);
  for (const f of findings) {
    const placeholder = `[REDACTED:${f.type}]`;
    text = text.replace(f.matched, placeholder);
  }
  setInputText(lastInputEl, text);
  setTimeout(rescanNow, 0);
}

function ignoreOne(finding: Finding) {
  ignoredSignatures.add(signature(finding));
  rescanNow();
}

// Listen for messages from the popup so it can read and modify the current
// prompt text without having to share a process with the content script.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "get_text") {
    if (!lastInputEl) {
      sendResponse({ ok: false, error: "no prompt input detected" });
      return true;
    }
    sendResponse({ ok: true, text: getText(lastInputEl) });
    return true;
  }
  if (message?.type === "set_text" && typeof message.text === "string") {
    if (!lastInputEl) {
      sendResponse({ ok: false, error: "no prompt input detected" });
      return true;
    }
    setInputText(lastInputEl, message.text);
    setTimeout(rescanNow, 0);
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

function init() {
  const win = window as PromptGuardWindow;
  if (win.__promptguardLoaded) return;
  win.__promptguardLoaded = true;

  console.log(
    `[PromptGuard v${VERSION}] loaded on ${window.location.hostname}.`,
  );

  const mountOverlay = () => {
    overlay = new PromptGuardOverlay({
      onRedact: redactOne,
      onIgnore: ignoreOne,
      onRedactAll: redactAll,
    });
  };

  if (document.body) {
    mountOverlay();
  } else {
    document.addEventListener("DOMContentLoaded", mountOverlay);
  }

  tryAttach();

  const observer = new MutationObserver(() => {
    tryAttach();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

init();

export {};
