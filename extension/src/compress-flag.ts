import { compressPrompt, type CompressionLevel } from "../../src/compress.js";

// A prompt that opts into compression starts with one of these flags. The flag
// is stripped before anything is sent; the rest of the prompt is compressed and
// the shortened version is what actually goes to the model.
//
//   pg <prompt>            -> safe compression (medium): filler, hedging, fluff
//   pg! <prompt>           -> caveman: strips ALL articles, telegraphic, lossy
//   promptguard <prompt>   -> alias for the safe level
//   prompt-guard <prompt>  -> alias for the safe level
//
// pg! is deliberately a separate, louder flag: caveman can shift meaning, so it
// should never be reachable from the everyday "pg" trigger by accident.
const FLAGS: { re: RegExp; level: CompressionLevel }[] = [
  { re: /^\s*pg!\s+/i, level: "caveman" },
  { re: /^\s*(pg|prompt-?guard)\s+/i, level: "medium" },
];

export interface FlagMatch {
  level: CompressionLevel;
  /** the prompt with the leading flag removed */
  body: string;
  /** the literal flag text that matched, trimmed (e.g. "pg", "pg!") */
  flag: string;
}

export function parseCompressFlag(text: string): FlagMatch | null {
  for (const { re, level } of FLAGS) {
    const m = text.match(re);
    if (m) return { level, body: text.slice(m[0].length), flag: m[0].trim() };
  }
  return null;
}

export interface CompressOutcome {
  level: CompressionLevel;
  /** the text that should actually be sent to the model */
  sentText: string;
  /** the user's prompt with the flag stripped, before compression */
  originalBody: string;
  tokensSaved: number;
  percentSaved: number;
}

/**
 * If `text` opens with a compression flag, return what should be sent in its
 * place. Returns null when there is no flag, or when the flag has no body to
 * compress (so a bare "pg " is treated as ordinary text, not a trigger).
 */
export function compressForSend(text: string): CompressOutcome | null {
  const flag = parseCompressFlag(text);
  if (!flag) return null;
  if (!flag.body.trim()) return null;

  const result = compressPrompt(flag.body, flag.level);
  return {
    level: flag.level,
    sentText: result.compressedText,
    originalBody: flag.body,
    tokensSaved: result.tokensSaved,
    percentSaved: result.percentSaved,
  };
}
