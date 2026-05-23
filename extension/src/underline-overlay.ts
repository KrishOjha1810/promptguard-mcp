import type { Finding } from "../../src/types.js";

const HOST_ID = "promptguard-underline-overlay";
const STYLE_ID = "promptguard-underline-styles";

// Computed-style properties we copy from the prompt input so text wraps
// at exactly the same positions in our transparent overlay.
const STYLE_PROPS_TO_COPY = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontStretch",
  "fontVariant",
  "lineHeight",
  "letterSpacing",
  "wordSpacing",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopStyle",
  "borderRightStyle",
  "borderBottomStyle",
  "borderLeftStyle",
  "whiteSpace",
  "wordWrap",
  "wordBreak",
  "overflowWrap",
  "tabSize",
  "textIndent",
  "textTransform",
  "textAlign",
  "direction",
  "boxSizing",
] as const;

const STYLE_CSS = `
  #${HOST_ID} {
    position: absolute;
    pointer-events: none;
    color: transparent !important;
    background: transparent !important;
    border-color: transparent !important;
    z-index: 2147483646;
    overflow: hidden;
    margin: 0;
    user-select: none;
    -webkit-user-select: none;
  }
  #${HOST_ID} * {
    color: transparent !important;
    background: transparent !important;
  }
  #${HOST_ID} .pg-u {
    text-decoration-line: underline !important;
    text-decoration-style: wavy !important;
    text-decoration-thickness: 2px !important;
    text-underline-offset: 2px !important;
    -webkit-text-decoration-line: underline;
    -webkit-text-decoration-style: wavy;
  }
  #${HOST_ID} .pg-critical { text-decoration-color: #dc2626 !important; -webkit-text-decoration-color: #dc2626; }
  #${HOST_ID} .pg-high     { text-decoration-color: #ea580c !important; -webkit-text-decoration-color: #ea580c; }
  #${HOST_ID} .pg-medium   { text-decoration-color: #ca8a04 !important; -webkit-text-decoration-color: #ca8a04; }
  #${HOST_ID} .pg-low      { text-decoration-color: #2563eb !important; -webkit-text-decoration-color: #2563eb; }
`;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLE_CSS;
  document.head.appendChild(style);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function highlightHTML(text: string, findings: Finding[]): string {
  const sorted = [...findings].sort((a, b) => a.start - b.start);

  // Drop overlapping ranges (keep first; rare in practice)
  const nonOverlapping: Finding[] = [];
  let lastEnd = 0;
  for (const f of sorted) {
    if (f.start >= lastEnd) {
      nonOverlapping.push(f);
      lastEnd = f.end;
    }
  }

  let result = "";
  let cursor = 0;
  for (const f of nonOverlapping) {
    if (cursor < f.start) result += escapeHtml(text.slice(cursor, f.start));
    result +=
      `<span class="pg-u pg-${f.severity}">` +
      escapeHtml(text.slice(f.start, f.end)) +
      `</span>`;
    cursor = f.end;
  }
  if (cursor < text.length) result += escapeHtml(text.slice(cursor));
  return result;
}

export class UnderlineOverlay {
  private host: HTMLDivElement;
  private input: HTMLElement | null = null;
  private scrollListener: (() => void) | null = null;
  private resizeListener: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    injectStyles();
    const existing = document.getElementById(HOST_ID);
    if (existing) existing.remove();
    this.host = document.createElement("div");
    this.host.id = HOST_ID;
    this.hide();
    document.body.appendChild(this.host);
  }

  attach(input: HTMLElement) {
    if (this.input === input) return;
    this.detach();
    this.input = input;
    this.syncStyle();
    this.syncPosition();

    this.scrollListener = () => this.syncPosition();
    this.resizeListener = () => {
      this.syncStyle();
      this.syncPosition();
    };
    window.addEventListener("scroll", this.scrollListener, true);
    window.addEventListener("resize", this.resizeListener);

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        this.syncStyle();
        this.syncPosition();
      });
      this.resizeObserver.observe(input);
    }
  }

  detach() {
    if (this.scrollListener) {
      window.removeEventListener("scroll", this.scrollListener, true);
      this.scrollListener = null;
    }
    if (this.resizeListener) {
      window.removeEventListener("resize", this.resizeListener);
      this.resizeListener = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.input = null;
  }

  setFindings(text: string, findings: Finding[]) {
    if (!this.input) return;
    if (findings.length === 0 || text.length === 0) {
      this.hide();
      return;
    }
    this.syncStyle();
    this.syncPosition();
    this.host.innerHTML = highlightHTML(text, findings);
    this.show();
  }

  private syncStyle() {
    if (!this.input) return;
    const computed = window.getComputedStyle(this.input);
    for (const prop of STYLE_PROPS_TO_COPY) {
      const value = computed.getPropertyValue(camelToKebab(prop));
      if (value) this.host.style.setProperty(camelToKebab(prop), value);
    }
  }

  private syncPosition() {
    if (!this.input) return;
    const rect = this.input.getBoundingClientRect();
    this.host.style.top = `${rect.top + window.scrollY}px`;
    this.host.style.left = `${rect.left + window.scrollX}px`;
    this.host.style.width = `${rect.width}px`;
    this.host.style.height = `${rect.height}px`;
  }

  private show() {
    this.host.style.display = "block";
  }

  private hide() {
    this.host.style.display = "none";
    this.host.innerHTML = "";
  }
}

function camelToKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}
