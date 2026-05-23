import { getEncoding, type Tiktoken } from "js-tiktoken";

export type SupportedModel =
  | "claude-opus-4-7"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5"
  | "gpt-4o"
  | "gpt-4o-mini";

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

let _encoding: Tiktoken | null = null;
function enc(): Tiktoken {
  if (!_encoding) _encoding = getEncoding("cl100k_base");
  return _encoding;
}

export function countTokens(text: string): number {
  return enc().encode(text).length;
}

export function estimateCost(
  text: string,
  model: SupportedModel,
  expectedOutputTokens?: number,
): CostEstimate {
  const inputTokens = countTokens(text);
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
