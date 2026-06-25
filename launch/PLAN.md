# PromptGuard , product plan

## Vision
The local-first, no-account security tool for the AI-agent era. It runs on your machine, nothing
leaves it, and it guards the dangerous stuff crossing the line between your code and your AI: leaked
secrets, poisoned tools, and silent tool changes. We start as the tool individual developers install
themselves and love, and grow up from there.

## Strategy (how we win)
The enterprise version of agent security is owned by Snyk (they bought Invariant Labs and shipped the
static-scan + CI-gate + runtime triple to 300+ enterprise accounts). We do NOT fight them there.

Every big competitor (Snyk, GitGuardian, Cisco) requires a cloud account and sends your data to their
servers, that is their business model, so they structurally cannot be the no-account, nothing-leaves-
your-machine tool. That is our gap, and we already have it. We go bottom-up, developer-first, exactly
how Snyk itself beat the incumbents before it. Aim big, start narrow, let developer love pull us up.

## What we already have (the head start)
A local-first, zero-telemetry scan engine (TypeScript), shipped as an MCP server (Claude Code, Cursor,
Cline, Windsurf, Continue), a browser extension, and a VS Code extension. Detects secrets and PII
(incl India-specific), estimates cost, optimizes/compresses prompts. Real test suite. `npx`-installable,
runs as a Claude Code hook. We reuse this engine for the new product, so we start at V2.

## What we build (scoped)
A new local command: `scan-mcp`, "scan any MCP server before you install it, locally, free."

IN (build now):
1. Secrets-in-MCP-config (beachhead) , 24,008 found in the wild, 2,117 live. We have the engine. Days.
2. Full-schema static scan , poisoning/hidden instructions across EVERY field (names, types, defaults),
   not just description.
3. Tool shadowing / name-collision detection across servers.
4. Invisible-unicode / homoglyph trick detection.
5. Rug-pull detection (signature) , pin a hash of each approved tool definition locally, alert on
   silent change. A local tool does this better than any cloud snapshot.
6. Output: human-readable + SARIF (drops into CI), but requires NO account.

DEFERRED (do not build yet):
- The spend proxy / runtime dataflow enforcement. Real spend enforcement means becoming a proxy that
  holds everyone's API keys, a heavier, higher-liability, different company that breaks local-first.
  Most we touch on spend now is a local soft-cap via the hook.

## The moat (for a small team)
1. Be the OSS benchmark , own the canonical public test corpus + a leaderboard/registry of scanned
   popular MCP servers. When "did it pass PromptGuard" is the thing people check, we are the standard.
   It doubles as marketing.
2. Local-first brand + existing distribution (Claude Code hook, MCP, npx). Competitors cannot copy
   "the no-account local tool" without abandoning their business model.

## Build plan (ship value every phase)
- Phase 0: Reconcile the two diverged repos into one canonical, green baseline. (Lead: Krish)
- Phase 1: `scan-mcp` MVP , secrets-in-config + full-schema scan + poisoning/shadowing/unicode +
  SARIF. A viral "poisoned server caught" demo. (All hands)
- Phase 2: Rug-pull detection (local pinning + drift alerts), the signature. (Harness lane + Krish)
- Phase 3: Adversarial test harness (AgentDojo) + seed the public benchmark corpus. (Harness + Detection)
- Phase 4: Distribution , tight Claude Code hook, docs, the public leaderboard/registry site. (Web/GTM + CLI)

Rule: each phase ends with code + tests green + a working demo before the next begins.
Map detections to OWASP LLM Top 10 / Agentic T1-T15; reference the MCP Top 10 as "emerging".

## Who does what
- Krish (lead): architect + core engine + all code review/merges + protect the local-first identity.
- Detection & security research: rule taxonomy, OWASP mapping, false-positive quality.
- CLI / packaging / distribution: the `scan-mcp` command, SARIF, hook, npm, CI.
- Adversarial harness + rug-pull: AgentDojo, attack corpus, the pinning logic.
- Web demo + benchmark + users: landing/leaderboard site, demo, docs, and talking to the first
  20-50 developers from Phase 1 on.
One module = one owner = one branch; Krish merges everything. Each person drives their lane with
their own Claude Code session.

## Money (later, not now)
Open-core. Local CLI/hook is free forever (the distribution and the brand). Paid is only what needs a
server: shared team policy, a hosted registry of org-approved MCP servers, audit-log retention,
cross-team drift monitoring. Target ~$10-25/dev/month team tier later. No enterprise sales motion.

## Honest risks
- Snyk or the MCP spec absorbs basic scanning for free. -> counter with the benchmark, community,
  local-first brand, and the long tail of real servers.
- Buyer market is still early (mid-2026). -> serve individual developers now (free, bottom-up),
  monetize teams later. Do not bet the plan on enterprise demand existing today.
- Static scanning can give false confidence. -> sell as defense-in-depth, ship the adversarial
  harness, never claim "solved."

## One-liners
- Developer: "Run one command to scan any MCP server before you install it, fully local."
- Security person: "A local-first guard for what your AI agents plug into: poisoned tools, leaked
  secrets, silent rug-pulls."
- Investor (later): "Bottom-up developer-first MCP security. Snyk owns enterprise top-down; we own
  the no-account local layer they structurally cannot serve."
