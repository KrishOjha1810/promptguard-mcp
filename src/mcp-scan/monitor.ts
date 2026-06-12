import { collectTools, comparePins, type ToolPin } from "./pinning.js";
import type { McpDocument, McpFinding } from "./types.js";

// The continuous monitor keeps a single persistent store of every tool
// definition ever approved, across all of a developer's MCP configs. On each
// run it auto-pins anything new (silently, no noise on first sight) and diffs
// anything seen before (surfacing rug-pulls). Keys are namespaced by config
// path so the same tool name in two configs does not collide.

export type MonitorStore = {
  version: number;
  tool: string;
  pins: Record<string, ToolPin>; // key: "<configPath>::<toolKey>"
};

export function emptyStore(): MonitorStore {
  return { version: 1, tool: "promptguard-monitor", pins: {} };
}

export type MonitorResult = {
  findings: McpFinding[];
  newlyPinned: number;
  store: MonitorStore;
};

// Run one monitoring pass over a set of parsed configs against the store.
// Returns drift findings (empty on first sight of everything), the count of
// newly auto-pinned tools, and the updated store to persist.
export function runMonitor(
  configs: { path: string; doc: McpDocument }[],
  store: MonitorStore,
): MonitorResult {
  const findings: McpFinding[] = [];
  let newlyPinned = 0;
  const updated: MonitorStore = { ...store, pins: { ...store.pins } };

  for (const { path, doc } of configs) {
    for (const t of collectTools(doc)) {
      const nsKey = `${path}::${t.key}`;
      const prev = updated.pins[nsKey];
      if (!prev) {
        // First time we have seen this tool: auto-pin, stay silent.
        updated.pins[nsKey] = t.pin;
        newlyPinned++;
        continue;
      }
      // Seen before: diff it. Any drift surfaces; on a real change we also
      // advance the pin to the new definition so the user is not nagged twice
      // for the same already-surfaced change.
      const drift = comparePins(prev, t.pin);
      if (drift.length > 0) {
        findings.push(...drift.map((f) => ({ ...f, location: `${path} :: ${f.location}` })));
        updated.pins[nsKey] = t.pin;
      }
    }
  }

  return { findings, newlyPinned, store: updated };
}
