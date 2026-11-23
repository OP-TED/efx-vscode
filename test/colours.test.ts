import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { efxTextMateScopes } from '@op-ted/efx-syntax-highlighter';
import * as vscode from 'vscode';
import { TOKEN_KINDS } from '../src/EfxTokenKinds';
import { EfxFiles } from './EfxFiles';
import { SemanticTokens } from './SemanticTokens';

const extension = vscode.extensions.getExtension('op-ted.efx-vscode');

// Rules, whose * of the notice types a template would read as a product.
const RULES = '--- STAGE 1a ---\nWITH ND-Root ASSERT BT-01-notice is present AS ERROR R-000-001 FOR BT-01-notice IN *;\n';

// How long a test waits for a choice to show before it picks.
const QUICK_PICK_TIME = 500;

/** A new, empty EFX-2 file in the active editor, coloured once while it is empty: as a template. */
async function newFile(): Promise<{ document: vscode.TextDocument; editor: vscode.TextEditor }> {
  const document = await vscode.workspace.openTextDocument({ language: 'efx', content: '' });
  const editor = await vscode.window.showTextDocument(document);
  await SemanticTokens.of(document);
  return { document, editor };
}

// Finds the files of the highlighter package the extension was built with, from this folder (out/test/ holds the tests).
const fromRepository = createRequire(path.resolve(__dirname, '..', '..', 'package.json'));

/** A TextMate grammar as package.json contributes it. */
interface ContributedGrammar {
  language: string;
  scopeName: string;
  path: string;
}

/** A token as VS Code's TextMate engine gives it: its text, and its scopes, separated by blanks. */
interface SyntaxToken {
  c: string;
  t: string;
}

/** The scopes of the first token of a document with the given text, from the TextMate grammar of its language. */
async function scopesOf(document: vscode.TextDocument, text: string): Promise<string[]> {
  // The command VS Code's own tests read TextMate tokens with.
  const tokens = await vscode.commands.executeCommand<SyntaxToken[]>('_workbench.captureSyntaxTokens', document.uri);
  const token = tokens.find(({ c }) => c === text);
  assert.ok(token, `no token ${text}`);
  return token.t.split(' ');
}

suite('TextMate colours', () => {
  suiteSetup(() => extension?.activate());
  teardown(() => EfxFiles.closeAll());

  test('EFX-2 files are coloured by the EFX-2 grammar', async () => {
    const document = await EfxFiles.open('template.efx');
    assert.deepEqual(await scopesOf(document, 'WITH'), ['source.efx2', 'keyword.control.efx']);
    assert.ok((await scopesOf(document, 'ND-Root')).includes('variable.other.property.efx'));
  });

  test('each EFX language has the TextMate grammar of its version from the highlighter', () => {
    assert.ok(extension, 'the extension is not installed');
    const grammars: ContributedGrammar[] = extension.packageJSON.contributes.grammars;
    for (const { language, scopeName, file } of [
      { language: 'efx', scopeName: 'source.efx2', file: 'efx2.tmLanguage.json' },
      { language: 'efx1', scopeName: 'source.efx1', file: 'efx1.tmLanguage.json' },
    ]) {
      const grammar = grammars.find((contributed) => contributed.language === language);
      assert.ok(grammar, `no grammar for ${language}`);
      assert.equal(grammar.scopeName, scopeName);
      const installed: string = fs.readFileSync(path.join(extension.extensionPath, grammar.path), 'utf8');
      assert.equal(JSON.parse(installed).scopeName, scopeName);
      assert.equal(installed, fs.readFileSync(fromRepository.resolve(`@op-ted/efx-syntax-highlighter/${file}`), 'utf8'));
    }
  });
});

