import type { Finding, Severity } from "../../src/types.js";

const ROOT_ID = "promptguard-root";

const SEVERITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const CSS = `
  :host {
    all: initial;
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    --pg-bg: #ffffff;
    --pg-fg: #111827;
    --pg-muted: #6b7280;
    --pg-border: #e5e7eb;
    --pg-card-bg: #f9fafb;
    --pg-card-border: #e5e7eb;
    --pg-btn-bg: #ffffff;
    --pg-btn-fg: #111827;
    --pg-btn-border: #d1d5db;
    --pg-btn-hover-bg: #f3f4f6;
    --pg-btn-primary-bg: #111827;
    --pg-btn-primary-fg: #ffffff;
    --pg-btn-primary-hover-bg: #374151;
  }

  @media (prefers-color-scheme: dark) {
    :host {
      --pg-bg: #1f2937;
      --pg-fg: #f9fafb;
      --pg-muted: #9ca3af;
      --pg-border: #374151;
      --pg-card-bg: #111827;
      --pg-card-border: #374151;
      --pg-btn-bg: #374151;
      --pg-btn-fg: #f9fafb;
      --pg-btn-border: #4b5563;
      --pg-btn-hover-bg: #4b5563;
      --pg-btn-primary-bg: #f9fafb;
      --pg-btn-primary-fg: #111827;
      --pg-btn-primary-hover-bg: #e5e7eb;
    }
  }

  .pill {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 9px 14px 9px 12px;
    border-radius: 999px;
    background: #dc2626;
    color: white;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22);
    border: none;
    user-select: none;
    transition: transform 120ms ease, box-shadow 120ms ease;
  }
  .pill:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
  }
  .pill:active { transform: translateY(0); }

  .pill[data-severity="critical"] { background: #dc2626; }
  .pill[data-severity="high"]     { background: #ea580c; }
  .pill[data-severity="medium"]   { background: #ca8a04; }
  .pill[data-severity="low"]      { background: #2563eb; }
  .pill[data-severity="none"]     { display: none; }

  .shield { width: 14px; height: 14px; }

  .panel {
    position: absolute;
    bottom: calc(100% + 10px);
    right: 0;
    width: 360px;
    max-height: 70vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: var(--pg-bg);
    color: var(--pg-fg);
    border-radius: 14px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
    border: 1px solid var(--pg-border);
    opacity: 0;
    transform: translateY(8px) scale(0.98);
    pointer-events: none;
    transition: opacity 140ms ease, transform 140ms ease;
  }
  .panel[data-open="true"] {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 16px 12px 16px;
    border-bottom: 1px solid var(--pg-border);
  }
  .header-left { display: flex; align-items: center; gap: 8px; }
  .title { font-size: 14px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
  .title-shield { width: 15px; height: 15px; opacity: 0.85; }
  .close {
    background: none; border: none; color: var(--pg-muted);
    cursor: pointer; font-size: 22px; line-height: 1;
    padding: 0; width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 6px;
    transition: background 120ms ease, color 120ms ease;
  }
  .close:hover { background: var(--pg-btn-hover-bg); color: var(--pg-fg); }

  .subtitle {
    padding: 10px 16px 6px 16px;
    font-size: 12px;
    color: var(--pg-muted);
  }

  .scroll {
    overflow-y: auto;
    flex: 1;
    padding: 4px 14px;
  }

  .findings { margin: 0; padding: 0; list-style: none; }

  .finding {
    background: var(--pg-card-bg);
    border: 1px solid var(--pg-card-border);
    border-radius: 10px;
    padding: 10px 12px;
    margin: 6px 0;
    transition: opacity 200ms ease, transform 200ms ease;
  }
  .finding.removing {
    opacity: 0;
    transform: translateX(8px);
  }

  .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

  .badge {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .badge[data-level="critical"] { background: #fee2e2; color: #b91c1c; }
  .badge[data-level="high"]     { background: #fed7aa; color: #9a3412; }
  .badge[data-level="medium"]   { background: #fef3c7; color: #854d0e; }
  .badge[data-level="low"]      { background: #dbeafe; color: #1d4ed8; }

  @media (prefers-color-scheme: dark) {
    .badge[data-level="critical"] { background: rgba(220, 38, 38, 0.2); color: #fca5a5; }
    .badge[data-level="high"]     { background: rgba(234, 88, 12, 0.2); color: #fdba74; }
    .badge[data-level="medium"]   { background: rgba(202, 138, 4, 0.2); color: #fde68a; }
    .badge[data-level="low"]      { background: rgba(37, 99, 235, 0.2); color: #93c5fd; }
  }

  .rule { font-size: 13px; font-weight: 600; line-height: 1.3; }
  .why {
    margin: 6px 0 10px 0;
    font-size: 12px;
    color: var(--pg-muted);
    line-height: 1.5;
  }

  .actions { display: flex; gap: 6px; }

  .btn {
    background: var(--pg-btn-bg);
    color: var(--pg-btn-fg);
    border: 1px solid var(--pg-btn-border);
    border-radius: 7px;
    padding: 5px 11px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    transition: background 100ms ease, border-color 100ms ease, transform 80ms ease;
  }
  .btn:hover { background: var(--pg-btn-hover-bg); }
  .btn:active { transform: translateY(1px); }

  .btn.primary {
    background: var(--pg-btn-primary-bg);
    color: var(--pg-btn-primary-fg);
    border-color: var(--pg-btn-primary-bg);
  }
  .btn.primary:hover { background: var(--pg-btn-primary-hover-bg); }

  .bulk {
    padding: 8px 14px 12px 14px;
    border-top: 1px solid var(--pg-border);
    display: flex;
    gap: 6px;
  }
  .bulk .btn { flex: 1; padding: 7px 12px; }

  .empty {
    padding: 28px 16px;
    text-align: center;
    font-size: 13px;
    color: var(--pg-muted);
  }
  .empty .empty-icon { font-size: 22px; opacity: 0.5; margin-bottom: 6px; }

  .footer {
    padding: 9px 14px;
    font-size: 11px;
    color: var(--pg-muted);
    text-align: center;
    border-top: 1px solid var(--pg-border);
  }
`;

