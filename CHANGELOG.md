# EFX for VS Code 0.1.0 Release Notes

_EFX for VS Code is an extension that gives [VS Code](https://code.visualstudio.com/) support for [EFX](https://docs.ted.europa.eu/eforms/latest/efx), the expression and template language of the eForms SDK._

---

## In this release

This is the first release of the extension. It opens `.efx` files as EFX, with EFX's comments and brackets ([TEDEFO-5383](https://citnet.tech.ec.europa.eu/CITnet/jira/browse/TEDEFO-5383)):

- VS Code opens every `.efx` file as EFX, whether it holds a view template or validation rules, in EFX-1 or EFX-2.
- **Toggle Line Comment** (Ctrl+/) puts `//` before the selected lines, or takes it away again.
- The brackets `( )`, `[ ]` and `{ }`, and the blocks `${ }`, `#{ }` and `@{ }`, go in pairs: VS Code highlights both ends of the pair at the cursor, and **Go to Bracket** (Ctrl+Shift+\\) moves the cursor from one end to the other. Typing an opening bracket adds its closing one.

The extension is the `.vsix` file attached to this release. Install it in VS Code 1.101 or later with **Extensions: Install from VSIX…** from the Command Palette.
