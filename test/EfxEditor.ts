import * as vscode from 'vscode';

/**
 * An editor of the VS Code the tests run in, holding an EFX text, which a test opens, edits as a user
 * would, with VS Code's own commands, and closes again without saving.
 */
export class EfxEditor {
  private constructor(private readonly editor: vscode.TextEditor) {}

  /** Opens a new, untitled EFX document that holds the text, in an editor that becomes the active one. */
  static async open(text: string): Promise<EfxEditor> {
    const document = await vscode.workspace.openTextDocument({ language: 'efx', content: text });
    return new EfxEditor(await vscode.window.showTextDocument(document));
  }

  get text(): string {
    return this.editor.document.getText();
  }

  /** The offset in the text of the cursor. */
  get cursor(): number {
    return this.editor.document.offsetAt(this.editor.selection.active);
  }

  set cursor(offset: number) {
    const position = this.editor.document.positionAt(offset);
    this.editor.selection = new vscode.Selection(position, position);
  }

  selectAll(): void {
    const document = this.editor.document;
    this.editor.selection = new vscode.Selection(document.positionAt(0), document.positionAt(document.getText().length));
  }

  /** Runs one of VS Code's commands in the editor, as its key binding would. */
  async run(command: string): Promise<void> {
    await vscode.commands.executeCommand(command);
  }

  /** Types the text at the cursor, one character at a time, as a user would. */
  async type(text: string): Promise<void> {
    for (const character of text) {
      await vscode.commands.executeCommand('type', { text: character });
    }
  }

  /** Closes the editor and drops its text. */
  async close(): Promise<void> {
    await vscode.window.showTextDocument(this.editor.document);
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  }
}
