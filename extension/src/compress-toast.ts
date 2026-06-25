import type { CompressOutcome } from "../../src/compress-flag.js";

// A small receipt that appears after PromptGuard tightens and sends a prompt.
// Self-contained in its own shadow root so the host site's CSS can never touch
// it, and so it can never leak styles onto the page. Bottom-left, out of the
// way of the main PromptGuard shield (which lives bottom-right).

const ROOT_ID = "promptguard-compress-receipt";
const AUTO_DISMISS_MS = 7000;

const CSS = `
  :host {
    all: initial;
    position: fixed;
    bottom: 24px;
    left: 24px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    --pg-bg: #ffffff;
    --pg-fg: #111827;
    --pg-muted: #6b7280;
    --pg-border: #e5e7eb;
    --pg-card-bg: #f9fafb;
    --pg-accent: #5a45ff;
    --pg-accent-soft: #eef0ff;
    --pg-good: #047857;
  }
  @media (prefers-color-scheme: dark) {
    :host {
      --pg-bg: #1f2937;
      --pg-fg: #f9fafb;
      --pg-muted: #9ca3af;
      --pg-border: #374151;
      --pg-card-bg: #111827;
      --pg-accent: #a89bff;
      --pg-accent-soft: #2a2550;
      --pg-good: #34d399;
    }
  }

  .card {
    width: 320px;
    background: var(--pg-bg);
    color: var(--pg-fg);
    border: 1px solid var(--pg-border);
    border-radius: 14px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
    overflow: hidden;
    opacity: 0;
    transform: translateY(10px) scale(0.98);
    transition: opacity 160ms ease, transform 160ms ease;
  }
  .card[data-open="true"] {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 13px 14px 11px 14px;
  }
  .spark {
    flex: none;
    width: 26px; height: 26px;
    display: grid; place-items: center;
    border-radius: 8px;
    background: var(--pg-accent-soft);
    color: var(--pg-accent);
  }
  .spark svg { width: 15px; height: 15px; }
  .head-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .title { font-size: 13.5px; font-weight: 650; letter-spacing: -0.01em; }
  .sub { font-size: 12px; color: var(--pg-muted); }
  .saved { color: var(--pg-good); font-weight: 650; }
  .close {
    margin-left: auto; flex: none;
    background: none; border: none; color: var(--pg-muted);
    cursor: pointer; font-size: 18px; line-height: 1; padding: 2px 4px;
    border-radius: 6px;
  }
  .close:hover { background: var(--pg-card-bg); color: var(--pg-fg); }

  .level {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 10.5px; font-weight: 650; text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 7px; border-radius: 999px;
    background: var(--pg-accent-soft); color: var(--pg-accent);
  }
  .level[data-caveman="true"] { background: #fdecc8; color: #b45309; }
  @media (prefers-color-scheme: dark) {
    .level[data-caveman="true"] { background: #4a3206; color: #fbbf24; }
  }

  .toggle {
    width: 100%;
    display: flex; align-items: center; justify-content: space-between;
    background: none; border: none; border-top: 1px solid var(--pg-border);
    color: var(--pg-muted); cursor: pointer;
    padding: 9px 14px; font-size: 12px; font-weight: 550;
    font-family: inherit;
  }
  .toggle:hover { color: var(--pg-fg); }
  .chev { transition: transform 140ms ease; }
  .toggle[data-expanded="true"] .chev { transform: rotate(180deg); }

  .body {
    display: none;
    border-top: 1px solid var(--pg-border);
    padding: 11px 14px 13px 14px;
    max-height: 220px; overflow-y: auto;
  }
  .body[data-expanded="true"] { display: block; }
  .field-label {
    font-size: 10.5px; font-weight: 650; text-transform: uppercase;
    letter-spacing: 0.04em; color: var(--pg-muted); margin: 0 0 4px 0;
  }
  .field-label + .field-label { margin-top: 11px; }
  .snippet {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11.5px; line-height: 1.5;
    background: var(--pg-card-bg); border: 1px solid var(--pg-border);
    border-radius: 8px; padding: 8px 10px;
    white-space: pre-wrap; word-break: break-word;
    color: var(--pg-fg);
  }
  .snippet.was { color: var(--pg-muted); }
`;

const SPARK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m13 2-3 8h6l-3 8"/><path d="M4 14h2"/><path d="M18 8h2"/></svg>`;
const CHEV_SVG = `<svg class="chev" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

let dismissTimer: ReturnType<typeof setTimeout> | null = null;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function showCompressReceipt(outcome: CompressOutcome): void {
  document.getElementById(ROOT_ID)?.remove();
  if (dismissTimer) clearTimeout(dismissTimer);

  const host = document.createElement("div");
  host.id = ROOT_ID;
  const shadow = host.attachShadow({ mode: "open" });

  const isCaveman = outcome.level === "caveman";
  const savedPart =
    outcome.tokensSaved > 0
      ? `saved <span class="saved">${outcome.tokensSaved} tokens (${outcome.percentSaved}%)</span>`
      : `already concise, nothing to trim`;

  shadow.innerHTML = `
    <style>${CSS}</style>
    <div class="card" data-open="false">
      <div class="head">
        <div class="spark">${SPARK_SVG}</div>
        <div class="head-text">
          <div class="title">Tightened &amp; sent</div>
          <div class="sub">${savedPart}</div>
        </div>
        <button class="close" title="Dismiss" aria-label="Dismiss">&times;</button>
      </div>
      <button class="toggle" data-expanded="false">
        <span style="display:inline-flex;align-items:center;gap:7px;">
          What was sent
          <span class="level" data-caveman="${isCaveman}">${escapeHtml(outcome.level)}</span>
        </span>
        ${CHEV_SVG}
      </button>
      <div class="body" data-expanded="false">
        <p class="field-label">Sent to the model</p>
        <div class="snippet">${escapeHtml(outcome.sentText)}</div>
        <p class="field-label">You typed</p>
        <div class="snippet was">${escapeHtml(outcome.originalBody)}</div>
      </div>
    </div>
  `;

  const card = shadow.querySelector<HTMLElement>(".card")!;
  const closeBtn = shadow.querySelector<HTMLButtonElement>(".close")!;
  const toggle = shadow.querySelector<HTMLButtonElement>(".toggle")!;
  const body = shadow.querySelector<HTMLElement>(".body")!;

  const dismiss = () => {
    card.dataset.open = "false";
    setTimeout(() => host.remove(), 200);
  };

  closeBtn.addEventListener("click", dismiss);

  toggle.addEventListener("click", () => {
    const expanded = toggle.dataset.expanded !== "true";
    toggle.dataset.expanded = String(expanded);
    body.dataset.expanded = String(expanded);
    // While the user is inspecting the diff, do not auto-dismiss.
    if (expanded && dismissTimer) clearTimeout(dismissTimer);
  });

  // Hovering keeps it around; leaving restarts the countdown.
  const arm = () => {
    if (dismissTimer) clearTimeout(dismissTimer);
    dismissTimer = setTimeout(dismiss, AUTO_DISMISS_MS);
  };
  host.addEventListener("mouseenter", () => {
    if (dismissTimer) clearTimeout(dismissTimer);
  });
  host.addEventListener("mouseleave", arm);

  document.body.appendChild(host);
  requestAnimationFrame(() => {
    card.dataset.open = "true";
  });
  arm();
}
