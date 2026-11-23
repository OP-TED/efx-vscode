import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { EfxExtensionApi } from '../src/extension';
import { EfxFiles } from './EfxFiles';
import { SemanticTokens } from './SemanticTokens';

const extension = vscode.extensions.getExtension<EfxExtensionApi>('op-ted.efx-vscode');

// A rule, and a rules file of it many times over, about two megabytes, which the parser takes more
// than a second to read on any machine the tests run on.
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

// Rules long enough for the worker to be reading them while a test changes what they are read as,
// and short enough for an editor to show.
const SHOWN_RULES = `--- STAGE 1a ---\n${RULE.repeat(5000)}`;

// The longest the extension host may stop while the worker reads: this long, or this share of the time
// the reading takes, if that is longer, as a machine that is busy with other work stops the host now
// and then on its own. The reading must take long enough for the test to tell: on the host, it would
// stop the host all that time.
const HOST_PAUSE = 300;
const HOST_PAUSE_SHARE = 0.25;
const READING_TIME = 2 * HOST_PAUSE;

/** Checks that the extension host did not stop for long while a task ran, and that the task took long enough to tell. */
function assertHostFree({ longest, took }: { longest: number; took: number }): void {
  assert.ok(took > READING_TIME, `the task took ${Math.round(took)} ms only, too little to tell`);
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
    return { result, longest, took: performance.now() - started };
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

/** Waits until the worker has run more requests than given. */
async function runsAfter(runs: number): Promise<void> {
  while (tokenReadings() <= runs) {
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

  test('tells what a file holds, as it opens, without holding up the extension host', async () => {
    await tokensOf(await documentOf(RULES));
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'efx-vscode-')), 'ambiguous.efx');
    fs.writeFileSync(file, AMBIGUOUS_RULES);
    try {
      const telling = await pausesWhile(async () => {
        const opened = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
        made.push(opened);
        await tokensOf(opened);
        return opened;
      });
      assert.equal(telling.result.languageId, 'efx');
      assert.equal((await SemanticTokens.of(telling.result)).at('*'), 'efxWord');
      assertHostFree(telling);
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

  test('reads only the newest version of a document that changes while it reads, and drops the rest', async () => {
    const document = await documentOf(LONG_RULES);
    const runs = tokenReadings();
    const first = tokensOf(document);
    await runsAfter(runs);
    const later: Promise<vscode.SemanticTokens | undefined>[] = [];
    for (let edit = 0; edit < 3; edit += 1) {
      const change = new vscode.WorkspaceEdit();
      change.insert(document.uri, new vscode.Position(0, 0), '// A change\n');
      await vscode.workspace.applyEdit(change);
      later.push(tokensOf(document));
    }
    assert.equal(await first, undefined, 'the answer for the first version is not dropped');
    const newest = await later[later.length - 1];
    assert.ok(newest !== undefined && newest.data.length > 0, 'no tokens for the newest version');
    await Promise.all(later);
    assert.equal((await SemanticTokens.of(document)).at('*'), 'efxWord');
    // The first version, which cannot be stopped once it runs, and the newest; none in between.
    assert.equal(tokenReadings() - runs, 2);
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

  test('drops the answer for a kind of file chosen away while it is read', async () => {
    const document = await documentOf(SHOWN_RULES);
    const runs = tokenReadings();
    // Read as Template acts on the active editor.
    await vscode.window.showTextDocument(document);
    const asRules = tokensOf(document);
    await runsAfter(runs);
    await vscode.commands.executeCommand('efx.readAsTemplate');
    assert.equal(await asRules, undefined, 'the answer for rules is not dropped');
    const asTemplate = await tokensOf(document);
    assert.ok(asTemplate !== undefined && asTemplate.data.length > 0, 'no tokens for the template');
  });
});
