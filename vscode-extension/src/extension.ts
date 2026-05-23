import * as vscode from "vscode";
import { scanText } from "../../src/detectors/secrets.js";
import type { Finding, Severity } from "../../src/types.js";

const SCAN_DEBOUNCE_MS = 300;

let diagnostics: vscode.DiagnosticCollection;
let statusBar: vscode.StatusBarItem;

// Findings that the user has explicitly chosen to ignore for the current
// session, keyed by document URI. Cleared when VS Code restarts.
const ignoredByUri = new Map<string, Set<string>>();

// Pending debounced scans keyed by URI so each document has its own timer.
const debouncedTimers = new Map<string, ReturnType<typeof setTimeout>>();

function severityToVSCode(s: Severity): vscode.DiagnosticSeverity {
  switch (s) {
    case "critical":
      return vscode.DiagnosticSeverity.Error;
    case "high":
      return vscode.DiagnosticSeverity.Warning;
    case "medium":
      return vscode.DiagnosticSeverity.Information;
    case "low":
    default:
      return vscode.DiagnosticSeverity.Hint;
  }
}

function findingSignature(f: Finding): string {
  return `${f.type}:${f.matched}`;
}

function findingsToDiagnostics(
  doc: vscode.TextDocument,
  findings: Finding[],
): vscode.Diagnostic[] {
  return findings.map((f) => {
    const range = new vscode.Range(
      doc.positionAt(f.start),
      doc.positionAt(f.end),
    );
    const message = `${f.rule}. ${f.explanation}`;
    const diag = new vscode.Diagnostic(
      range,
      message,
      severityToVSCode(f.severity),
    );
    diag.source = "PromptGuard";
    // Encode type:matched in the code so the ignore action can identify the
    // finding signature later. The display label remains the type.
    diag.code = {
      value: f.type,
      target: vscode.Uri.parse(
        `https://github.com/KrishOjha1810/promptguard-mcp#${f.type}`,
      ),
    };
    return diag;
  });
}

function updateStatusBar(count: number, doc?: vscode.TextDocument) {
  const cfg = vscode.workspace.getConfiguration("promptguard");
  if (!cfg.get<boolean>("showStatusBar", true)) {
    statusBar.hide();
    return;
  }
  if (count === 0) {
    statusBar.text = "$(shield) PromptGuard: clean";
    statusBar.backgroundColor = undefined;
    statusBar.tooltip = "No sensitive data detected in this document";
    statusBar.show();
    return;
  }
  statusBar.text = `$(warning) PromptGuard: ${count}`;
  statusBar.backgroundColor = new vscode.ThemeColor(
    "statusBarItem.warningBackground",
  );
  statusBar.tooltip = doc
    ? `${count} potential issue${count === 1 ? "" : "s"} in ${vscode.workspace.asRelativePath(doc.uri)}`
    : `${count} potential issues`;
  statusBar.show();
}

function scanDocument(doc: vscode.TextDocument) {
  if (doc.uri.scheme !== "file" && doc.uri.scheme !== "untitled") return;

  const text = doc.getText();
  const result = scanText(text);

  const ignored = ignoredByUri.get(doc.uri.toString()) ?? new Set();
  const visible = result.findings.filter(
    (f) => !ignored.has(findingSignature(f)),
  );

  diagnostics.set(doc.uri, findingsToDiagnostics(doc, visible));

  const active = vscode.window.activeTextEditor;
  if (active && active.document.uri.toString() === doc.uri.toString()) {
    updateStatusBar(visible.length, doc);
  }
}

function scheduleScan(doc: vscode.TextDocument) {
  const key = doc.uri.toString();
  const existing = debouncedTimers.get(key);
  if (existing) clearTimeout(existing);
  debouncedTimers.set(
    key,
    setTimeout(() => {
      scanDocument(doc);
      debouncedTimers.delete(key);
    }, SCAN_DEBOUNCE_MS),
  );
}

function scanActiveDocument() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage(
      "PromptGuard: open a document first.",
    );
    return;
  }
  scanDocument(editor.document);
  const found = (diagnostics.get(editor.document.uri) ?? []).length;
  vscode.window.showInformationMessage(
    found === 0
      ? "PromptGuard: no sensitive data detected."
      : `PromptGuard: ${found} potential issue${found === 1 ? "" : "s"} flagged.`,
  );
}

function scanActiveSelection() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage(
      "PromptGuard: open a document first.",
    );
    return;
  }
  const sel = editor.selection;
  if (sel.isEmpty) {
    vscode.window.showInformationMessage(
      "PromptGuard: select some text first.",
    );
    return;
  }
  const text = editor.document.getText(sel);
  const result = scanText(text);
  if (result.findings.length === 0) {
    vscode.window.showInformationMessage(
      "PromptGuard: no sensitive data in this selection.",
    );
    return;
  }
  const summary = result.findings
    .map(
      (f, i) =>
        `${i + 1}. [${f.severity.toUpperCase()}] ${f.rule}: ${f.explanation}`,
    )
    .join("\n\n");
  vscode.window.showWarningMessage(
    `PromptGuard found ${result.findings.length} issue${result.findings.length === 1 ? "" : "s"}:\n\n${summary}`,
    { modal: true },
  );
}

