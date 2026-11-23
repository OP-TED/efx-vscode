import type { EfxReading } from '@op-ted/efx-syntax-highlighter';
import * as vscode from 'vscode';
import { EfxLanguage } from './EfxLanguage';
import type { EfxWorker } from './EfxWorker';

/** The kinds of file of EFX-2: a template or rules. */
export type EfxKind = 'template' | 'rules';

/**
 * Whether VS Code still holds a document: open, and the document it gives for its file, as it may
 * hold another for the same file once the document has closed, or its language has changed.
 */
export function isHeld(document: vscode.TextDocument): boolean {
  return !document.isClosed && vscode.workspace.textDocuments.includes(document);
}

/**
 * What each EFX document holds: the version of EFX and the kind of file, template or rules, that its
 * text reads as best when the document opens (inferEfx), which the worker tells (EfxWorker), as it
 * may read a long start.
 *
 * A .efx file that VS Code opens as EFX-2 is switched to EFX-1 when it reads as EFX-1; its kind of
 * file is the one its text held when it opened. A document that opens in another way, with no file,
 * in another language, or that becomes EFX-2 later, is read as EFX-2 when it is EFX-2, and its kind is
 * told when the extension first needs it. Neither follows the text as it is edited. A language chosen
 * afterwards, as in the language picker, stays while the document is open: VS Code then gives the
 * extension the same document again, with its new language, where opening a file gives a new one; an
 * answer that comes after a document has closed, or has been given again so, is not used. A kind chosen
 * afterwards (choose) stays too. A reading that fails is tried again when it is next needed.
 */
export class EfxReadings implements vscode.Disposable {
  readonly #kinds = new WeakMap<vscode.TextDocument, EfxKind>();
  // The documents seen so far, whatever their language, and those of them whose version of EFX is yet
  // to be read, as .efx files that VS Code opened as EFX-2.
  readonly #seen = new WeakSet<vscode.TextDocument>();
  readonly #toOpen = new WeakSet<vscode.TextDocument>();
  // The readings that the worker has yet to tell: of a .efx file as it opens, and of the kind of a document.
  readonly #opening = new WeakMap<vscode.TextDocument, Promise<void>>();
  readonly #telling = new WeakMap<vscode.TextDocument, Promise<EfxKind>>();
  readonly #changes = new vscode.EventEmitter<vscode.TextDocument>();
  readonly #subscriptions: vscode.Disposable[];
  #disposed = false;

  /** Fires with an EFX-2 document whose kind of file has become known, or has been chosen. */
  readonly onDidChangeKind = this.#changes.event;

  constructor(private readonly worker: EfxWorker) {
    this.#subscriptions = [
      this.#changes,
      vscode.workspace.onDidOpenTextDocument((document) => this.#see(document)),
      vscode.workspace.onDidCloseTextDocument((document) => this.#toOpen.delete(document)),
    ];
    vscode.workspace.textDocuments.forEach((document) => this.#see(document));
  }

  /** How to read an EFX document: in the version of its language, as the kind of file of that version it holds. */
  async readingOf(document: vscode.TextDocument, language: EfxLanguage): Promise<EfxReading> {
    return language.version === 1 ? { version: 1, kind: 'template' } : { version: 2, kind: await this.#kindOf(document) };
  }

  /** How an EFX document is read now, if its kind of file is known yet. */
  knownReadingOf(document: vscode.TextDocument, language: EfxLanguage): EfxReading | undefined {
    if (language.version === 1) {
      return { version: 1, kind: 'template' };
    }
    const kind = this.#kinds.get(document);
    return kind === undefined ? undefined : { version: 2, kind };
  }

  /** Reads an EFX-2 document as the given kind of file from now on, while it is open. */
  choose(document: vscode.TextDocument, kind: EfxKind): void {
    if (this.#kinds.get(document) !== kind) {
      this.#kinds.set(document, kind);
      this.#changes.fire(document);
    }
  }

  dispose(): void {
    this.#disposed = true;
    this.#subscriptions.forEach((subscription) => subscription.dispose());
  }

  /**
   * Notes a document the first time it is seen, and reads a .efx file that VS Code opens as EFX-2. A
   * document seen again has a language chosen for it, which stays: its version is no longer read.
   */
  #see(document: vscode.TextDocument): void {
    if (this.#seen.has(document)) {
      this.#toOpen.delete(document);
      return;
    }
    this.#seen.add(document);
    if (EfxLanguage.of(document) === EfxLanguage.EFX_2 && document.uri.path.endsWith('.efx')) {
      this.#toOpen.add(document);
      void this.#open(document).catch(() => undefined);
    }
  }

  /**
   * Reads a .efx file as it opens: switches it to EFX-1 when it reads as EFX-1, and keeps its kind
   * otherwise, unless it has closed, or its language has changed, meanwhile. A reading that fails
   * leaves the file to be read.
   */
  #open(document: vscode.TextDocument): Promise<void> {
    const opening = this.worker.run('reading', { text: document.getText() })
      .then(async ({ version, kind }) => {
        // A document that has closed, or whose language has changed, meanwhile, as an event may say or
        // not; VS Code may then hold another document for its file, which a change of language would reach.
        if (this.#disposed || !this.#toOpen.has(document) || !isHeld(document) || EfxLanguage.of(document) !== EfxLanguage.EFX_2) {
          return;
        }
        this.#toOpen.delete(document);
        if (version === 1) {
          await vscode.languages.setTextDocumentLanguage(document, EfxLanguage.EFX_1.id);
        } else {
          this.#keep(document, kind as EfxKind);
        }
      })
      .finally(() => this.#opening.delete(document));
    this.#opening.set(document, opening);
    return opening;
  }

  /**
   * The kind of file of an EFX-2 document: the one it was read as when it opened, or chosen as, or,
   * once the worker tells, the one it holds. There is none once disposed, nor for a document that VS
   * Code no longer holds, when it is asked or once the worker has told.
   */
  #kindOf(document: vscode.TextDocument): Promise<EfxKind> {
    if (this.#disposed || !isHeld(document)) {
      return Promise.reject(new vscode.CancellationError());
    }
    const kind = this.#kinds.get(document);
    if (kind !== undefined) {
      return Promise.resolve(kind);
    }
    const opening = this.#opening.get(document) ?? (this.#toOpen.has(document) ? this.#open(document) : undefined);
    if (opening !== undefined) {
      // A file that the opening reading has switched to EFX-1 has no kind of EFX-2 to give.
      return opening.then(() => (EfxLanguage.of(document) === EfxLanguage.EFX_2 ? this.#kindOf(document)
        : Promise.reject(new vscode.CancellationError())));
    }
    let telling = this.#telling.get(document);
    if (telling === undefined) {
      telling = this.worker.run('reading', { text: document.getText(), version: 2 })
        .then(({ kind: told }) => (isHeld(document) ? this.#keep(document, told as EfxKind) : Promise.reject(new vscode.CancellationError())))
        .finally(() => this.#telling.delete(document));
      this.#telling.set(document, telling);
    }
    return telling;
  }

  /** Keeps the kind of file a document holds, unless one is known by then; the kind kept. */
  #keep(document: vscode.TextDocument, kind: EfxKind): EfxKind {
    if (!this.#kinds.has(document)) {
      this.#kinds.set(document, kind);
      this.#changes.fire(document);
    }
    return this.#kinds.get(document) as EfxKind;
  }
}
