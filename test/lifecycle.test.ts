import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { EfxReading } from '@op-ted/efx-syntax-highlighter';
import * as vscode from 'vscode';
import { EfxLanguage } from '../src/EfxLanguage';
import { EfxReadings } from '../src/EfxReadings';
import { EfxSemanticTokens } from '../src/EfxSemanticTokens';
import { EfxWorker } from '../src/EfxWorker';
import { EfxFiles } from './EfxFiles';

// The parts of the extension, made apart from the one VS Code runs, with a stand-in for the worker or
// for the readings, whose answers a test gives when it chooses: what they do when things change while
// they wait.

/** A request to a stand-in for the worker, with what it answers. */
interface Asked {
  readonly method: string;
  readonly params: { readonly text: string; readonly version?: number; readonly reading?: EfxReading };
  readonly answer: (result: unknown) => void;
  readonly fail: (error: Error) => void;
}

/** A stand-in for the worker, which keeps its requests for the test to answer. */
function standInWorker(asked: Asked[]): EfxWorker {
  return {
    run: (method: string, params: Asked['params']) => new Promise((answer, fail) => asked.push({ method, params, answer, fail })),
  } as unknown as EfxWorker;
}

/**
 * Waits until a stand-in for the worker has been asked as many times as given about a text, and
 * gives those requests: a part of the extension made apart also reads the documents already open.
 */
