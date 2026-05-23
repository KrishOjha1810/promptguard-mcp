import { describe, it, expect } from "vitest";
import {
  countTokens,
  estimateCost,
  SUPPORTED_MODELS,
} from "../src/cost.js";

describe("countTokens", () => {
  it("returns 0 for empty string", () => {
    expect(countTokens("")).toBe(0);
  });

  it("returns a positive integer for non-empty text", () => {
    const n = countTokens("Hello, world!");
    expect(n).toBeGreaterThan(0);
    expect(Number.isInteger(n)).toBe(true);
  });

  it("counts longer text as more tokens", () => {
    const short = countTokens("hi");
    const long = countTokens(
      "This is a much longer string with many more words and tokens.",
    );
    expect(long).toBeGreaterThan(short);
  });

  it("uses o200k_base for gpt-4o family, producing different counts than the default cl100k_base", () => {
    // For most real text, o200k_base packs more characters per token than
    // cl100k_base, so the gpt-4o count should differ from the default count.
    const sample =
      "The quick brown fox jumps over the lazy dog. The five boxing wizards jump quickly.";
    const defaultCount = countTokens(sample);
    const gpt4oCount = countTokens(sample, "gpt-4o");
    expect(gpt4oCount).not.toBe(defaultCount);
  });

  it("uses cl100k_base for Claude models (same as the default)", () => {
    const sample = "Hello, this is a test sentence for tokenization.";
    expect(countTokens(sample, "claude-sonnet-4-6")).toBe(countTokens(sample));
  });
});

describe("estimateCost", () => {
  it("supports all listed models", () => {
    for (const model of SUPPORTED_MODELS) {
      const r = estimateCost("hello world", model);
      expect(r.model).toBe(model);
      expect(r.inputTokens).toBeGreaterThan(0);
      expect(r.totalEstimatedUsd).toBeGreaterThanOrEqual(0);
    }
  });

  it("marks Claude estimates as approximate", () => {
    const r = estimateCost("hello", "claude-sonnet-4-6");
    expect(r.approximate).toBe(true);
  });

  it("marks OpenAI estimates as exact (not approximate)", () => {
    const r = estimateCost("hello", "gpt-4o");
    expect(r.approximate).toBe(false);
  });

  it("scales cost linearly with input length", () => {
    const short = estimateCost("a", "gpt-4o-mini", 0);
    const long = estimateCost("a ".repeat(1000), "gpt-4o-mini", 0);
    expect(long.inputTokens).toBeGreaterThan(short.inputTokens * 100);
    expect(long.totalEstimatedUsd).toBeGreaterThan(short.totalEstimatedUsd);
  });

  it("includes a non-zero output cost component by default", () => {
    const r = estimateCost("Hello, world!", "gpt-4o");
    expect(r.estimatedOutputTokens).toBeGreaterThan(0);
    expect(r.estimatedOutputCostUsd).toBeGreaterThan(0);
  });

  it("respects expectedOutputTokens override", () => {
    const r = estimateCost("Hello", "gpt-4o", 0);
    expect(r.estimatedOutputTokens).toBe(0);
    expect(r.estimatedOutputCostUsd).toBe(0);

    const r2 = estimateCost("Hello", "gpt-4o", 10000);
    expect(r2.estimatedOutputTokens).toBe(10000);
    expect(r2.estimatedOutputCostUsd).toBeGreaterThan(0);
  });

  it("caps the default output token estimate at 1024 for long prompts", () => {
    // Build a prompt comfortably over 1024 tokens.
    const r = estimateCost("a ".repeat(2000), "gpt-4o");
    expect(r.estimatedOutputTokens).toBe(1024);
  });

  it("returns a pricingLastUpdated date", () => {
    const r = estimateCost("Hello", "gpt-4o");
    expect(r.pricingLastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("totalEstimatedUsd equals inputCost plus outputCost", () => {
    const r = estimateCost(
      "The quick brown fox jumps over the lazy dog.",
      "claude-sonnet-4-6",
      200,
    );
    const sum = r.inputCostUsd + r.estimatedOutputCostUsd;
    expect(Math.abs(r.totalEstimatedUsd - sum)).toBeLessThan(0.000002);
  });
});
