// IMPORTANT: do not import from ../../src/cost.js in the popup. That module
// pulls in js-tiktoken which is several megabytes of BPE table data and
// would bloat the popup bundle. Instead the popup uses approxTokens and
// the pricing table directly, which keeps the popup tiny.

import {
  PRICING_USD_PER_M,
  MODEL_LABELS,
  SUPPORTED_MODELS,
  type SupportedModel,
} from "../../src/pricing.js";
import { approxTokens } from "../../src/internal-tokens.js";
import { optimizePrompt } from "../../src/optimize.js";
import {
  compressPrompt,
  type CompressionLevel,
} from "../../src/compress.js";

const VERSION = "0.0.7";

interface MessageResponse {
  ok: boolean;
  text?: string;
  error?: string;
}

async function getActiveTabId(): Promise<number | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id ?? null;
}

async function getPromptText(): Promise<string | null> {
  const tabId = await getActiveTabId();
  if (tabId == null) return null;
  try {
    const resp = (await chrome.tabs.sendMessage(tabId, {
      type: "get_text",
    })) as MessageResponse;
    if (resp.ok && typeof resp.text === "string") return resp.text;
    return null;
  } catch {
    return null;
  }
}

async function setPromptText(text: string): Promise<boolean> {
  const tabId = await getActiveTabId();
  if (tabId == null) return false;
  try {
    const resp = (await chrome.tabs.sendMessage(tabId, {
      type: "set_text",
      text,
    })) as MessageResponse;
    return resp.ok;
  } catch {
    return false;
  }
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el;
}

function show(id: string) {
  $(id).classList.remove("hidden");
}

function hide(id: string) {
  $(id).classList.add("hidden");
}

function setText(id: string, text: string) {
  $(id).textContent = text;
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.0001) return "<$0.0001";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

let currentText = "";

function approxEstimate(text: string, model: SupportedModel) {
  const inputTokens = approxTokens(text);
  const estOutputTokens = Math.min(inputTokens, 1024);
  const price = PRICING_USD_PER_M[model];
  const inputCost = (inputTokens / 1_000_000) * price.input;
  const outputCost = (estOutputTokens / 1_000_000) * price.output;
  return {
    inputTokens,
    totalUsd: inputCost + outputCost,
  };
}

function updateCost() {
  const modelSel = $("model") as HTMLSelectElement;
  const model = modelSel.value as SupportedModel;
  const r = approxEstimate(currentText, model);
  setText("input-tokens", `~${r.inputTokens}`);
  setText("cost", `~${formatCost(r.totalUsd)}`);
}

async function refreshFromPage() {
  const text = await getPromptText();
  if (text == null) {
    hide("content");
    show("not-supported");
    return;
  }
  hide("not-supported");
  show("content");
  currentText = text;
  updateCost();
  hide("optimize-result");
  hide("compress-result");
}

function populateModelOptions() {
  const sel = $("model") as HTMLSelectElement;
  sel.innerHTML = SUPPORTED_MODELS.map(
    (m) =>
      `<option value="${m}"${m === "claude-sonnet-4-6" ? " selected" : ""}>${MODEL_LABELS[m]}</option>`,
  ).join("");
}

function wireOptimize() {
  $("optimize-btn").addEventListener("click", () => {
    const result = optimizePrompt(currentText);
    show("optimize-result");

    if (!result.shouldSuggest) {
      setText(
        "optimize-text",
        result.reason ?? "Prompt looks good. No changes recommended.",
      );
      setText("optimize-meta", "");
      ($("optimize-apply") as HTMLButtonElement).disabled = true;
      return;
    }

    setText("optimize-text", result.optimizedText);
    const tipBits: string[] = [];
    if (result.tokensSaved > 0) {
      tipBits.push(
        `Saves ~<strong>${result.tokensSaved}</strong> tokens (${result.percentSaved}% leaner)`,
      );
    }
    if (result.structuralIssues.length > 0) {
      tipBits.push(
        `${result.structuralIssues.length} structural tip${result.structuralIssues.length === 1 ? "" : "s"} included`,
      );
    }
    $("optimize-meta").innerHTML = tipBits.join(" &middot; ");
    ($("optimize-apply") as HTMLButtonElement).disabled = false;
  });

  $("optimize-apply").addEventListener("click", async () => {
    const text = $("optimize-text").textContent ?? "";
    if (!text) return;
    const ok = await setPromptText(text);
    if (ok) window.close();
  });
}

function wireCompress() {
  $("compress-btn").addEventListener("click", () => {
    const level = ($("compress-level") as HTMLSelectElement)
      .value as CompressionLevel;
    const result = compressPrompt(currentText, level);
    show("compress-result");

    if (result.tokensSaved <= 0) {
      setText(
        "compress-text",
        "Nothing to compress. The prompt is already tight.",
      );
      setText("compress-meta", "");
      ($("compress-apply") as HTMLButtonElement).disabled = true;
      return;
    }

    setText("compress-text", result.compressedText);
    $("compress-meta").innerHTML =
      `Saves ~<strong>${result.tokensSaved}</strong> tokens (${result.percentSaved}% leaner) at the <strong>${result.level}</strong> level`;
    ($("compress-apply") as HTMLButtonElement).disabled = false;
  });

  $("compress-apply").addEventListener("click", async () => {
    const text = $("compress-text").textContent ?? "";
    if (!text) return;
    const ok = await setPromptText(text);
    if (ok) window.close();
  });
}

function init() {
  setText("version", `v${VERSION}`);
  populateModelOptions();
  ($("model") as HTMLSelectElement).addEventListener("change", updateCost);
  wireOptimize();
  wireCompress();
  void refreshFromPage();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export {};
