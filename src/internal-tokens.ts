/**
 * Lightweight approximate token counter. Roughly 4 characters per token,
 * which matches what OpenAI publishes as a back-of-envelope rule. Good
 * enough for English-dominant prompts and decisions about prompt length,
 * not good enough for budgeting against real API bills.
 *
 * The MCP server's estimate_cost tool uses an exact tokenizer
 * (js-tiktoken in src/cost.ts) so cost estimates remain accurate. This
 * approximation is used internally by optimize_prompt and compress_prompt
 * for reporting tokens-saved deltas, and by the browser extension popup
 * to keep its bundle small.
 */
export type TokenCounter = (text: string) => number;

export const approxTokens: TokenCounter = (text) =>
  Math.ceil(text.length / 4);
