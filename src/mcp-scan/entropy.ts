import { createHash } from "node:crypto";

// Entropy-based secret detection, layered ON TOP of the named-pattern regex
// engine to catch secrets it does not have a rule for: base64 blobs, hex
// dumps, random tokens from providers we do not list. High recall but lower
// precision than a named rule, so findings here are medium severity and can be
// suppressed per-project via an allowlist (the user marks a benign token once
// and it is never flagged again). Local, no network.

// Shannon entropy in bits per character.
export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

export function hashToken(token: string): string {
  return "sha256:" + createHash("sha256").update(token).digest("hex");
}

// Candidate tokens: contiguous runs of secret-shaped characters, long enough to
// matter. Base64/base64url/hex-ish body, with "=" allowed only as trailing
// base64 padding so a "key=" prefix is not merged into the token.
const TOKEN_RE = /[A-Za-z0-9+/_-]{20,}={0,2}/g;
const HEX_RE = /^[0-9a-fA-F]+$/;

export type EntropyFinding = {
  token: string;
  entropy: number;
  start: number;
  end: number;
  reason: string;
};

export type EntropyOptions = {
  // Token hashes the user has marked benign; suppressed from results.
  allowed?: Set<string>;
  // Minimum bits/char for a base64-like token to count (default 4.0).
  minEntropy?: number;
  // Minimum length (default 24).
  minLength?: number;
};

function looksLikeProse(token: string): boolean {
  // A run of letters with vowels in human ratios is probably a word, not a key.
  if (!/^[A-Za-z]+$/.test(token)) return false;
  const vowels = (token.match(/[aeiouAEIOU]/g) ?? []).length;
  return vowels / token.length > 0.25;
}

export function findHighEntropyTokens(text: string, opts: EntropyOptions = {}): EntropyFinding[] {
  const minEntropy = opts.minEntropy ?? 4.0;
  const minLength = opts.minLength ?? 24;
  const allowed = opts.allowed;
  const out: EntropyFinding[] = [];

  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    const token = m[0];
    if (token.length < minLength) continue;
    if (looksLikeProse(token)) continue;
    if (allowed && allowed.has(hashToken(token))) continue;

    const h = shannonEntropy(token);
    // Hex needs a lower bar (16-symbol alphabet caps entropy near 4.0).
    const isHex = HEX_RE.test(token);
    const threshold = isHex ? 3.2 : minEntropy;
    if (h >= threshold) {
      out.push({
        token,
        entropy: Math.round(h * 100) / 100,
        start: m.index,
        end: m.index + token.length,
        reason: isHex
          ? `high-entropy hex string (${token.length} chars, ${h.toFixed(2)} bits/char)`
          : `high-entropy token (${token.length} chars, ${h.toFixed(2)} bits/char)`,
      });
    }
  }
  return out;
}
