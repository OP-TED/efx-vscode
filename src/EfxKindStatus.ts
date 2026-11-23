import * as vscode from 'vscode';
import { EfxLanguage } from './EfxLanguage';
import type { EfxKind, EfxReadings } from './EfxReadings';

/** Each kind of file of EFX-2, with the name the status bar and the choice show, and its command. */
const KINDS: readonly { kind: EfxKind; label: string; command: string }[] = [
  { kind: 'template', label: 'Template', command: 'efx.readAsTemplate' },
  { kind: 'rules', label: 'Rules', command: 'efx.readAsRules' },
];

/**
 * The kind of file of the EFX-2 file in the active editor, in the status bar, beside its language:
 * "Template" or "Rules". Clicking it offers both kinds to choose from (efx.chooseKind); the commands
 * "EFX: Read as Template" and "EFX: Read as Rules" choose one directly (package.json "commands").
 */
export class EfxKindStatus implements vscode.Disposable {
  readonly #item = vscode.window.createStatusBarItem('efx.kind', vscode.StatusBarAlignment.Right, 100);
  readonly #subscriptions: vscode.Disposable[];
  #shown: string | undefined;

  constructor(private readonly readings: EfxReadings) {
    this.#item.name = 'EFX-2 Kind of File';
    this.#item.tooltip = 'What this EFX-2 file holds: click to read it as a template or as rules';
    this.#item.command = 'efx.chooseKind';
    this.#subscriptions = [
      this.#item,
      vscode.window.onDidChangeActiveTextEditor(() => this.#show()),
      vscode.workspace.onDidOpenTextDocument(() => this.#show()),
      readings.onDidChangeKind(() => this.#show()),
      vscode.commands.registerCommand('efx.chooseKind', () => this.#choose()),
      ...KINDS.map(({ kind, command }) => vscode.commands.registerCommand(command, () => this.#read(kind))),
    ];
    this.#show();
  }

  /** What the status bar shows, "Template" or "Rules", if it shows the kind of a document, for the extension's tests. */
  get shown(): string | undefined {
    return this.#shown;
  }

  dispose(): void {
    this.#subscriptions.forEach((subscription) => subscription.dispose());
  }

  /** The EFX-2 document of the active editor, if it holds one. */
  get #document(): vscode.TextDocument | undefined {
    const document = vscode.window.activeTextEditor?.document;
    return document !== undefined && EfxLanguage.of(document) === EfxLanguage.EFX_2 ? document : undefined;
  }

  /**
   * Shows the kind of the active EFX-2 document, once it is known, and nothing for another document.
   * A kind not known yet is asked for, and shows when it becomes known (onDidChangeKind): the colours
   * would ask for it too, but VS Code asks for none where semantic colours are off.
   */
  #show(): void {
    const document = this.#document;
    const kind = document === undefined ? undefined : this.readings.knownReadingOf(document, EfxLanguage.EFX_2)?.kind;
    this.#shown = KINDS.find((each) => each.kind === kind)?.label;
    if (this.#shown === undefined) {
      this.#item.hide();
      if (document !== undefined) {
        // A request that fails, as for a document that has closed meanwhile, shows nothing; the kind is
        // asked for again when the document is next shown.
        void this.readings.readingOf(document, EfxLanguage.EFX_2).catch(() => undefined);
      }
      return;
    }
    this.#item.text = this.#shown;
    this.#item.show();
  }

  /** Offers the kinds of file, the current one marked, and reads the active document as the one picked. */
  async #choose(): Promise<void> {
    const document = this.#document;
    if (document === undefined) {
      return;
    }
    const current = this.readings.knownReadingOf(document, EfxLanguage.EFX_2)?.kind;
    const items = KINDS.map(({ kind, label }) => ({ fileKind: kind, label, description: kind === current ? 'current' : undefined }));
    const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Read this EFX-2 file as' });
    if (picked !== undefined) {
      this.readings.choose(document, picked.fileKind);
    }
  }

  /** Reads the active EFX-2 document as a kind of file. */
  #read(kind: EfxKind): void {
    const document = this.#document;
    if (document !== undefined) {
      this.readings.choose(document, kind);
    }
  }
}
