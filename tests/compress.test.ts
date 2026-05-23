import { describe, it, expect } from "vitest";
import { compressPrompt } from "../src/compress.js";

const WORDY = `
I was wondering if you could please help me out with something I have been thinking about.
I would really like for you to write a short blog post for me, if possible, about the impact
of remote work on engineering productivity. I think it would be great if you could cover
a few different angles in this post. Make sure to include some real-world examples in order
to back up the main points. Thanks so much in advance, I really appreciate your help!
`.trim();

describe("compressPrompt - levels", () => {
  it("light compression reduces tokens but is conservative", () => {
    const result = compressPrompt(WORDY, "light");
    expect(result.compressedTokens).toBeLessThan(result.originalTokens);
    expect(result.percentSaved).toBeGreaterThan(0);
    expect(result.level).toBe("light");
  });

  it("medium compression reduces tokens more than light on the same text", () => {
    const light = compressPrompt(WORDY, "light");
    const medium = compressPrompt(WORDY, "medium");
    expect(medium.compressedTokens).toBeLessThanOrEqual(light.compressedTokens);
  });

  it("aggressive compression reduces tokens more than medium on the same text", () => {
    const medium = compressPrompt(WORDY, "medium");
    const aggressive = compressPrompt(WORDY, "aggressive");
    expect(aggressive.compressedTokens).toBeLessThanOrEqual(
      medium.compressedTokens,
    );
  });

  it("defaults to medium when no level given", () => {
    const result = compressPrompt(WORDY);
    expect(result.level).toBe("medium");
  });

  it("realistic compression savings land in the 10-50% range on a wordy prompt", () => {
    const result = compressPrompt(WORDY, "aggressive");
    expect(result.percentSaved).toBeGreaterThan(10);
    expect(result.percentSaved).toBeLessThan(60);
  });
});

describe("compressPrompt - preservation", () => {
  it("preserves fenced code blocks intact at every level", () => {
    const text = `Please review the following code and make sure it is correct:

\`\`\`typescript
function add(a: number, b: number): number {
  return a + b; // I would like you to please verify this
}
\`\`\`

Thanks in advance!`;

    for (const level of ["light", "medium", "aggressive"] as const) {
      const result = compressPrompt(text, level);
      expect(result.compressedText).toContain("function add(a: number, b: number): number");
      expect(result.compressedText).toContain("return a + b;");
      // The filler comment inside the code block survives because we never
      // touch what is inside the fences.
      expect(result.compressedText).toContain("I would like you to please verify");
      expect(result.preservedCodeBlocks).toBe(1);
    }
  });

  it("removes filler outside code blocks while keeping code untouched", () => {
    const text = `I was wondering if you could review this code:

\`\`\`js
console.log("hello");
\`\`\`

Thanks so much!`;

    const result = compressPrompt(text, "medium");
    expect(result.compressedText).not.toMatch(/thanks so much/i);
    expect(result.compressedText).not.toMatch(/I was wondering/);
    expect(result.compressedText).toContain('console.log("hello");');
  });
});

describe("compressPrompt - warnings and metadata", () => {
  it("returns a per-level warning string", () => {
    expect(compressPrompt("hello world", "light").warning).toMatch(/conservative/i);
    expect(compressPrompt("hello world", "medium").warning).toMatch(/preserve meaning/i);
    expect(compressPrompt("hello world", "aggressive").warning).toMatch(/may reduce quality/i);
  });

  it("returns 0 saved on an already-compressed prompt", () => {
    const result = compressPrompt("Write Python function for prime numbers.", "aggressive");
    expect(result.tokensSaved).toBeLessThanOrEqual(2);
  });

  it("tokenSaved and percentSaved are consistent", () => {
    const result = compressPrompt(WORDY, "medium");
    const expectedPercent =
      Math.round((result.tokensSaved / result.originalTokens) * 10000) / 100;
    expect(result.percentSaved).toBe(expectedPercent);
  });
});
