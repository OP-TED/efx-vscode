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

  test('loads in VS Code', async () => {
    assert.ok(extension, 'the extension is not installed');
    await extension.activate();
    assert.ok(extension.isActive);
  });
});
