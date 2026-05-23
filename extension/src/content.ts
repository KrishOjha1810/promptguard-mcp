import { scanText } from "../../src/detectors/secrets.js";
import type { Finding } from "../../src/types.js";
import { PromptGuardOverlay } from "./overlay.js";

const VERSION = "0.0.3";
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

let lastScanText = "";
let overlay: PromptGuardOverlay | null = null;

function scanCurrent(el: HTMLElement) {
  const text = getText(el);
  if (text === lastScanText) return;
  lastScanText = text;

  try {
    const result = scanText(text);
    if (overlay) overlay.setFindings(result.findings);

    if (result.findings.length > 0) {
      console.group(
        `%c[PromptGuard] ${result.findings.length} finding${result.findings.length === 1 ? "" : "s"} in prompt`,
        "color: #d97706; font-weight: 600;",
      );
      result.findings.forEach((f: Finding, i: number) => {
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

function init() {
  const win = window as PromptGuardWindow;
  if (win.__promptguardLoaded) return;
  win.__promptguardLoaded = true;

  console.log(
    `[PromptGuard v${VERSION}] loaded on ${window.location.hostname}.`,
  );

  // Mount the visual overlay once the body is ready.
  if (document.body) {
    overlay = new PromptGuardOverlay();
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      overlay = new PromptGuardOverlay();
    });
  }

  tryAttach();

  const observer = new MutationObserver(() => {
    tryAttach();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

init();

export {};
