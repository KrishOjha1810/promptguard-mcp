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

### Phase 1, scan-mcp MVP (the beachhead). IN PROGRESS.
Target: `npx @promptguardapp/mcp scan-mcp <config-or-server>`, fully local/offline.
Detections:
- Hardcoded secrets in MCP config files (reuse secret engine) [maps OWASP LLM06/Supply-Chain; GitGuardian: 24,008 secrets found in real MCP configs, 2,117 live]
- Tool-poisoning strings + hidden/invisible-unicode tricks in tool descriptions [LLM01 Prompt Injection, Agentic T2 Tool Misuse]
- FULL-SCHEMA scanning: every field (names, types, defaults, enums), not just description [counters Full-Schema Poisoning, CyberArk 2025]
- Tool name shadowing / collision across servers [Tool Shadowing, Invariant 2025]
Output: human-readable + SARIF (`--sarif`), requires NO account.
Demo: poisoned server in, PromptGuard catches it.

### Phase 2, rug-pull detection (signature). NOT STARTED.
Local pinning: hash each approved tool definition, alert on drift / re-prompt on change. The thing the local model does better than any cloud tool (spec makes list_changed a SHOULD-not-MUST, no integrity hash, no re-approval).

### Phase 3, adversarial test harness. NOT STARTED.
Integrate AgentDojo (arXiv:2406.13352) corpus; ship a curated MCP attack suite; begin the public reproducible benchmark.

### Phase 4, distribution + benchmark-as-marketing. NOT STARTED.
Claude Code hook integration, docs, public registry/leaderboard of scanned popular MCP servers.

### DEFERRED (not building now)
- Spend proxy and runtime dataflow enforcement. We do not become a key-holding proxy; it breaks local-first. Local soft-cap via the hook is the most we touch on spend.

---

## Open items / notes
- Pushing to GitHub (origin/main) is NOT done; awaits explicit user sign-off per standing rule. Local commits accumulate safely. Safety branch `backup-local-pre-merge` exists.
- npm shows 0.0.3 published; local is 0.0.4 with the hook + caveman work and now the merged rules. Republish is a separate user-gated step.
</content>
