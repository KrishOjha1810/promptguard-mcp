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
  }

  .pill {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 999px;
    background: #dc2626;
    color: white;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
    border: none;
    user-select: none;
    transition: transform 100ms ease;
  }
  .pill:hover { transform: translateY(-1px); }

  .pill[data-severity="critical"] { background: #dc2626; }
  .pill[data-severity="high"]     { background: #f59e0b; }
  .pill[data-severity="medium"]   { background: #eab308; color: #1a1a1a; }
  .pill[data-severity="low"]      { background: #3b82f6; }
  .pill[data-severity="none"]     { display: none; }

  .shield {
    width: 14px;
    height: 14px;
  }

  .panel {
    position: absolute;
    bottom: 100%;
    right: 0;
    margin-bottom: 8px;
    width: 340px;
    max-height: 60vh;
    overflow-y: auto;
    background: white;
    color: #1a1a1a;
    border-radius: 10px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
    border: 1px solid #e5e7eb;
    display: none;
  }
  .panel[data-open="true"] { display: block; }

  @media (prefers-color-scheme: dark) {
    .panel { background: #1f2937; color: #f3f4f6; border-color: #374151; }
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 14px;
    border-bottom: 1px solid #e5e7eb;
  }
  @media (prefers-color-scheme: dark) {
    .header { border-bottom-color: #374151; }
  }

  .title { font-size: 14px; font-weight: 600; margin: 0; }
  .close {
    background: none; border: none; color: inherit;
    cursor: pointer; font-size: 20px; line-height: 1;
    padding: 2px 6px; opacity: 0.6;
  }
  .close:hover { opacity: 1; }

  .findings { margin: 0; padding: 0; list-style: none; }

  .finding { padding: 12px 14px; border-bottom: 1px solid #f3f4f6; }
  .finding:last-child { border-bottom: none; }
  @media (prefers-color-scheme: dark) {
    .finding { border-bottom-color: #374151; }
  }

  .row { display: flex; align-items: center; gap: 8px; }

  .badge {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .badge[data-level="critical"] { background: #fee2e2; color: #b91c1c; }
  .badge[data-level="high"]     { background: #fed7aa; color: #b45309; }
  .badge[data-level="medium"]   { background: #fef9c3; color: #854d0e; }
  .badge[data-level="low"]      { background: #dbeafe; color: #1d4ed8; }

  @media (prefers-color-scheme: dark) {
    .badge[data-level="critical"] { background: #7f1d1d; color: #fecaca; }
    .badge[data-level="high"]     { background: #78350f; color: #fed7aa; }
    .badge[data-level="medium"]   { background: #713f12; color: #fef08a; }
    .badge[data-level="low"]      { background: #1e3a8a; color: #bfdbfe; }
  }

  .rule {
    font-size: 13px; font-weight: 600; line-height: 1.3;
  }
  .why {
    margin: 6px 0 0 0;
    font-size: 12px;
    opacity: 0.78;
    line-height: 1.45;
  }

  .empty {
    padding: 24px 16px;
    text-align: center;
    font-size: 13px;
    opacity: 0.6;
  }

  .footer {
    padding: 8px 14px;
    font-size: 11px;
    opacity: 0.5;
    text-align: center;
    border-top: 1px solid #f3f4f6;
  }
  @media (prefers-color-scheme: dark) {
    .footer { border-top-color: #374151; }
  }
`;

const SHIELD_SVG = `
  <svg class="shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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

export class PromptGuardOverlay {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private pill: HTMLButtonElement;
  private panel: HTMLDivElement;
  private findingsList: HTMLUListElement;
  private currentFindings: Finding[] = [];

  constructor() {
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
          <h2 class="title">PromptGuard</h2>
          <button class="close" aria-label="Close">&times;</button>
        </div>
        <ul class="findings"></ul>
        <div class="footer">Runs locally. Nothing leaves your machine.</div>
      </div>
    `;

    this.pill = this.shadow.querySelector(".pill") as HTMLButtonElement;
    this.panel = this.shadow.querySelector(".panel") as HTMLDivElement;
    this.findingsList = this.shadow.querySelector(
      ".findings",
    ) as HTMLUListElement;

    this.pill.addEventListener("click", () => this.togglePanel());
    (this.shadow.querySelector(".close") as HTMLButtonElement).addEventListener(
      "click",
      () => this.closePanel(),
    );

    document.body.appendChild(this.host);
  }

  setFindings(findings: Finding[]) {
    this.currentFindings = findings;
    this.render();
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
      this.findingsList.innerHTML = `<li class="empty">No sensitive data detected.</li>`;
      this.closePanel();
      return;
    }

    this.findingsList.innerHTML = this.currentFindings
      .map(
        (f) => `
          <li class="finding">
            <div class="row">
              <span class="badge" data-level="${f.severity}">${f.severity}</span>
              <span class="rule">${escapeHtml(f.rule)}</span>
            </div>
            <p class="why">${escapeHtml(f.explanation)}</p>
          </li>
        `,
      )
      .join("");
  }
}