async function askedAbout(asked: Asked[], text: string, count: number): Promise<Asked[]> {
  for (;;) {
    const about = asked.filter(({ params }) => params.text === text);
    if (about.length >= count) {
      return about;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const NOT_CANCELLED = new vscode.CancellationTokenSource().token;

/** Closes a document without saving it, as an editor that shows it closes, and waits until VS Code has closed it. */
async function closeDocument(document: vscode.TextDocument): Promise<void> {
  await vscode.window.showTextDocument(document);
  await vscode.commands.executeCommand(document.isUntitled ? 'workbench.action.revertAndCloseActiveEditor'
    : 'workbench.action.closeActiveEditor');
  while (!document.isClosed) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

// How long a test waits to see that a document's language is not changed.
const SETTLING_TIME = 1000;

suite('What the extension does when things change while it waits', () => {
  teardown(() => EfxFiles.closeAll());

  test('the tokens for a language chosen away while the kind of file is told are not asked of the worker', async () => {
    const document = await vscode.workspace.openTextDocument({ language: 'efx', content: '{ND-Root} text\n' });
    let tell: (reading: EfxReading) => void = () => undefined;
    const readings = {
      readingOf: (_: vscode.TextDocument, language: EfxLanguage) => (language.version === 1
        ? Promise.resolve({ version: 1, kind: 'template' })
        : new Promise<EfxReading>((resolve) => { tell = resolve; })),
      knownReadingOf: (_: vscode.TextDocument, language: EfxLanguage) => ({ version: language.version, kind: 'template' }),
    } as unknown as EfxReadings;
    const asked: Asked[] = [];
    const provider = new EfxSemanticTokens(readings, standInWorker(asked));
    const asEfx2 = provider.provideDocumentSemanticTokens(document, NOT_CANCELLED);
    const efx1 = await vscode.languages.setTextDocumentLanguage(document, 'efx1');
    void provider.provideDocumentSemanticTokens(efx1, NOT_CANCELLED);
    await askedAbout(asked, document.getText(), 1);
    tell({ version: 2, kind: 'template' });
    await assert.rejects(asEfx2, vscode.CancellationError);
    // Only the tokens of EFX-1: those of EFX-2 would have replaced them in the worker.
    assert.deepEqual(asked.map(({ params }) => params.reading?.version), [1]);
  });

  test('the tokens of a document closed while its kind of file is told are not asked of the worker', async () => {
    // A document that closes with its text as it was, as a file does, so that only its closing tells:
    // a stand-in, as VS Code closes a file's document when it chooses.
    const text = 'WITH ND-Root DISPLAY a document that closes;\n';
    const document = {
      uri: vscode.Uri.file(path.join(os.tmpdir(), 'closing.efx')), version: 1, languageId: 'efx', isClosed: false, getText: () => text,
    } as unknown as vscode.TextDocument & { isClosed: boolean };
    let tell: (reading: EfxReading) => void = () => undefined;
    const readings = {
      readingOf: () => new Promise<EfxReading>((resolve) => { tell = resolve; }),
      knownReadingOf: () => ({ version: 2, kind: 'template' }),
    } as unknown as EfxReadings;
    const asked: Asked[] = [];
    const tokens = new EfxSemanticTokens(readings, standInWorker(asked)).provideDocumentSemanticTokens(document, NOT_CANCELLED);
    document.isClosed = true;
    tell({ version: 2, kind: 'template' });
    await assert.rejects(tokens, vscode.CancellationError);
    assert.equal(asked.filter(({ params }) => params.text === text).length, 0);
  });

  test('a request for the kind of file of a document closed meanwhile is cancelled, and asks no more', async () => {
    const text = 'WITH ND-Root DISPLAY another document that closes;\n';
    const asked: Asked[] = [];
    const readings = new EfxReadings(standInWorker(asked));
    try {
      const document = await vscode.workspace.openTextDocument({ language: 'efx', content: text });
      const reading = readings.readingOf(document, EfxLanguage.EFX_2);
      const [telling] = await askedAbout(asked, text, 1);
      await closeDocument(document);
      telling.answer({ version: 2, kind: 'rules' });
      await assert.rejects(reading, vscode.CancellationError);
      await assert.rejects(readings.readingOf(document, EfxLanguage.EFX_2), vscode.CancellationError);
      assert.equal(asked.filter(({ params }) => params.text === text).length, 1);
    } finally {
      readings.dispose();
    }
  });

  test('a language chosen for a .efx file while the worker tells what it holds stays', async () => {
    // EFX-2, which the extension that VS Code runs keeps; the stand-in tells EFX-1 once the language is chosen.
    const text = 'WITH ND-Root DISPLAY a file whose language is chosen;\n';
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'efx-vscode-')), 'chosen.efx');
    fs.writeFileSync(file, text);
    const asked: Asked[] = [];
    const readings = new EfxReadings(standInWorker(asked));
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
      const [opening] = await askedAbout(asked, text, 1);
      const chosen = await vscode.languages.setTextDocumentLanguage(document, 'plaintext');
      opening.answer({ version: 1, kind: 'template' });
      await new Promise((resolve) => setTimeout(resolve, SETTLING_TIME));
      assert.equal(chosen.languageId, 'plaintext');
      assert.equal(vscode.workspace.textDocuments.find(({ uri }) => uri.fsPath === file)?.languageId, 'plaintext');
    } finally {
      readings.dispose();
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  });

  test('a .efx file whose reading fails as it opens is read again, in both versions, when it is next needed', async () => {
    const text = 'WITH ND-Root DISPLAY a file whose reading fails;\n';
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'efx-vscode-')), 'failing.efx');
    fs.writeFileSync(file, text);
    const asked: Asked[] = [];
    const readings = new EfxReadings(standInWorker(asked));
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
      (await askedAbout(asked, text, 1))[0].fail(new Error('The EFX worker stopped'));
      // The next request, once the failure is known.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const reading = readings.readingOf(document, EfxLanguage.EFX_2);
      const about = await askedAbout(asked, text, 2);
      about[1].answer({ version: 2, kind: 'rules' });
      assert.deepEqual(await reading, { version: 2, kind: 'rules' });
      assert.deepEqual(about.map(({ method, params }) => [method, params.version]), [['reading', undefined], ['reading', undefined]]);
    } finally {
      readings.dispose();
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  });

  test('once disposed, the readings and the worker take no more work', async () => {
    const asked: Asked[] = [];
    const readings = new EfxReadings(standInWorker(asked));
    readings.dispose();
    const text = 'WITH ND-Root DISPLAY a text read once disposed;\n';
    const document = await vscode.workspace.openTextDocument({ language: 'efx', content: text });
    await assert.rejects(readings.readingOf(document, EfxLanguage.EFX_2), vscode.CancellationError);
    assert.equal(asked.filter(({ params }) => params.text === text).length, 0);
    const worker = new EfxWorker();
    worker.dispose();
    await assert.rejects(worker.run('reading', { text: '' }), vscode.CancellationError);
    assert.equal(worker.runsOf('reading'), 0);
  });
});
