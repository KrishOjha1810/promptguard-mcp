# PromptGuard , the pitch (send this to the team)

Hey, I want to show you a project I've been building and pitch you on where I want to take it.
Read this, then tell me if you're in.

## What I already built (this part is real and shipped)

It's called PromptGuard. You can run it right now: `npx -y @promptguardapp/mcp`.

It's a local-first security tool for working with AI, nothing ever leaves your machine, zero
telemetry. It sits between you and the AI and scans what you're about to send. One engine, shipped
three ways: as an MCP server (Claude Code, Cursor, Cline, Windsurf, Continue), a browser extension,
and a VS Code extension.

Today it:
- Catches secrets before you leak them (AWS, GitHub, OpenAI, Anthropic, Stripe keys, DB connection
  strings, JWTs, and more).
- Catches personal data, including India-specific (Aadhaar with the real checksum, PAN, GSTIN, UPI, IFSC).
- Tells you what a prompt will cost before you send it, and can compress prompts to save tokens.
- It has a real test suite. It is engineered properly, not a hack.

So this is not an idea on a napkin. It is a working, shipped product with a real engine.

## Then I went deep on the market, and realized this is bigger than I thought

Everyone is racing to build AI agents now, AI that does not just chat, it acts: reads files, runs
commands, and plugs into external "tools" over a new standard called MCP (think USB for AI tools,
Anthropic, OpenAI, and Google all adopted it).

The scary part I dug into: people install these MCP tools like they installed random npm packages in
2019, with zero checking. A malicious tool can hijack your agent through hidden instructions. There
were 30 security bugs found in MCP in 60 days. Anthropic had to patch its own tool for this. And
developers commit their API keys straight into MCP config files, one scan found 24,000 of them.

Nobody is guarding this for the everyday developer. That is the opening.

## The honest part (and why this is actually our shot)

The big enterprise version of this is already taken. Snyk (the big security company) bought the team
that pioneered it and shipped a heavy enterprise product. We are not going to beat Snyk at the
enterprise game, and we are not going to try.

But here is the thing: Snyk, and every big competitor, requires you to create a cloud account and
send your data to their servers. That is their business model, they cannot be the tool that needs no
account and sends nothing anywhere. That is the exact gap we already own. PromptGuard is local-first,
no signup, runs on your laptop.

And that is literally how Snyk itself won years ago: not top-down through big companies, but
bottom-up, by being the tool individual developers loved and installed themselves. We do to Snyk what
Snyk did to the giants before it. Start where the big player structurally cannot follow.

## So here is what we build

One killer command: `scan-mcp`, "scan any MCP tool before you install it, locally, free."

- Start with secrets-in-configs (we already have the engine, real numbers behind it, ships in days).
- Scan the full tool definition for hidden poisoning and injection tricks, not just the surface.
- Our signature feature: rug-pull detection. It remembers each tool you approved and screams if a
  tool silently changes itself later, the sneakiest attack, and something a local tool on your
  machine does better than any cloud product. This is our edge.

The demo sells itself: feed it a poisoned MCP server, watch PromptGuard catch it. Shareable, viral.

## Why I want you, and why now

- We have a head start: a working engine and real distribution into Claude Code, while competitors
  building this start from zero.
- We are developers building a tool for developers, the best kind to build, because we are the user.
- The window is open: the tooling is 12-18 months behind how fast agents exploded. Small and fast wins.

## Where my head is at

I am thinking big. I genuinely believe this can become the default way developers check what their AI
plugs into, the standard. And I am honest with myself too: even if it just ends up a great
open-source project that thousands of developers use, that is already a win and one of the best
things any of us will have built. Aim high, start narrow, let the developers decide how far it goes.
I just want to start.

## The ask

I am not asking you to quit anything. I am asking: build the first version with me over the next
couple of weekends and let's see if it has legs. If you are in, I will walk you through the full
plan: how we phase the build, who owns what, and how we split it across the team.

You in?
