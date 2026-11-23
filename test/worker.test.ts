import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { EfxExtensionApi } from '../src/extension';
import { EfxFiles } from './EfxFiles';
import { SemanticTokens } from './SemanticTokens';

const extension = vscode.extensions.getExtension<EfxExtensionApi>('op-ted.efx-vscode');

// A rule, and a rules file of it many times over, about two megabytes, which the parser takes a while
// to read.
const RULE = 'WITH ND-Root ASSERT BT-01-notice is present AS ERROR R-000-001 FOR BT-01-notice IN *;\n';
const RULES = `--- STAGE 1a ---\n${RULE}`;
const LONG_RULES = `--- STAGE 1a ---\n${RULE.repeat(20000)}`;

// Rules whose start a template and rules read alike, as far as a long declaration goes: to tell what
// they hold, the worker reads them in several rounds (inferEfx).
const AMBIGUOUS_RULES = `LET text:$message = '${'a'.repeat(15000)}';\n${RULES}`;

// A template of EFX-1, which a .efx file that holds it is switched to.
const EFX1_TEXT = '{ND-Root} ${BT-01-notice}\n';

// How long a test waits to see that the extension does not change a document's language.
const SETTLING_TIME = 1000;

// The longest the extension host may stop while the worker reads: this long, or this share of the time
// the reading takes, if that is longer, as a machine that is busy with other work stops the host now
// and then on its own. A fast machine may read in less time than that, and the check then passes
// whatever runs where: that the extension host holds no parser at all is checked apart, whatever the
// speed of the machine (extension.test.ts).
const HOST_PAUSE = 300;
const HOST_PAUSE_SHARE = 0.25;

/** Checks that the extension host did not stop for long while a task ran. */
function assertHostFree({ longest, took }: { longest: number; took: number }): void {
  assert.ok(longest < Math.max(HOST_PAUSE, HOST_PAUSE_SHARE * took),
    `the extension host stopped for ${Math.round(longest)} ms of ${Math.round(took)}`);
}

/**
 * The longest time the extension host stops while a task runs, checked every 10 milliseconds, and how
 * long the task takes.
 */
async function pausesWhile<T>(task: () => Promise<T>): Promise<{ result: T; longest: number; took: number }> {
  let last = performance.now();
  let longest = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    longest = Math.max(longest, now - last);
    last = now;
  }, 10);
  const started = performance.now();
  try {
    const result = await task();
    // With the time since the last check, as the host may have stopped just before the task ended.
    const ended = performance.now();
    return { result, longest: Math.max(longest, ended - last), took: ended - started };
  } finally {
    clearInterval(timer);
  }
}

// The documents a test makes, which it closes, as they are long.
const made: vscode.TextDocument[] = [];

/** A new EFX-2 document, not shown in an editor, so that only the test asks for its tokens. */
async function documentOf(text: string): Promise<vscode.TextDocument> {
  const document = await vscode.workspace.openTextDocument({ language: 'efx', content: text });
  made.push(document);
  return document;
}

/** Closes the documents a test made, and drops their text. */
async function closeMade(): Promise<void> {
  for (const document of made.splice(0)) {
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  }
  await EfxFiles.closeAll();
}

/** A file of a given name that holds a text, in a folder of its own; the test removes the folder. */
function fileOf(name: string, text: string): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'efx-vscode-')), name);
  fs.writeFileSync(file, text);
  return file;
}

/** The language a file's document has now, as VS Code gives the same document again when it changes. */
function languageOf(file: string): string | undefined {
  return vscode.workspace.textDocuments.find((document) => document.uri.fsPath === file)?.languageId;
}

/** The semantic tokens VS Code has for a document; undefined where the extension drops the answer. */
async function tokensOf(document: vscode.TextDocument): Promise<vscode.SemanticTokens | undefined> {
  try {
    return await vscode.commands.executeCommand<vscode.SemanticTokens | undefined>('vscode.provideDocumentSemanticTokens', document.uri);
  } catch {
    return undefined;
  }
}

/** How many times the extension's worker has read a document's tokens. */
function tokenReadings(): number {
  assert.ok(extension?.isActive, 'the extension is not active');
  return extension.exports.tokenReadings;
}

/** How many times the extension's worker has read what a document holds: its version of EFX, or its kind of file. */
function fileReadings(): number {
  assert.ok(extension?.isActive, 'the extension is not active');
  return extension.exports.fileReadings;
}

/** Waits until a count of the worker's requests is more than given. */
async function runsAfter(runs: number, count: () => number): Promise<void> {
  while (count() <= runs) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

suite('The worker', () => {
  suiteSetup(() => extension?.activate());
  teardown(closeMade);

  test('reads a long file without holding up the extension host', async () => {
    // A first reading, which starts the worker.
    await tokensOf(await documentOf(RULES));
    const document = await documentOf(LONG_RULES);
    const reading = await pausesWhile(() => tokensOf(document));
    assert.ok(reading.result !== undefined && reading.result.data.length > 0, 'no tokens');
    assertHostFree(reading);
  });

  // The extension host holds no parser (extension.test.ts): what a file holds is read in the worker.
  // The test does not time that reading, as inferEfx reads at most about 16,000 characters of a file,
  // which a fast machine reads in too little time to tell. That the reading as a file opens is of both
  // versions is checked apart, with a stand-in for the worker (lifecycle.test.ts).
  test('tells what a file holds in the worker, once, as it opens', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'efx-vscode-')), 'ambiguous.efx');
    fs.writeFileSync(file, AMBIGUOUS_RULES);
    try {
      const runs = fileReadings();
      const opened = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
      made.push(opened);
      // Opening the file starts the reading in the worker, before anything asks for its tokens.
      await runsAfter(runs, fileReadings);
      const tokens = await SemanticTokens.of(opened);
      assert.equal(opened.languageId, 'efx');
      assert.equal(tokens.at('*'), 'efxWord');
      // That reading only, in several rounds, in one request: the tokens are then read as the kind of
      // file it found, with no reading of the kind again.
      assert.equal(fileReadings() - runs, 1);
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  });

  test('reads each version of a document once', async () => {
    const document = await documentOf(RULES);
    const runs = tokenReadings();
    await Promise.all([tokensOf(document), tokensOf(document)]);
    assert.equal((await SemanticTokens.of(document)).at('*'), 'efxWord');
    assert.equal(tokenReadings() - runs, 1);
  });

  test('keeps a .efx file that opened as EFX-1 in EFX-2, once EFX-2 is chosen for it', async () => {
    const files = vscode.workspace.getConfiguration('files');
    const associations = files.get<Record<string, string>>('associations');
    await files.update('associations', { ...associations, '**/opened-as-efx1.efx': 'efx1' }, vscode.ConfigurationTarget.Global);
    const file = fileOf('opened-as-efx1.efx', EFX1_TEXT);
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
      made.push(document);
      assert.equal(document.languageId, 'efx1');
      made.push(await vscode.languages.setTextDocumentLanguage(document, 'efx'));
      await new Promise((resolve) => setTimeout(resolve, SETTLING_TIME));
      assert.equal(languageOf(file), 'efx');
    } finally {
      await files.update('associations', associations, vscode.ConfigurationTarget.Global);
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  });
});
