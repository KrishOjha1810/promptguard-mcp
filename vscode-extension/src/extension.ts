import * as vscode from "vscode";
import { scanText } from "../../src/detectors/secrets.js";
import type { Finding, Severity } from "../../src/types.js";

let diagnostics: vscode.DiagnosticCollection;
let statusBar: vscode.StatusBarItem;

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
    diag.code = f.type;
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
  // Skip git diff buffers, output panels, and other virtual schemes
  if (doc.uri.scheme !== "file" && doc.uri.scheme !== "untitled") {
    return;
  }
  const text = doc.getText();
  const result = scanText(text);
  diagnostics.set(doc.uri, findingsToDiagnostics(doc, result.findings));
  if (
    vscode.window.activeTextEditor &&
    vscode.window.activeTextEditor.document.uri.toString() ===
      doc.uri.toString()
  ) {
    updateStatusBar(result.findings.length, doc);
  }
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
    .join("\n");
  vscode.window.showWarningMessage(
    `PromptGuard found ${result.findings.length} issue${result.findings.length === 1 ? "" : "s"}:\n${summary}`,
    { modal: true },
  );
}

export function activate(context: vscode.ExtensionContext) {
  diagnostics = vscode.languages.createDiagnosticCollection("promptguard");
  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBar.command = "promptguard.scanDocument";

  context.subscriptions.push(diagnostics, statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "promptguard.scanDocument",
      scanActiveDocument,
    ),
    vscode.commands.registerCommand(
      "promptguard.scanSelection",
      scanActiveSelection,
    ),
    vscode.commands.registerCommand("promptguard.clearDiagnostics", () => {
      diagnostics.clear();
      updateStatusBar(0);
      vscode.window.showInformationMessage(
        "PromptGuard: all markers cleared.",
      );
    }),
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
  diagnostics?.dispose();
  statusBar?.dispose();
}