const SHIELD_SVG = `
  <svg class="shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 2 L3 6 V11 C3 16.5 7 21 12 22 C17 21 21 16.5 21 11 V6 L12 2 Z" />
  </svg>
`;

const TITLE_SHIELD_SVG = `
  <svg class="title-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 2 L3 6 V11 C3 16.5 7 21 12 22 C17 21 21 16.5 21 11 V6 L12 2 Z" />
  </svg>
`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export type FindingId = string;

function findingId(f: Finding): FindingId {
  return `${f.type}:${f.start}:${f.end}`;
}

export interface OverlayCallbacks {
  onRedact: (finding: Finding) => void;
  onIgnore: (finding: Finding) => void;
  onRedactAll: (findings: Finding[]) => void;
}

export class PromptGuardOverlay {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private pill: HTMLButtonElement;
  private panel: HTMLDivElement;
  private subtitle: HTMLDivElement;
  private findingsList: HTMLUListElement;
  private bulkContainer: HTMLDivElement;
  private callbacks: OverlayCallbacks;
  private currentFindings: Finding[] = [];

  constructor(callbacks: OverlayCallbacks) {
    this.callbacks = callbacks;

    const existing = document.getElementById(ROOT_ID);
    if (existing) existing.remove();

    this.host = document.createElement("div");
    this.host.id = ROOT_ID;
    this.shadow = this.host.attachShadow({ mode: "open" });

    this.shadow.innerHTML = `
      <style>${CSS}</style>
      <button class="pill" data-severity="none" aria-label="PromptGuard findings">
        ${SHIELD_SVG}
        <span class="count">0</span>
      </button>
      <div class="panel" data-open="false" role="dialog" aria-label="PromptGuard findings">
        <div class="header">
          <div class="header-left">
            ${TITLE_SHIELD_SVG}
            <h2 class="title">PromptGuard</h2>
          </div>
          <button class="close" aria-label="Close panel">&times;</button>
        </div>
        <div class="subtitle"></div>
        <div class="scroll">
          <ul class="findings"></ul>
        </div>
        <div class="bulk" hidden></div>
        <div class="footer">Runs locally &middot; nothing leaves your machine</div>
      </div>
    `;

    this.pill = this.shadow.querySelector(".pill") as HTMLButtonElement;
    this.panel = this.shadow.querySelector(".panel") as HTMLDivElement;
    this.subtitle = this.shadow.querySelector(".subtitle") as HTMLDivElement;
    this.findingsList = this.shadow.querySelector(
      ".findings",
    ) as HTMLUListElement;
    this.bulkContainer = this.shadow.querySelector(".bulk") as HTMLDivElement;

    this.pill.addEventListener("click", () => this.togglePanel());
    (this.shadow.querySelector(".close") as HTMLButtonElement).addEventListener(
      "click",
      () => this.closePanel(),
    );

    // Close panel when clicking outside (but only inside our shadow boundary)
    document.addEventListener("click", (e) => {
      if (!this.host.contains(e.target as Node)) {
        this.closePanel();
      }
    });

    document.body.appendChild(this.host);
  }

