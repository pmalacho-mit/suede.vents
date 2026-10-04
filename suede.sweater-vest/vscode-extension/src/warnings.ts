import fs from "node:fs";
import path from "node:path";
import * as vscode from "vscode";

import { diagnosticAt, type Span } from "./editor.ts";
import { findLibrary } from "./library.ts";
import { CONFIG_GLOB, projectAt } from "./project.ts";

type Warning = Span & { message: string; severity?: "error" | "warning" };

// null while it is being written: the watcher fires again once it has been
const warningsIn = (file: string): Record<string, Warning[]> | null => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

/**
 * Each library's diagnostics file, and the directories its paths may be relative
 * to: the plugin writes them relative to where it ran, which is a project whose
 * Vite config imports it (an app in a subdirectory, say), else a workspace folder.
 */
async function diagnosticsFiles(): Promise<Map<string, string[]>> {
  const files = new Map<string, string[]>();
  const add = (derived: string, root: string) => {
    const file = path.join(derived, "diagnostics.json");
    const roots = files.get(file) ?? [];
    if (!roots.includes(root)) files.set(file, [...roots, root]);
  };
  for (const config of await vscode.workspace.findFiles(CONFIG_GLOB, "**/node_modules/**")) {
    const project = projectAt(path.dirname(config.fsPath));
    if (project) add(project.library.derived, project.root);
  }
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const library = findLibrary(folder.uri.fsPath);
    if (library) add(library.derived, folder.uri.fsPath);
  }
  return files;
}

// the first root the warned-about file is under; the first root when it is under none (it was deleted)
const locate = (relative: string, roots: string[]) =>
  roots.map((root) => path.join(root, relative)).find((file) => fs.existsSync(file)) ?? path.join(roots[0] ?? "", relative);

const publish = (diagnostics: vscode.DiagnosticCollection, file: string, roots: string[]) => {
  for (const [relative, warnings] of Object.entries(warningsIn(file) ?? {}))
    diagnostics.set(
      vscode.Uri.file(locate(relative, roots)),
      warnings.map((w) =>
        diagnosticAt(w, w.message, w.severity === "warning" ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error),
      ),
    );
};

export function pluginWarnings(diagnostics: vscode.DiagnosticCollection): vscode.Disposable {
  const watchers: vscode.Disposable[] = [];
  void diagnosticsFiles().then((files) => {
    for (const [file, roots] of files) {
      publish(diagnostics, file, roots);
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vscode.Uri.file(path.dirname(file)), path.basename(file)),
      );
      const refresh = () => publish(diagnostics, file, roots);
      watcher.onDidChange(refresh);
      watcher.onDidCreate(refresh);
      watchers.push(watcher);
    }
  });
  return new vscode.Disposable(() => {
    for (const watcher of watchers) watcher.dispose();
  });
}
