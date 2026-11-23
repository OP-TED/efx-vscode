import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { EfxExtensionApi } from '../src/extension';
import { EfxFiles } from './EfxFiles';

const extension = vscode.extensions.getExtension<EfxExtensionApi>('op-ted.efx-vscode');

// Rules, whose * of the notice types a template would read as a product.
const RULES = '--- STAGE 1a ---\nWITH ND-Root ASSERT BT-01-notice is present AS ERROR R-000-001 FOR BT-01-notice IN *;\n';

// How long a test waits, at most, for the status bar to show a kind of file.
const SHOWING_TIMEOUT = 5000;

/** What the extension gives its tests. */
function api(): EfxExtensionApi {
  assert.ok(extension?.isActive, 'the extension is not active');
  return extension.exports;
}

/** Waits until the status bar shows a kind of file, "Template" or "Rules". */
async function shows(kind: string): Promise<void> {
  const started = performance.now();
  while (api().kindShown !== kind) {
    if (performance.now() - started > SHOWING_TIMEOUT) {
      assert.fail(`the status bar shows ${api().kindShown ?? 'no kind'}, not ${kind}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** A new EFX-2 file that holds rules, in the active editor. */
async function newRulesFile(): Promise<void> {
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ language: 'efx', content: RULES }));
}

suite('The kind of file in the status bar', () => {
  suiteSetup(() => extension?.activate());
  teardown(() => EfxFiles.closeAll());

  test('shows the kind of a new file, and the kind chosen', async () => {
    await newRulesFile();
    await shows('Rules');
    await vscode.commands.executeCommand('efx.readAsTemplate');
    await shows('Template');
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  });

  test('shows the kind of a new file while semantic colours are off', async () => {
    // As a person turns them off for EFX-2 in their settings: VS Code then asks for no semantic tokens.
    const settings = () => vscode.workspace.getConfiguration('editor', { languageId: 'efx' });
    await settings().update('semanticHighlighting.enabled', false, vscode.ConfigurationTarget.Global, true);
    try {
      assert.equal(settings().get('semanticHighlighting.enabled'), false);
      const runs = api().tokenReadings;
      await newRulesFile();
      await shows('Rules');
      assert.equal(api().tokenReadings, runs, 'VS Code asked for semantic tokens');
      await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    } finally {
      await settings().update('semanticHighlighting.enabled', undefined, vscode.ConfigurationTarget.Global, true);
    }
  });
});
