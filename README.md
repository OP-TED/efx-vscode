# efx-vscode

EFX support for [VS Code](https://code.visualstudio.com/). [EFX](https://docs.ted.europa.eu/eforms/latest/efx) is the expression and template language of the eForms SDK. The extension opens `.efx` files as EFX, whether they hold view templates or validation rules, in EFX-1 or EFX-2, and gives them EFX's comments and brackets. It needs VS Code 1.101 or later. What each release changes is in [CHANGELOG.md](CHANGELOG.md).

## Install

The extension is not on the VS Code Marketplace. Each [release](https://github.com/OP-TED/efx-vscode/releases) of this repository has it as a `.vsix` file, such as `efx-vscode-0.1.0.vsix`. Download that file, and install it in VS Code with **Extensions: Install from VSIX…** from the Command Palette (Ctrl+Shift+P), or from a terminal:

```bash
code --install-extension efx-vscode-0.1.0.vsix
```

## Use

VS Code opens every `.efx` file as EFX, and shows "EFX" as the file's language in the status bar. In an EFX file:

- **Toggle Line Comment** (Ctrl+/, or Cmd+/ on macOS) puts `//` before the selected lines, or takes it away again.
- The brackets `( )`, `[ ]` and `{ }`, and the blocks `${ }`, `#{ }` and `@{ }`, go in pairs: the `}` of a block pairs with the `${`, `#{` or `@{` that opens it. VS Code highlights both ends of the pair at the cursor, and **Go to Bracket** (Ctrl+Shift+\\, or Cmd+Shift+\\ on macOS) moves the cursor from one end to the other.
- Typing an opening bracket, or the opening of a block, adds its closing `)`, `]` or `}` after the cursor.

## Develop

```bash
npm install      # once, after cloning
npm run build    # bundles the extension into dist/extension.js, with a source map for debugging
npm run package  # checks the types, and writes the .vsix from a build without the source map
npm test         # writes the .vsix, and runs the tests inside VS Code, with the .vsix installed in it
```

In VS Code, **Run the extension** (F5) opens a second VS Code window with the extension as it is in this folder, on the folder `test/workspace/`: open `template.efx` there to try it.

The EFX language, its file extension, comments and brackets, is declared in `package.json` (`contributes.languages`) and in `language-configuration.json`. The code of the extension is TypeScript, in `src/`; `scripts/build.mjs` bundles it with [esbuild](https://esbuild.github.io/) into one file, `dist/extension.js`, which VS Code loads, and `tsc` checks the types. `npm run package` writes the `.vsix` with [vsce](https://github.com/microsoft/vscode-vsce); the `files` field of `package.json` lists what it holds besides `package.json` and the README.

The tests, `test/*.test.ts`, check the extension as people install it. `npm test` writes the `.vsix`, downloads VS Code into `.vscode-test/` (which git ignores), installs the `.vsix` in it, and runs the tests there, in the oldest VS Code that the extension supports (`engines` in `package.json`) and in the latest (`.vscode-test.mjs`). The tests open untitled EFX documents and type into them; keys pressed in their window while they run change what they find. On a Linux desktop, run them on a display of their own: `xvfb-run -a npm test`. Developing needs Node 22 or later.

## Releasing

Pushing a tag of the form `x.y.z` runs the Build workflow, which builds and tests the `.vsix`, as for every push, and then attaches it to a GitHub release of the tag, with `CHANGELOG.md` as the release notes. The tag does not set the version, so tag the commit that sets it in `package.json`, with the same number (for example `0.1.0`); the workflow refuses a tag that differs. For every other push, the workflow keeps the `.vsix` with the run, under its artifacts.

## Licence

[EUPL 1.2](LICENSE)
