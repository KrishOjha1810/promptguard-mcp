import { getEncoding, type Tiktoken } from "js-tiktoken";

export type SupportedModel =
  | "claude-opus-4-7"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5"
  | "gpt-4o"
  | "gpt-4o-mini";

type EncodingName = "cl100k_base" | "o200k_base";

// GPT-4o family uses o200k_base, an updated tokenizer that produces different
// token counts than cl100k_base for the same text. Claude models do not expose
// their tokenizer; cl100k_base is a close approximation flagged below.
const ENCODING_BY_MODEL: Record<SupportedModel, EncodingName> = {
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
   * True when the token count is an approximation. We use a cl100k tokenizer
   * that is exact for OpenAI models and a close approximation for Claude.
   */
  approximate: boolean;
  pricingLastUpdated: string;
};

// USD per 1,000,000 tokens. Update as model pricing changes.
const PRICING: Record<SupportedModel, { input: number; output: number }> = {
  "claude-opus-4-7": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

const PRICING_LAST_UPDATED = "2026-05-23";

const _encodings = new Map<EncodingName, Tiktoken>();
function getEnc(name: EncodingName): Tiktoken {
  const cached = _encodings.get(name);
  if (cached) return cached;
  const fresh = getEncoding(name);
  _encodings.set(name, fresh);
  return fresh;
}

/**
 * Count tokens for a piece of text. If a model is given, the tokenizer that
 * matches that model is used (exact for OpenAI, approximate for Claude). If
 * not given, cl100k_base is used as a sensible default for generic comparisons.
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

  const price = PRICING[model];
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

export const SUPPORTED_MODELS: SupportedModel[] = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "gpt-4o",
  "gpt-4o-mini",
];
