// The entry point of the extension, which VS Code loads when it opens the first EFX file. The EFX
// languages, EFX-2 and EFX-1, with their file extension, comments, brackets and TextMate grammars,
// are declared in package.json and language-configuration.json. Here, the extension finds what each
// EFX file holds (EfxReadings), shows whether an EFX-2 file is read as a template or as rules, and
// lets the person choose (EfxKindStatus), and colours each file as its parser reads it
// (EfxSemanticTokens); its parser runs in a worker thread of its own (EfxWorker).

import * as vscode from 'vscode';
import { EfxKindStatus } from './EfxKindStatus';
import { EfxLanguage } from './EfxLanguage';
import { EfxReadings } from './EfxReadings';
import { EfxSemanticTokens } from './EfxSemanticTokens';
import { EfxWorker } from './EfxWorker';

/**
 * What the extension gives to other code, its tests: how many times its worker has read a document's
 * tokens, and the kind of file that the status bar shows, if any.
 */
export interface EfxExtensionApi {
  readonly tokenReadings: number;
  readonly kindShown: string | undefined;
}

export function activate(context: vscode.ExtensionContext): EfxExtensionApi {
  const worker = new EfxWorker();
  const readings = new EfxReadings(worker);
  const semanticTokens = new EfxSemanticTokens(readings, worker);
  const kindStatus = new EfxKindStatus(readings);
  context.subscriptions.push(worker, readings, kindStatus, ...EfxLanguage.ALL.map((language) =>
    vscode.languages.registerDocumentSemanticTokensProvider(language.selector, semanticTokens, EfxSemanticTokens.legend)));
  return {
    get tokenReadings() {
      return worker.runsOf('semanticTokens');
    },
    get kindShown() {
      return kindStatus.shown;
    },
  };
}
