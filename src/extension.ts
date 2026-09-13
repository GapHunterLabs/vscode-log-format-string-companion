import * as vscode from 'vscode';
import { scan } from './scanner';
import { recordHit } from './reviewPrompt';

let diagnostics: vscode.DiagnosticCollection;

const APPLICABLE_LANGUAGE_IDS = new Set(['java', 'kotlin', 'python']);
const APPLICABLE_EXTENSIONS = ['.java', '.kt', '.kts', '.py'];

function isApplicable(document: vscode.TextDocument): boolean {
  if (APPLICABLE_LANGUAGE_IDS.has(document.languageId)) return true;
  return APPLICABLE_EXTENSIONS.some((ext) => document.uri.path.endsWith(ext));
}

function refresh(context: vscode.ExtensionContext, document: vscode.TextDocument): void {
  if (!isApplicable(document)) return;

  const hits = scan(document.getText());
  const result = hits.map((hit) => {
    const range = new vscode.Range(document.positionAt(hit.startOffset), document.positionAt(hit.endOffset));
    const direction = hit.mismatchKind === 'TOO_FEW_PLACEHOLDERS' ? 'more arguments than' : 'more placeholders than';
    const message =
      `Log format mismatch: ${hit.argumentCount} argument(s) but ${hit.placeholderCount} placeholder(s) -- ${direction} the other.`;
    const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning);
    diagnostic.source = 'Log Format String Companion';
    return diagnostic;
  });
  diagnostics.set(document.uri, result);
  for (const hit of hits) {
    recordHit(context, `${document.uri.toString()}:${hit.startOffset}`);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  diagnostics = vscode.languages.createDiagnosticCollection('logFormatStringCompanion');
  context.subscriptions.push(diagnostics);

  vscode.workspace.textDocuments.forEach((doc) => refresh(context, doc));

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => refresh(context, doc)),
    vscode.workspace.onDidChangeTextDocument((event) => refresh(context, event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => diagnostics.delete(document.uri)),
  );
}

export function deactivate(): void {
  diagnostics?.dispose();
}
