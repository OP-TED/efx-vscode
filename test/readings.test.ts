import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { EfxFiles } from './EfxFiles';

// How long a test waits to see that VS Code does not switch the language of a document again.
const SETTLING_TIME = 1000;

const settled = () => new Promise((resolve) => setTimeout(resolve, SETTLING_TIME));

suite('What an EFX file holds', () => {
  suiteSetup(() => vscode.extensions.getExtension('op-ted.efx-vscode')?.activate());
  teardown(() => EfxFiles.closeAll());

  test('a .efx file that reads as EFX-2 stays EFX-2', async () => {
    await EfxFiles.open('template.efx');
    await settled();
    assert.equal((await EfxFiles.inLanguage('template.efx', 'efx')).languageId, 'efx');
  });

  test('a .efx file that reads as EFX-1 is switched to EFX-1', async () => {
    await EfxFiles.open('efx1.efx');
    assert.equal((await EfxFiles.inLanguage('efx1.efx', 'efx1')).languageId, 'efx1');
  });

  test('a language chosen afterwards stays while the file is open', async () => {
    await EfxFiles.open('efx1.efx');
    const efx1 = await EfxFiles.inLanguage('efx1.efx', 'efx1');
    const chosen = await vscode.languages.setTextDocumentLanguage(efx1, 'efx');
    await settled();
    assert.equal((await EfxFiles.inLanguage('efx1.efx', 'efx')).languageId, 'efx');
    // VS Code keeps the document after its editor closes: the other tests find it as it was.
    await vscode.languages.setTextDocumentLanguage(chosen, 'efx1');
  });
});
