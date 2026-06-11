import { getEncoding, type Tiktoken } from "js-tiktoken";
import {
  PRICING_USD_PER_M,
  PRICING_LAST_UPDATED,
  type SupportedModel,
} from "./pricing.js";

export type { SupportedModel } from "./pricing.js";
export { SUPPORTED_MODELS } from "./pricing.js";

type EncodingName = "cl100k_base" | "o200k_base";

// GPT-4o family uses o200k_base, an updated tokenizer that produces different
// token counts than cl100k_base for the same text. Claude models do not expose
// their tokenizer; cl100k_base is a close approximation flagged below.
const ENCODING_BY_MODEL: Record<SupportedModel, EncodingName> = {
  "claude-opus-4-8": "cl100k_base",
  "claude-opus-4-7": "cl100k_base",
  "claude-sonnet-4-6": "cl100k_base",
  "claude-haiku-4-5": "cl100k_base",
  "gpt-4o": "o200k_base",
  "gpt-4o-mini": "o200k_base",
};

export type CostEstimate = {
  model: SupportedModel;
  inputTokens: number;
  estimatedOutputTokens: number;
  inputCostUsd: number;
  estimatedOutputCostUsd: number;
  totalEstimatedUsd: number;
  /**
   * True when the token count is an approximation. cl100k_base is exact
   * for older OpenAI models, and approximate for Claude (which does not
   * expose its tokenizer publicly).
   */
  approximate: boolean;
  pricingLastUpdated: string;
};

const _encodings = new Map<EncodingName, Tiktoken>();
function getEnc(name: EncodingName): Tiktoken {
  const cached = _encodings.get(name);
  if (cached) return cached;
  const fresh = getEncoding(name);
  _encodings.set(name, fresh);
  return fresh;
}

/**
 * Count tokens for a piece of text. If a model is given, the tokenizer
 * that matches that model is used (exact for OpenAI, approximate for
 * Claude). If not given, cl100k_base is used as a sensible default for
 * generic comparisons.
 */
export function countTokens(text: string, model?: SupportedModel): number {
  const encoding: EncodingName = model
    ? ENCODING_BY_MODEL[model]
    : "cl100k_base";
  return getEnc(encoding).encode(text).length;
}

export function estimateCost(
  text: string,
  model: SupportedModel,
  expectedOutputTokens?: number,
): CostEstimate {
  const inputTokens = countTokens(text, model);
  const outputTokens =
    expectedOutputTokens !== undefined
      ? expectedOutputTokens
      : Math.min(inputTokens, 1024);

  const price = PRICING_USD_PER_M[model];
  const inputCost = (inputTokens / 1_000_000) * price.input;
  const outputCost = (outputTokens / 1_000_000) * price.output;

  return {
    model,
    inputTokens,
    estimatedOutputTokens: outputTokens,
    inputCostUsd: round(inputCost, 6),
    estimatedOutputCostUsd: round(outputCost, 6),
    totalEstimatedUsd: round(inputCost + outputCost, 6),
    approximate: model.startsWith("claude-"),
    pricingLastUpdated: PRICING_LAST_UPDATED,
  };
}

function round(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

// Re-export so consumers do not need to know that pricing lives elsewhere.
export { PRICING_LAST_UPDATED } from "./pricing.js";