async function redactAllInActiveDocument() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const doc = editor.document;
  const text = doc.getText();
  const result = scanText(text);

  const ignored = ignoredByUri.get(doc.uri.toString()) ?? new Set();
  const targets = result.findings.filter(
    (f) => !ignored.has(findingSignature(f)),
  );

  if (targets.length === 0) {
    vscode.window.showInformationMessage("PromptGuard: nothing to redact.");
    return;
  }

  const edit = new vscode.WorkspaceEdit();
  // Sort descending by start so applying edits does not shift earlier offsets
  const sorted = [...targets].sort((a, b) => b.start - a.start);
  for (const f of sorted) {
    const range = new vscode.Range(doc.positionAt(f.start), doc.positionAt(f.end));
    edit.replace(doc.uri, range, `[REDACTED:${f.type}]`);
  }

  await vscode.workspace.applyEdit(edit);
  vscode.window.showInformationMessage(
    `PromptGuard: redacted ${targets.length} finding${targets.length === 1 ? "" : "s"}.`,
  );
}

class PromptGuardCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    doc: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    for (const diag of context.diagnostics) {
      if (diag.source !== "PromptGuard") continue;
      const code =
        typeof diag.code === "object" && diag.code !== null
          ? String((diag.code as { value: unknown }).value)
          : String(diag.code);

      // Redact action
      const redact = new vscode.CodeAction(
        `Redact this ${code}`,
        vscode.CodeActionKind.QuickFix,
      );
      redact.edit = new vscode.WorkspaceEdit();
      redact.edit.replace(doc.uri, diag.range, `[REDACTED:${code}]`);
      redact.diagnostics = [diag];
      redact.isPreferred = true;
      actions.push(redact);

      // Ignore action
      const matched = doc.getText(diag.range);
      const ignore = new vscode.CodeAction(
        `Ignore this ${code} for the session`,
        vscode.CodeActionKind.QuickFix,
      );
      ignore.command = {
        command: "promptguard.ignoreFinding",
        title: "Ignore",
        arguments: [doc.uri, code, matched],
      };
      ignore.diagnostics = [diag];
      actions.push(ignore);
    }
    return actions;
  }
}

export function activate(context: vscode.ExtensionContext) {
  diagnostics = vscode.languages.createDiagnosticCollection("promptguard");
  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBar.command = "promptguard.scanDocument";

  context.subscriptions.push(diagnostics, statusBar);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "promptguard.scanDocument",
      scanActiveDocument,
    ),
    vscode.commands.registerCommand(
      "promptguard.scanSelection",
      scanActiveSelection,
    ),
    vscode.commands.registerCommand(
      "promptguard.redactAllInDocument",
      redactAllInActiveDocument,
    ),
    vscode.commands.registerCommand("promptguard.clearDiagnostics", () => {
      diagnostics.clear();
      updateStatusBar(0);
      vscode.window.showInformationMessage(
        "PromptGuard: all markers cleared.",
      );
    }),
    vscode.commands.registerCommand(
      "promptguard.ignoreFinding",
      (uri: vscode.Uri, type: string, matched: string) => {
        const key = uri.toString();
        let set = ignoredByUri.get(key);
        if (!set) {
          set = new Set();
          ignoredByUri.set(key, set);
        }
        set.add(`${type}:${matched}`);
        const doc = vscode.workspace.textDocuments.find(
          (d) => d.uri.toString() === key,
        );
        if (doc) scanDocument(doc);
      },
    ),
  );

  // Code Actions provider
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { scheme: "file" },
      new PromptGuardCodeActionProvider(),
      { providedCodeActionKinds: PromptGuardCodeActionProvider.providedCodeActionKinds },
    ),
    vscode.languages.registerCodeActionsProvider(
      { scheme: "untitled" },
      new PromptGuardCodeActionProvider(),
      { providedCodeActionKinds: PromptGuardCodeActionProvider.providedCodeActionKinds },
    ),
  );

  // Auto-scan on open
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      const cfg = vscode.workspace.getConfiguration("promptguard");
      if (cfg.get<boolean>("scanOnOpen", true)) {
        scanDocument(doc);
      }
    }),
  );

  // Re-scan on save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const cfg = vscode.workspace.getConfiguration("promptguard");
      if (cfg.get<boolean>("scanOnSave", true)) {
        scanDocument(doc);
      }
    }),
  );

  // Debounced live scan on edit
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const cfg = vscode.workspace.getConfiguration("promptguard");
      if (!cfg.get<boolean>("scanOnEdit", true)) return;
      scheduleScan(event.document);
    }),
  );

  // Update status bar when active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) {
        statusBar.hide();
        return;
      }
      const existing = diagnostics.get(editor.document.uri) ?? [];
      updateStatusBar(existing.length, editor.document);
    }),
  );

  // Scan any already-open documents on activation
  for (const doc of vscode.workspace.textDocuments) {
    scanDocument(doc);
  }
}

export function deactivate() {
  for (const timer of debouncedTimers.values()) clearTimeout(timer);
  debouncedTimers.clear();
  diagnostics?.dispose();
  statusBar?.dispose();
}
