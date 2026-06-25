import { describe, it, expect } from "vitest";
import {
  parseCompressFlag,
  compressForSend,
} from "../src/compress-flag.js";

describe("parseCompressFlag", () => {
  it("recognizes the safe `pg ` flag and strips it", () => {
    const m = parseCompressFlag("pg Could you please summarize this article");
    expect(m).not.toBeNull();
    expect(m?.level).toBe("medium");
    expect(m?.body).toBe("Could you please summarize this article");
  });

  it("recognizes the louder `pg! ` flag as caveman", () => {
    const m = parseCompressFlag("pg! write the function");
    expect(m?.level).toBe("caveman");
    expect(m?.body).toBe("write the function");
  });

  it("does not treat `pg!` as the safe `pg` flag", () => {
    // pg! must map to caveman, never accidentally to medium.
    expect(parseCompressFlag("pg! x")?.level).toBe("caveman");
  });

  it("accepts the promptguard / prompt-guard aliases", () => {
    expect(parseCompressFlag("promptguard do the thing")?.level).toBe("medium");
    expect(parseCompressFlag("prompt-guard do the thing")?.level).toBe(
      "medium",
    );
  });

  it("is case-insensitive and tolerates leading space", () => {
    expect(parseCompressFlag("  PG hello there")?.body).toBe("hello there");
  });

  it("returns null when there is no flag", () => {
    expect(parseCompressFlag("just a normal prompt")).toBeNull();
  });

  it("does not fire on a word that merely starts with pg", () => {
    // "pgadmin" should not be read as the flag "pg".
    expect(parseCompressFlag("pgadmin config help")).toBeNull();
  });
});

describe("compressForSend", () => {
  it("returns the compressed text for a flagged prompt", () => {
    const wordy =
      "pg Could you please write a function that validates the email addresses in the list";
    const out = compressForSend(wordy);
    expect(out).not.toBeNull();
    expect(out?.sentText.length).toBeLessThan(wordy.length);
    // The flag itself must never reach the model.
    expect(out?.sentText.toLowerCase().startsWith("pg ")).toBe(false);
    expect(out?.sentText).not.toMatch(/please/i);
  });

  it("caveman flag strips articles globally", () => {
    const out = compressForSend("pg! summarize the report and the appendix");
    expect(out?.level).toBe("caveman");
    expect(out?.sentText).not.toMatch(/\bthe\b/i);
  });

  it("returns null for a bare flag with no body to compress", () => {
    expect(compressForSend("pg ")).toBeNull();
    expect(compressForSend("pg!   ")).toBeNull();
  });

  it("returns null (sends normally) when there is no flag", () => {
    expect(compressForSend("normal prompt with no flag")).toBeNull();
  });

  it("reports tokens saved", () => {
    const out = compressForSend(
      "pg I would really appreciate it if you could just basically explain this to me",
    );
    expect(out?.tokensSaved).toBeGreaterThan(0);
  });
});
