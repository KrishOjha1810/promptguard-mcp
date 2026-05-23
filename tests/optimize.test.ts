import { describe, it, expect } from "vitest";
import { optimizePrompt } from "../src/optimize.js";

describe("optimizePrompt - smart triggering", () => {
  it("stays silent on empty text", () => {
    const result = optimizePrompt("");
    expect(result.shouldSuggest).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("stays silent on very short prompts", () => {
    const result = optimizePrompt("Hi");
    expect(result.shouldSuggest).toBe(false);
    expect(result.optimizations).toHaveLength(0);
  });

  it("stays silent on already-concise well-structured prompts", () => {
    const result = optimizePrompt(
      "Write a haiku about autumn rain. Respond in three lines.",
    );
    expect(result.shouldSuggest).toBe(false);
  });

  it("suggests on prompts with filler and verbose phrases", () => {
    const result = optimizePrompt(
      "Could you please help me write a short summary of the meeting notes? I would like you to do this in order to share it with the team. Thanks in advance!",
    );
    expect(result.shouldSuggest).toBe(true);
    expect(result.optimizations.length).toBeGreaterThan(0);
    expect(result.tokensSaved).toBeGreaterThan(0);
  });
});

describe("optimizePrompt - substitutions", () => {
  it("removes 'please' and soft openers", () => {
    const result = optimizePrompt(
      "Could you please write a sonnet about a small cat sleeping in the sun.",
    );
    expect(result.optimizedText).not.toMatch(/please/i);
    expect(result.optimizedText).not.toMatch(/^could you/i);
  });

  it("tightens 'in order to' to 'to'", () => {
    const result = optimizePrompt(
      "Refactor this function in order to make it more readable for new contributors.",
    );
    expect(result.optimizedText).not.toMatch(/in order to/i);
    expect(result.optimizedText).toMatch(/to make it/i);
  });

  it("tightens 'due to the fact that' to 'because'", () => {
    const result = optimizePrompt(
      "Explain why this test is failing due to the fact that the mock returns undefined.",
    );
    expect(result.optimizedText).not.toMatch(/due to the fact that/i);
    expect(result.optimizedText).toMatch(/because/i);
  });

  it("removes hedging openers", () => {
    const result = optimizePrompt(
      "This might be a silly question but explain why JavaScript adds strings and numbers the way it does.",
    );
    expect(result.optimizedText).not.toMatch(/this might be a silly question/i);
  });

  it("removes trailing thanks", () => {
    const result = optimizePrompt(
      "Generate three product name ideas for a new coffee subscription service. Thanks in advance!",
    );
    expect(result.optimizedText).not.toMatch(/thanks/i);
  });
});

describe("optimizePrompt - structural issues", () => {
  it("flags missing task verb on soft-opening prompts", () => {
    const result = optimizePrompt(
      "Can you help me figure out what is going on with my deployment? It has been failing all morning and I cannot tell why.",
    );
    expect(
      result.structuralIssues.some((i) => i.type === "missing_task_verb"),
    ).toBe(true);
  });

  it("does not flag prompts starting with a direct task verb", () => {
    const result = optimizePrompt(
      "Write a thoughtful Slack message announcing the new vacation policy to the engineering team. Keep it under 200 words and make sure it is friendly.",
    );
    expect(
      result.structuralIssues.some((i) => i.type === "missing_task_verb"),
    ).toBe(false);
  });

  it("flags missing output format on long prompts without format hints", () => {
    const result = optimizePrompt(
      "Analyze the following data and tell me what trends you see across the various dimensions. Be thorough and consider edge cases as you work through it.",
    );
    expect(
      result.structuralIssues.some((i) => i.type === "missing_output_format"),
    ).toBe(true);
  });

  it("does not flag missing format when format is specified", () => {
    const result = optimizePrompt(
      "Analyze the following data and respond as a bulleted list of the top three trends you observe across the various dimensions of the input data.",
    );
    expect(
      result.structuralIssues.some((i) => i.type === "missing_output_format"),
    ).toBe(false);
  });
});

describe("optimizePrompt - token accounting", () => {
  it("optimized text has fewer tokens when filler is removed", () => {
    const result = optimizePrompt(
      "Could you please be so kind as to write a summary of the document I am about to provide to you. I would really appreciate your help with this task. Thank you so much in advance!",
    );
    expect(result.optimizedTokens).toBeLessThan(result.originalTokens);
    expect(result.tokensSaved).toBeGreaterThan(0);
  });

  it("percentSaved is calculated correctly", () => {
    const result = optimizePrompt(
      "Could you please write a short poem in order to celebrate the new product launch. Thank you in advance.",
    );
    if (result.shouldSuggest) {
      const expected =
        Math.round(
          (result.tokensSaved / result.originalTokens) * 10000,
        ) / 100;
      expect(result.percentSaved).toBe(expected);
    }
  });

  it("returns optimizedText equal to originalText for short prompts that bypass the engine", () => {
    const result = optimizePrompt("hi");
    expect(result.optimizedText).toBe(result.originalText);
  });
});

describe("optimizePrompt - idempotency", () => {
  it("running optimize on the optimized text returns no further suggestion", () => {
    const first = optimizePrompt(
      "Could you please help me summarize this article in order to share it with my colleagues? Thank you in advance.",
    );
    if (first.shouldSuggest) {
      const second = optimizePrompt(first.optimizedText);
      expect(second.shouldSuggest).toBe(false);
    }
  });
});