suite('Semantic colours', () => {
  suiteSetup(() => extension?.activate());
  teardown(() => EfxFiles.closeAll());

  test('are on for EFX, whatever the theme', () => {
    for (const languageId of ['efx', 'efx1']) {
      assert.equal(vscode.workspace.getConfiguration('editor', { languageId }).get('semanticHighlighting.enabled'), true);
    }
  });

  test('colour an EFX-2 template as its parser reads it', async () => {
    const tokens = await SemanticTokens.of(await EfxFiles.open('template.efx'));
    assert.equal(tokens.at('// A view template'), 'comment');
    assert.equal(tokens.at('LET'), 'keyword');
    assert.equal(tokens.at('text:'), 'type');
    // The colon of a declaration, which the TextMate grammar colours as punctuation: only the parser sees the declaration.
    assert.equal(tokens.at(':$title'), 'type');
    assert.equal(tokens.at('$title'), 'variable');
    assert.equal(tokens.at("'Procedure'"), 'string');
    assert.equal(tokens.at('ND-Root'), 'property');
    assert.equal(tokens.at('#{'), 'efxBracket');
    assert.equal(tokens.at('auxiliary'), 'efxWord');
    assert.equal(tokens.at('procedure}'), 'efxAssetName');
    assert.equal(tokens.at('|'), 'efxPunctuation');
    assert.equal(tokens.at(': ${'), 'efxText');
    assert.equal(tokens.at('count'), 'function.defaultLibrary');
    assert.equal(tokens.at('+'), 'operator');
    assert.equal(tokens.at('1}'), 'number');
  });

  test('colour a rules file as rules', async () => {
    const tokens = await SemanticTokens.of(await EfxFiles.open('rules.efx'));
    // The * of the notice types of a rule, which a template would read as a product.
    assert.equal(tokens.at('*'), 'efxWord');
    assert.equal(tokens.at('R-000-001'), 'efxAssetName');
  });

  test('colour a file as the kind it held when it opened, while rules are typed into it', async () => {
    const { document, editor } = await newFile();
    await editor.edit((edit) => edit.insert(new vscode.Position(0, 0), RULES));
    assert.notEqual((await SemanticTokens.of(document)).at('*'), 'efxWord');
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  });

  test('colour a file as the kind chosen with Read as Rules or Read as Template, while it is edited', async () => {
    const { document, editor } = await newFile();
    await editor.edit((edit) => edit.insert(new vscode.Position(0, 0), RULES));
    await vscode.commands.executeCommand('efx.readAsRules');
    assert.equal((await SemanticTokens.of(document)).at('*'), 'efxWord');
    await editor.edit((edit) => edit.insert(document.positionAt(document.getText().length), '\n'));
    assert.equal((await SemanticTokens.of(document)).at('*'), 'efxWord');
    await vscode.commands.executeCommand('efx.readAsTemplate');
    assert.notEqual((await SemanticTokens.of(document)).at('*'), 'efxWord');
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  });

  test('colour a file as the kind picked from the status bar', async () => {
    const document = await EfxFiles.open('rules.efx');
    assert.equal((await SemanticTokens.of(document)).at('*'), 'efxWord');
    // The choice offers Template, then Rules: Template is the one selected when it shows.
    const choosing = vscode.commands.executeCommand('efx.chooseKind');
    await new Promise((resolve) => setTimeout(resolve, QUICK_PICK_TIME));
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
    await choosing;
    assert.notEqual((await SemanticTokens.of(document)).at('*'), 'efxWord');
  });

  test('colour an EFX-1 template as the EFX-1 parser reads it', async () => {
    await EfxFiles.open('efx1.efx');
    const tokens = await SemanticTokens.of(await EfxFiles.inLanguage('efx1.efx', 'efx1'));
    assert.equal(tokens.at('{ND-Root}'), 'efxBracket');
    assert.equal(tokens.at('ND-Root'), 'property');
    assert.equal(tokens.at('${'), 'efxBracket');
  });

  test('have the TextMate scopes of their tags', () => {
    const contributed = extension?.packageJSON.contributes.semanticTokenScopes;
    const expected = Object.fromEntries(Object.entries(TOKEN_KINDS).map(([tag, { type, modifiers }]) =>
      [[type, ...modifiers].join('.'), [efxTextMateScopes[tag as keyof typeof efxTextMateScopes]]]));
    assert.deepEqual(contributed, ['efx', 'efx1'].map((language) => ({ language, scopes: expected })));
  });
});
