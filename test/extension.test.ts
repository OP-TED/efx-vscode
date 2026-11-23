import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

// This folder, where npm test packages the .vsix from: out/test/ holds the tests as they run.
const REPOSITORY = path.resolve(__dirname, '..', '..');

suite('The extension', () => {
  const extension = vscode.extensions.getExtension('op-ted.efx-vscode');

  test('is the one installed from the .vsix just packaged, not this folder', () => {
    assert.ok(extension, 'the extension is not installed');
    assert.notEqual(path.resolve(extension.extensionPath), REPOSITORY);
    const manifest = JSON.parse(fs.readFileSync(path.join(REPOSITORY, 'package.json'), 'utf8'));
    assert.equal(extension.packageJSON.version, manifest.version);
  });

  test('bundles the highlighter only in its worker thread, not in the code of the extension host', () => {
    assert.ok(extension, 'the extension is not installed');
    // esbuild names each module it bundles in a comment before the module's code, as the build does
    // not minify: the worker's bundle must hold the lexers and parsers of the highlighter, and the
    // bundle that the extension host loads none of the highlighter's modules.
    const highlighter = 'node_modules/@op-ted/efx-syntax-highlighter/';
    const bundle = (name: string) => fs.readFileSync(path.join(extension.extensionPath, 'dist', name), 'utf8');
    const worker = bundle('worker.js');
    for (const module of ['dist/efx2/lexer.js', 'dist/efx2/parser.js', 'dist/efx1/lexer.js', 'dist/efx1/parser.js']) {
      assert.ok(worker.includes(`// ${highlighter}${module}\n`), `dist/worker.js does not hold ${module} of the highlighter`);
    }
    assert.ok(!bundle('extension.js').includes(highlighter), 'dist/extension.js holds modules of the highlighter');
  });

  test('loads in VS Code', async () => {
    assert.ok(extension, 'the extension is not installed');
    await extension.activate();
    assert.ok(extension.isActive);
  });
});