  setFindings(findings: Finding[]) {
    this.currentFindings = findings;
    this.render();
  }

  /**
   * Animate a finding card out, then re-render. Used so redact/ignore feel
   * snappy instead of just blinking.
   */
  animateRemove(finding: Finding, then: () => void) {
    const id = findingId(finding);
    const el = this.findingsList.querySelector(
      `[data-id="${CSS_ESCAPE(id)}"]`,
    );
    if (el instanceof HTMLElement) {
      el.classList.add("removing");
      setTimeout(then, 180);
    } else {
      then();
    }
  }

  private togglePanel() {
    const open = this.panel.dataset.open === "true";
    this.panel.dataset.open = open ? "false" : "true";
  }

  private closePanel() {
    this.panel.dataset.open = "false";
  }

  private highestSeverity(): Severity | "none" {
    if (this.currentFindings.length === 0) return "none";
    let max: Severity = "low";
    let maxRank = 0;
    for (const f of this.currentFindings) {
      const rank = SEVERITY_RANK[f.severity] ?? 0;
      if (rank > maxRank) {
        max = f.severity;
        maxRank = rank;
      }
    }
    return max;
  }

  private render() {
    const count = this.currentFindings.length;
    const severity = this.highestSeverity();
    this.pill.dataset.severity = severity;
    (this.pill.querySelector(".count") as HTMLElement).textContent =
      String(count);
    this.pill.setAttribute(
      "aria-label",
      count === 0
        ? "PromptGuard: no findings"
        : `PromptGuard: ${count} finding${count === 1 ? "" : "s"}, click to view`,
    );

    if (count === 0) {
      this.subtitle.textContent = "";
      this.findingsList.innerHTML = `
        <li class="empty">
          <div class="empty-icon">✓</div>
          <div>No sensitive data detected.</div>
        </li>
      `;
      this.bulkContainer.hidden = true;
      this.closePanel();
      return;
    }

    this.subtitle.textContent = `${count} sensitive item${count === 1 ? "" : "s"} detected in your prompt`;

    this.findingsList.innerHTML = this.currentFindings
      .map(
        (f) => `
          <li class="finding" data-id="${escapeHtml(findingId(f))}">
            <div class="row">
              <span class="badge" data-level="${f.severity}">${f.severity}</span>
              <span class="rule">${escapeHtml(f.rule)}</span>
            </div>
            <p class="why">${escapeHtml(f.explanation)}</p>
            <div class="actions">
              <button class="btn primary" data-action="redact">Redact</button>
              <button class="btn" data-action="ignore">Ignore</button>
            </div>
          </li>
        `,
      )
      .join("");

    // Wire per-finding action buttons
    this.findingsList.querySelectorAll(".finding").forEach((card) => {
      const id = card.getAttribute("data-id");
      if (!id) return;
      const finding = this.currentFindings.find((f) => findingId(f) === id);
      if (!finding) return;

      card.querySelector('[data-action="redact"]')?.addEventListener(
        "click",
        () => {
          this.animateRemove(finding, () => this.callbacks.onRedact(finding));
        },
      );
      card.querySelector('[data-action="ignore"]')?.addEventListener(
        "click",
        () => {
          this.animateRemove(finding, () => this.callbacks.onIgnore(finding));
        },
      );
    });

    // Bulk actions
    if (count > 1) {
      this.bulkContainer.hidden = false;
      this.bulkContainer.innerHTML = `
        <button class="btn primary" data-bulk="redact-all">Redact all ${count}</button>
      `;
      this.bulkContainer
        .querySelector('[data-bulk="redact-all"]')
        ?.addEventListener("click", () => {
          this.callbacks.onRedactAll(this.currentFindings);
        });
    } else {
      this.bulkContainer.hidden = true;
      this.bulkContainer.innerHTML = "";
    }
  }
}

// CSS.escape polyfill for attribute selector quoting
const CSS_ESCAPE = (s: string): string => {
  if (typeof (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS?.escape === "function") {
    return (globalThis as unknown as { CSS: { escape: (s: string) => string } }).CSS.escape(s);
  }
  return s.replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g, "\\$&");
};
