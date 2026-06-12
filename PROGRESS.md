# PromptGuard, MCP-Security Build Progress

Ambition: the best local-first, no-account MCP/agent security tool for individual developers. Not fighting Snyk top-down; winning bottom-up where a cloud-account-required player structurally cannot follow. MCP-security is additive on the existing prompt-safety engine.

Detections map to OWASP LLM Top 10 (LLM01-LLM10) and OWASP Agentic Threats (T1-T15). The "OWASP MCP Top 10" is referenced as emerging (beta incubator list, not settled).

---

## Phase status

### Phase 0, reconcile + green baseline. DONE.
- One canonical repo: `/Users/krishojha/Desktop/promptguard`. No second copy existed; the "diverged GitHub copy" was a real git divergence between local and origin.
- Local had: caveman compression, hook optimize suggestions, tiered-blocking hook (env-var configurable).
- Origin had: +4 secret rules (DB connection strings, JWT, Slack webhook, SendGrid), Opus 4.8 pricing, version-from-package.json, improved README.
- Reconciled by merging origin into local taking the union. No conflicts (different files). Both feature sets retained.
- Baseline: 17 secret rules + 10 PII rules, 84 tests passing, build clean.
- Git identity set local-only: Krish Ojha <112157325+KrishOjha1810@users.noreply.github.com>.

**scan-mcp lives here (decision):** new module `src/mcp-scan/` (MCP definition scanning), kept separate from `src/detectors/` (prompt-text scanning) but REUSES the secret engine for config-secret detection. Exposed three ways:
1. CLI bin `promptguard-scan-mcp` -> `dist/mcp-scan/cli.js`
2. `dist/index.js` branches on `argv[2] === "scan-mcp"` so `npx @promptguardapp/mcp scan-mcp <x>` works
3. (later phase) an MCP tool `scan_mcp_config`

### Phase 1, scan-mcp MVP (the beachhead). DONE.
Shipped `src/mcp-scan/` (scanner, poisoning-rules, sarif, cli, bin, types). Reuses the secret engine for config scanning. Runnable three ways:
- `node dist/index.js scan-mcp <file>` (subcommand branch on the default entry)
- `promptguard-scan-mcp` bin
- `npx @promptguardapp/mcp scan-mcp <file>` after publish
Detections live: secrets in config (env/args/url, with overlap dedupe), tool-poisoning (6 rules: instruction-override, hide-from-user, embedded directive tags, exfiltration, cross-tool redirection, imperative-to-model), hidden/invisible unicode (zero-width, bidi, tag chars), full-schema walk (every field incl. nested defaults/keys), tool-name shadowing across servers. Output: human-readable + `--sarif` (2.1.0) + `--json`. `--fail-on <level>` for CI gate (default high), exit 1 on gate failure. `--stdin` supported. No account, no network.
Demo: `examples/poisoned-mcp-server.json` -> 3 critical + 2 high (DB secret, hide-from-user, exfiltration, cross-tool redirection, name collision). Exit 1.
Tests: 11 new (95 total), all green. Maps to OWASP LLM01/LLM06 and Agentic T2/T3/T6.

Known refinement (not blocking): poisoning rules are static regex; dynamic injection via tool OUTPUTS and rug-pull are Phase 2/3+ and runtime, by design.

### Phase 1 (historical detail)
Target: `npx @promptguardapp/mcp scan-mcp <config-or-server>`, fully local/offline.
Detections:
- Hardcoded secrets in MCP config files (reuse secret engine) [maps OWASP LLM06/Supply-Chain; GitGuardian: 24,008 secrets found in real MCP configs, 2,117 live]
- Tool-poisoning strings + hidden/invisible-unicode tricks in tool descriptions [LLM01 Prompt Injection, Agentic T2 Tool Misuse]
- FULL-SCHEMA scanning: every field (names, types, defaults, enums), not just description [counters Full-Schema Poisoning, CyberArk 2025]
- Tool name shadowing / collision across servers [Tool Shadowing, Invariant 2025]
Output: human-readable + SARIF (`--sarif`), requires NO account.
Demo: poisoned server in, PromptGuard catches it.

