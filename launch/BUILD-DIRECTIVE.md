# Build directive (paste to the Claude Code session that will build it)

Decision made: we are building this. Start now and keep going autonomously.

AMBITION (the frame): We are building the best local-first, no-account MCP/agent security tool for
individual developers. We are NOT fighting Snyk head-on. We win bottom-up the way Snyk itself beat
the old AppSec incumbents: be the tool developers install themselves and love, where a top-down
cloud-account-required player structurally cannot follow, then grow up. Think big, this can become a
category-definer, and it is also fine if it ends up a great project. Aim high, start narrow, let
developer love pull us up.

EXECUTION RULES:
- Work in PHASES. Complete each phase fully (code + tests passing + a working demo) before starting
  the next. Ship something runnable at the end of every phase.
- Do NOT stop to check in between phases. Keep going. Only stop if you are COMPLETELY blocked (need
  a credential/decision only the owner can make). Even then, first try every reasonable workaround,
  and if you must stop, leave a clear STATUS note (what's done, what's blocked, exactly what's needed).
- Test before moving on. Never advance on red tests. Keep it shippable at all times.
- Identity/quality: commit as Krish Ojha (112157325+KrishOjha1810@users.noreply.github.com), local
  git config only. No AI attribution anywhere (no "Generated with", no Co-Authored-By, no robot
  emojis). No em-dashes/en-dashes/arrows in any file. Do not break PromptGuard's existing prompt-safety
  features, build MCP-security as additive capability on the existing engine.
- Keep a running PROGRESS.md (phase, what shipped, what's next) so it can be read anytime.

PHASE PLAN (refine if you find better, but keep the order: ship value early, defer heavy):
- Phase 0: Reconcile the canonical repo (Desktop v0.0.4 vs the diverged GitHub copy), pick one, get a
  clean green baseline. Decide where `scan-mcp` lives.
- Phase 1: `scan-mcp` MVP, the beachhead. `npx @promptguardapp/mcp scan-mcp <config-or-server>`, fully
  local/offline. Detect: hardcoded secrets in MCP config files (reuse the secret engine),
  tool-poisoning + hidden/invisible-unicode tricks, FULL-SCHEMA scanning (every field: names, types,
  defaults, not just description), tool name shadowing/collision across servers. Output human-readable
  + SARIF (drops into CI) but requires NO account. Tests. A scary, shareable demo: poisoned server in,
  PromptGuard catches it.
- Phase 2: Rug-pull detection (the signature). Pin a hash of each approved tool definition locally,
  alert on drift / re-prompt on change. The thing a local model does better than any cloud tool. Tests + demo.
- Phase 3: Adversarial test harness. Integrate AgentDojo (arXiv:2406.13352) as the corpus; ship a
  curated MCP attack suite the gate runs. Begin the OSS benchmark: a public, reproducible corpus.
- Phase 4: Distribution + benchmark-as-marketing. Tight Claude Code hook integration, clean docs, and
  a public registry/leaderboard of scanned popular MCP servers.
- DEFER (do not build now): the spend proxy and runtime dataflow enforcement. We are not becoming a
  key-holding proxy, it breaks local-first. A local soft-cap via the hook is the most we touch on spend.

Map detections to OWASP LLM Top 10 / Agentic T1-T15; reference the MCP Top 10 as "emerging" (it is a
beta incubator list, not settled). Start with Phase 0 now, then keep moving through the phases. Report
only via PROGRESS.md unless you hit a true blocker.
