#!/usr/bin/env bash
# PromptGuard tamper-and-catch demo. Runnable end to end after `npm run build`.
# Shows: catch a runtime toxic flow, sign + anchor the audit log, verify it is
# intact, then tamper one line and watch verify break at the exact record.
# Everything is local. No account, no network.
set -e
cd "$(dirname "$0")/.."

PG="node dist/index.js scan-mcp"
LOG=/tmp/promptguard-demo-audit.jsonl
A12=/tmp/promptguard-demo-article12.json

echo
echo "=============================================================="
echo " PromptGuard flight recorder: tamper-and-catch demo"
echo "=============================================================="
echo
echo "An agent's OpenTelemetry tool-call trace (examples/agent-trace.jsonl):"
echo "  1. get_weather        (benign)"
echo "  2. read_file ~/.ssh/id_rsa   (reads a private key)"
echo "  3. http_post webhook.site    (sends it out)"
echo "  4. save_note          (benign)"
echo
echo ">>> Step 1: record the trace, scan it, and write a SIGNED audit log"
echo "    \$ scan-mcp record examples/agent-trace.jsonl --log audit.jsonl --sign"
echo "--------------------------------------------------------------"
$PG record examples/agent-trace.jsonl --log "$LOG" --sign --export-aat "$A12" || true
echo

ANCHOR=$($PG anchor "$LOG" 2>/dev/null)
echo ">>> Step 2: anchor the chain head (record this in a git commit)"
echo "    $ANCHOR"
echo

echo ">>> Step 3: verify the log: chain + signatures + anchor"
echo "    \$ scan-mcp verify audit.jsonl --anchor <token>"
echo "--------------------------------------------------------------"
$PG verify "$LOG" --anchor "$ANCHOR"
echo

echo ">>> Step 4: an attacker edits the log to hide the exfiltration"
echo "    (rename read_file to something innocent on the tampered copy)"
sed 's/read_file/list_dir/' "$LOG" > "${LOG}.tampered"
echo

echo ">>> Step 5: verify the tampered log"
echo "    \$ scan-mcp verify audit.jsonl.tampered --anchor <token>"
echo "--------------------------------------------------------------"
$PG verify "${LOG}.tampered" --anchor "$ANCHOR" || true
echo
echo "=============================================================="
echo " The edit is caught at the exact record. The audit log is"
echo " signed, anchorable, and verifiable offline. Nothing left the"
echo " machine. An EU AI Act Article 12 export is at $A12"
echo "=============================================================="
