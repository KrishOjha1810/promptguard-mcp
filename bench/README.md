# PromptGuard MCP Security Benchmark

A reproducible, local corpus of MCP attack cases and benign controls. Every case is data: a small MCP document plus an expectation. The goal is a public, version-controlled standard that anyone can run and contribute to.

Inspired by [AgentDojo](https://arxiv.org/abs/2406.13352) (NeurIPS 2024), which models prompt-injection attacks and defenses as evaluable cases rather than prose.

## Run it

```bash
npm run build
node dist/index.js scan-mcp bench
# or, after install:
npx @promptguardapp/mcp scan-mcp bench
```

Exit code is 0 only when recall is 100 percent on malicious cases and there are zero false positives on benign controls. So this doubles as a regression gate: a rule change that breaks detection or starts over-flagging fails the build.

## How scoring works

- **Malicious cases** (`"malicious": true`) must produce a finding matching the `expect` clause (a `category` and optionally a `ruleId`). If `expect` is omitted, any finding at high or critical counts.
- **Benign controls** (`"malicious": false`) must produce no finding at or above medium. These exist to keep false positives honest; rules that over-trigger get caught here.
- **Rug-pull cases** include a `pin` baseline document; the runner pins it, then scans the mutated `doc` and checks for drift findings.

## Corpus format

`corpus.json` holds a `cases` array. Each case:

```json
{
  "id": "tp-001",
  "title": "Instruction override in tool description",
  "provenance": "Invariant Labs tool poisoning, 2025-04-01",
  "malicious": true,
  "expect": { "category": "tool_poisoning", "ruleId": "instruction_override" },
  "doc": { "tools": [ { "name": "...", "description": "..." } ] }
}
```

`pin` (optional) is a baseline document for rug-pull cases.

## Coverage today

Attack classes represented: tool poisoning (instruction override, hide-from-user, embedded directive tags, exfiltration, cross-tool redirection), full-schema poisoning, hidden unicode, hardcoded secrets in config, tool-name shadowing, and rug-pull (post-approval mutation). Benign controls deliberately probe false-positive edges (a legitimate file reader, the word "instructions" used benignly, an env placeholder that is not a real secret).

Each case maps to OWASP LLM Top 10 (LLM01, LLM03, LLM06) and OWASP Agentic Threats (T2, T3, T6). The OWASP MCP Top 10 is referenced as emerging (beta incubator list).

## Contributing a case

Add an object to `cases` with a real provenance (a paper, a CVE, a disclosed incident) and an `expect` clause. Run `scan-mcp bench`. If your malicious case is missed, that is a real detection gap worth a rule; if a benign control trips, that is a false positive worth fixing. Both are valuable contributions.