### Phase 2, rug-pull detection (signature). DONE.
Local pinning in `src/mcp-scan/pinning.ts`. `scan-mcp pin <file>` writes `<file>.pglock` with a stable sha256 per tool definition (key-order-independent). A later `scan-mcp <file>` auto-loads the sibling lockfile (or `--lockfile <p>`) and emits drift findings: CHANGED definition = critical rug_pull (the signature), added = medium, removed = low. `--no-drift` to skip. This is the capability the local model does better than any cloud tool (the MCP spec makes list_changed a SHOULD-not-MUST with no integrity hash and no re-approval).
Demo: pin a clean server, mutate a tool, re-scan -> "Tool definition CHANGED since pin" critical, composing with the static poisoning rules. 4 new tests, 99 total, all green.

### Phase 3, adversarial test harness + benchmark. DONE.
Shipped `bench/corpus.json` (14 cases: 10 malicious across the attack taxonomy + 4 benign false-positive controls, each with provenance and an OWASP mapping) and `src/mcp-scan/bench.ts` (runner: recall on malicious, false-positive rate on benign). Exposed as `scan-mcp bench [corpus]`; exit 0 only at 100% recall and 0 false positives, so it is also a regression gate. `bench/README.md` documents the format and how to contribute, framed as the seed of a public OSS benchmark (inspired by AgentDojo, arXiv:2406.13352).
Building the corpus surfaced and fixed a real detection gap: the exfiltration rule matched only imperative verbs (read/send), not declarative (reads/sends); broadened to verb forms. Current: recall 100% (10/10), 0 false positives, 101 tests total, all green.

Note on AgentDojo: integrated as inspiration and format, not as a runtime pip dependency (keeps the tool local-first and dependency-light). AgentDojo-derived cases can be added to corpus.json directly.

### Phase 4, distribution + benchmark-as-marketing. DONE.
- README: new "MCP security: scan-mcp" section documenting scan, pin/rug-pull, SARIF/CI gate, bench, and the OWASP mapping. Distribution-facing.
- Registry leaderboard: `src/mcp-scan/registry.ts` + `scan-mcp registry <manifest>` scans a manifest of servers (local config/tools files) and renders a markdown safety leaderboard (BLOCKED/WARN/CLEAN). Seeded `registry/servers.json` (a clean control + the poisoned demo) and generated `REGISTRY.md`. This is the benchmark-as-marketing moat piece; real popular-server entries can be added by dropping their tools/list output into a local file.
- Claude Code SessionStart hook: `src/mcp-scan/session-hook.ts` + bin `promptguard-mcp-session-hook` scans known MCP config locations at session start and surfaces high/critical findings. Documented in README. NOT auto-installed into the user's settings.json (left as a documented opt-in to avoid surprising config changes; the existing prompt hook stays as-is).
- npm `files` now includes `bench/corpus.json` so `scan-mcp bench` works from an npx install.
Build + typecheck clean, 101 tests green.

## All four phases complete. Summary of what shipped
- scan-mcp: local MCP security scanner (secrets, tool poisoning, full-schema, hidden unicode, shadowing) with human/SARIF/JSON output and a CI gate.
- Rug-pull detection via local pinning (the signature, local-first advantage).
- Reproducible benchmark corpus + runner (regression gate, OSS-standard seed).
- Registry leaderboard generator + SessionStart hook + README docs.
Three CLI surfaces: `node dist/index.js scan-mcp ...`, `promptguard-scan-mcp`, `npx @promptguardapp/mcp scan-mcp ...`. Existing prompt-safety features untouched. 101 tests, all green.

### DEFERRED (not building now)
- Spend proxy and runtime dataflow enforcement. We do not become a key-holding proxy; it breaks local-first. Local soft-cap via the hook is the most we touch on spend.

---

## Open items / notes
- Pushing to GitHub (origin/main) is NOT done; awaits explicit user sign-off per standing rule. Local commits accumulate safely. Safety branch `backup-local-pre-merge` exists.
- npm shows 0.0.3 published; local is 0.0.4 with the hook + caveman work and now the merged rules. Republish is a separate user-gated step.
</content>
