# efx-vscode

EFX support for [VS Code](https://code.visualstudio.com/). [EFX](https://docs.ted.europa.eu/eforms/latest/efx) is the expression and template language of the eForms SDK. The extension opens `.efx` files as EFX, whether they hold view templates or validation rules, in EFX-1 or EFX-2, finds which, and colours them as the EFX highlighter of the SDK does, with EFX's comments and brackets. It needs VS Code 1.101 or later. What each release changes is in [CHANGELOG.md](CHANGELOG.md).

## Install

The extension is not on the VS Code Marketplace. Each [release](https://github.com/OP-TED/efx-vscode/releases) of this repository has it as a `.vsix` file, such as `efx-vscode-0.2.0.vsix`. Download that file, and install it in VS Code with **Extensions: Install from VSIX…** from the Command Palette (Ctrl+Shift+P), or from a terminal:

```bash
code --install-extension efx-vscode-0.2.0.vsix
```

## Use

VS Code opens every `.efx` file as EFX-2, the EFX of the SDK 2. When a file opens, the extension reads its start in both versions, as the [EFX highlighter](https://github.com/OP-TED/efx-syntax-highlighter)'s `inferEfx` does, in a worker thread of its own, and takes the version and the kind of file that read it best, EFX-2 on a tie, as for an empty file: a file that reads as EFX-1 is switched to EFX-1, and a rules file is coloured as rules. The status bar shows the file's language, "EFX-2" or "EFX-1"; to choose the other, click it, or run **Change Language Mode** (Ctrl+K M), and pick "EFX-1" or "EFX-2". Beside it, for an EFX-2 file, it shows whether the file is read as a template or as rules, "Template" or "Rules", once that is known; to choose the other, click it, or run **EFX: Read as Template** or **EFX: Read as Rules** from the Command Palette. A new file is a template until then. A language or a kind chosen so stays while the file is open.

The colours come in two steps, as for most languages in VS Code. As soon as the file shows, a TextMate grammar colours it, as regular expressions can. Then the extension reads it with the parser of its version, from the [EFX highlighter](https://github.com/OP-TED/efx-syntax-highlighter), in a worker thread of its own, so that VS Code stays responsive while it reads a large file, and gives VS Code its colours as semantic tokens: they are the colours of the TextMate grammar but where only the parser can tell, as for the colon of `text:$title`, which is part of a type. Semantic colours are on for EFX whatever the theme (`editor.semanticHighlighting.enabled`). Themes colour the tokens by their TextMate scopes, listed in the README of the highlighter, or by the types of semantic token: VS Code's own `keyword`, `type`, `function` (with `defaultLibrary` for EFX's functions), `string`, `number`, `property` (fields and nodes), `variable`, `operator` and `comment`, and the extension's `efxWord` (a word of an expression, a kind of `keyword`), `efxLiteral`, `efxAssetName`, `efxText` (the text of a template), `efxPunctuation` and `efxBracket`.

In an EFX file:

- **Toggle Line Comment** (Ctrl+/, or Cmd+/ on macOS) puts `//` before the selected lines, or takes it away again.
- The brackets `( )`, `[ ]` and `{ }`, and the blocks `${ }`, `#{ }` and `@{ }`, go in pairs: the `}` of a block pairs with the `${`, `#{` or `@{` that opens it. VS Code highlights both ends of the pair at the cursor, and **Go to Bracket** (Ctrl+Shift+\\, or Cmd+Shift+\\ on macOS) moves the cursor from one end to the other.
- Typing an opening bracket, or the opening of a block, adds its closing `)`, `]` or `}` after the cursor.

## Develop

```bash
npm install      # once, after cloning
npm run build    # bundles the extension into dist/extension.js and dist/worker.js, with source maps for debugging
npm run package  # checks the types, and writes the .vsix from a build without the source map
npm test         # writes the .vsix, and runs the tests inside VS Code, with the .vsix installed in it
```

In VS Code, **Run the extension** (F5) opens a second VS Code window with the extension as it is in this folder, on the folder `test/workspace/`: open `template.efx`, `rules.efx` or `efx1.efx` there to try it.

The EFX languages, EFX-2 (`efx`) and EFX-1 (`efx1`), are declared in `package.json` (`contributes`), with their file extension, comments and brackets (`language-configuration.json`), their TextMate grammars, the extension's types of semantic token and the TextMate scope of each type. The code of the extension is TypeScript, in `src/`: `extension.ts` sets up the rest when VS Code opens the first EFX file; `EfxReadings.ts` finds what each EFX file holds, through the worker, and switches a file to EFX-1; `EfxKindStatus.ts` shows the kind of an EFX-2 file in the status bar, with the commands that choose it; `EfxSemanticTokens.ts` gives VS Code the parser's colours, read once for each version of a file; `EfxWorker.ts` runs the parser in the worker thread, `worker.ts`, one request at a time, and keeps only the newest of those that wait for each file; `EfxTokenKinds.ts` gives each highlight tag of the highlighter its type of semantic token; `EfxLanguage.ts` names the two languages. What reads EFX comes from the highlighter, `@op-ted/efx-syntax-highlighter` on npm: its functions `inferEfx` and `efxHighlights`, and its TextMate grammars. `scripts/build.mjs` bundles the code, the highlighter included, with [esbuild](https://esbuild.github.io/) into `dist/extension.js`, which VS Code loads, and `dist/worker.js`, its worker thread, and copies the highlighter's grammars beside them; `tsc` checks the types. `npm run package` writes the `.vsix` with [vsce](https://github.com/microsoft/vscode-vsce); the `files` field of `package.json` lists what it holds besides `package.json` and the README.

The tests, `test/*.test.ts`, check the extension as people install it. `npm test` writes the `.vsix`, downloads VS Code into `.vscode-test/` (which git ignores), installs the `.vsix` in it, and runs the tests there, in the oldest VS Code that the extension supports (`engines` in `package.json`) and in the latest (`.vscode-test.mjs`). The tests open the EFX files of `test/workspace/` and untitled EFX documents, and type into them; keys pressed in their window while they run change what they find. On a Linux desktop, run them on a display of their own: `xvfb-run -a npm test`. Developing needs Node 22 or later.

## Releasing

Pushing a tag of the form `x.y.z` runs the Build workflow, which builds and tests the `.vsix`, as for every push, and then attaches it to a GitHub release of the tag, with `CHANGELOG.md` as the release notes. The tag does not set the version, so tag the commit that sets it in `package.json`, with the same number (for example `0.1.0`); the workflow refuses a tag that differs. For every other push, the workflow keeps the `.vsix` with the run, under its artifacts.

## Licence

[EUPL 1.2](LICENSE)
