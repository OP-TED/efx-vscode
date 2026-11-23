import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

// How long the tests wait, at most, for VS Code to switch the language of a document.
const LANGUAGE_SWITCH_TIMEOUT = 5000;

/** The EFX files of test/workspace/, the folder that VS Code opens for the tests (.vscode-test.mjs). */
export class EfxFiles {
  /** The address of a file of the folder. */
  static uriOf(name: string): vscode.Uri {
    const [workspace] = vscode.workspace.workspaceFolders ?? [];
    assert.ok(workspace, 'the tests run without the folder test/workspace');
    return vscode.Uri.joinPath(workspace.uri, name);
  }

  /** Opens a file of the folder as VS Code opens it, in an editor. */
  static async open(name: string): Promise<vscode.TextDocument> {
    const document = await vscode.workspace.openTextDocument(EfxFiles.uriOf(name));
    await vscode.window.showTextDocument(document);
    return document;
  }

  /** The document of a file once VS Code has given it a language, as it was or after a switch. */
  static async inLanguage(name: string, languageId: string): Promise<vscode.TextDocument> {
    const uri = EfxFiles.uriOf(name).toString();
    const current = () => vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri);
    const document = current();
    if (document?.languageId === languageId) {
      return document;
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        subscription.dispose();
        reject(new Error(`${name} is still ${current()?.languageId}, not ${languageId}`));
      }, LANGUAGE_SWITCH_TIMEOUT);
      const subscription = vscode.workspace.onDidOpenTextDocument((opened) => {
        if (opened.uri.toString() === uri && opened.languageId === languageId) {
          clearTimeout(timeout);
          subscription.dispose();
          resolve(opened);
        }
      });
    });
  }

  /** Closes every editor, so that the next test starts with none. */
  static async closeAll(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  }
}
