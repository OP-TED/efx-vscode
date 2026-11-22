import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { EfxEditor } from './EfxEditor';

suite('The EFX language', () => {
  test('is the language of .efx files', async () => {
    const [workspace] = vscode.workspace.workspaceFolders ?? [];
    assert.ok(workspace, 'the tests run without the folder test/workspace');
    const document = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(workspace.uri, 'template.efx'));
    assert.equal(document.languageId, 'efx');
  });
});

suite('Comments', () => {
  let editor: EfxEditor;
  teardown(() => editor.close());

  test('toggling a line comment puts // before the selected lines, and takes it away again', async () => {
    const text = 'WITH ND-Root DISPLAY #{auxiliary|text|procedure};\n\tWITH BT-21-Procedure DISPLAY ${BT-21-Procedure};';
    editor = await EfxEditor.open(text);
    editor.selectAll();
    await editor.run('editor.action.commentLine');
    assert.equal(
      editor.text,
      '// WITH ND-Root DISPLAY #{auxiliary|text|procedure};\n// \tWITH BT-21-Procedure DISPLAY ${BT-21-Procedure};',
    );
    await editor.run('editor.action.commentLine');
    assert.equal(editor.text, text);
  });
});

suite('Brackets', () => {
  let editor: EfxEditor;
  teardown(() => editor.close());

  // A text with one pair of brackets in it: the first opening bracket, and the first closing bracket after it.
  const PAIRS = [
    { opening: '(', closing: ')', text: 'WITH ND-Root WHEN (BT-01-notice is present) DISPLAY yes;' },
    { opening: '[', closing: ']', text: 'WITH ND-Lot[BT-137-Lot is present] DISPLAY yes;' },
    { opening: '{', closing: '}', text: '1 {ND-Root} #{auxiliary|text|procedure}' },
    { opening: '${', closing: '}', text: 'WITH ND-Root DISPLAY ${BT-01-notice};' },
    { opening: '#{', closing: '}', text: 'WITH ND-Root DISPLAY #{auxiliary|text|procedure};' },
    { opening: '@{', closing: '}', text: 'WITH ND-Organization DISPLAY #{auxiliary|text|website}@{BT-505-Organization};' },
  ];

  for (const { opening, closing, text } of PAIRS) {
    const open = text.indexOf(opening);
    const close = text.indexOf(closing, open + opening.length);

    test(`going to the bracket goes from ${closing} to ${opening} and back`, async () => {
      editor = await EfxEditor.open(text);
      editor.cursor = close;
      await editor.run('editor.action.jumpToBracket');
      assert.equal(editor.cursor, open);
      await editor.run('editor.action.jumpToBracket');
      assert.equal(editor.cursor, close);
    });

    test(`typing ${opening} adds its ${closing}`, async () => {
      editor = await EfxEditor.open('WITH ND-Root DISPLAY ');
      editor.cursor = editor.text.length;
      await editor.type(opening);
      assert.equal(editor.text, `WITH ND-Root DISPLAY ${opening}${closing}`);
      assert.equal(editor.cursor, editor.text.length - closing.length);
    });
  }

  test('going to the bracket from the } of a block in a label block goes to its own ${', async () => {
    const text = "WITH ND-Lot DISPLAY #{field|name|${'BT-21-Lot'}};";
    editor = await EfxEditor.open(text);
    editor.cursor = text.lastIndexOf('}');
    await editor.run('editor.action.jumpToBracket');
    assert.equal(editor.cursor, text.indexOf('#{'));
    editor.cursor = text.lastIndexOf('}') - 1;
    await editor.run('editor.action.jumpToBracket');
    assert.equal(editor.cursor, text.indexOf('${'));
  });
});
