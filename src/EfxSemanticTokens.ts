import type { EfxReading } from '@op-ted/efx-syntax-highlighter';
import * as vscode from 'vscode';
import { EfxLanguage } from './EfxLanguage';
import { isHeld, type EfxReadings } from './EfxReadings';
import { TOKEN_MODIFIERS, TOKEN_TYPES } from './EfxTokenKinds';
import type { EfxWorker } from './EfxWorker';

/** The answer for one version of a document, read as one kind of file. */
interface Answer {
  readonly version: number;
  readonly reading: string;
  readonly tokens: Promise<Uint32Array>;
}

/** An answer, or a CancellationError once VS Code no longer waits for it. */
function unlessCancelled<T>(answer: Promise<T>, token: vscode.CancellationToken): Promise<T> {
  if (token.isCancellationRequested) {
    return Promise.reject(new vscode.CancellationError());
  }
  return new Promise((resolve, reject) => {
    const listener = token.onCancellationRequested(() => reject(new vscode.CancellationError()));
    answer.then(resolve, reject).finally(() => listener.dispose());
  });
}

/**
 * The semantic tokens of an EFX document: the ranges its parser colours (efxHighlights), read in the
 * version of the document's language and as the kind of file it holds (EfxReadings), each as the kind
 * of token of its tag (EfxTokenKinds.ts). VS Code shows them over the colours of the TextMate grammar,
 * which a regular expression gives more vaguely where only the parent of a token tells its colour.
 * The worker reads the document (EfxWorker), once for each version and kind of file: VS Code may ask
 * again for the same version, and gets the same answer. An answer for a version that an edit has
 * replaced, for a language or a kind of file chosen away meanwhile, or that VS Code no longer waits
 * for, is dropped.
 */
export class EfxSemanticTokens implements vscode.DocumentSemanticTokensProvider {
  static readonly legend = new vscode.SemanticTokensLegend([...TOKEN_TYPES], [...TOKEN_MODIFIERS]);

  /** Fires when the kind of a document becomes known or is chosen, so that VS Code asks for the tokens again. */
  readonly onDidChangeSemanticTokens: vscode.Event<void>;

  readonly #answers = new WeakMap<vscode.TextDocument, Answer>();

  constructor(private readonly readings: EfxReadings, private readonly worker: EfxWorker) {
    this.onDidChangeSemanticTokens = (listener, thisArgs, disposables) =>
      readings.onDidChangeKind(() => listener.call(thisArgs), undefined, disposables);
  }

  async provideDocumentSemanticTokens(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
    const language = EfxLanguage.of(document);
    if (language === undefined) {
      return new vscode.SemanticTokens(new Uint32Array(0));
    }
    const { version } = document;
    const reading = await unlessCancelled(this.readings.readingOf(document, language), token);
    // Before it asks the worker, which would replace the request of a newer reading.
    this.#checkStillReads(document, version, language, reading);
    let answer = this.#answers.get(document);
    if (answer?.version !== version || answer.reading !== `${reading.version} ${reading.kind}`) {
      const asked: Answer = {
        version,
        reading: `${reading.version} ${reading.kind}`,
        tokens: this.worker.run('semanticTokens', { text: document.getText(), reading }, `${document.uri.toString()} semanticTokens`),
      };
      // An answer that fails, as one that a newer request cancels, is not kept, so that it can be asked again.
      asked.tokens.catch(() => {
        if (this.#answers.get(document) === asked) {
          this.#answers.delete(document);
        }
      });
      this.#answers.set(document, asked);
      answer = asked;
    }
    const tokens = await unlessCancelled(answer.tokens, token);
    this.#checkStillReads(document, version, language, reading);
    // VS Code takes the numbers of the tokens it is given; the answer keeps its own, for the next time it is asked.
    return new vscode.SemanticTokens(new Uint32Array(tokens));
  }

  /**
   * Cancels a request for a document that is no longer read as it was asked: an edit, a language or a
   * kind of file chosen meanwhile makes its answer one for another reading, and a document that VS Code
   * no longer holds has none, whose request would replace that of a document opened for the same file.
   */
  #checkStillReads(document: vscode.TextDocument, version: number, language: EfxLanguage, reading: EfxReading): void {
    const readingNow = EfxLanguage.of(document) === language ? this.readings.knownReadingOf(document, language) : undefined;
    if (!isHeld(document) || document.version !== version || readingNow?.version !== reading.version
      || readingNow.kind !== reading.kind) {
      throw new vscode.CancellationError();
    }
  }
}
