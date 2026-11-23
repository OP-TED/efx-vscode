# EFX for VS Code 0.2.0 Release Notes

_EFX for VS Code is an extension that gives [VS Code](https://code.visualstudio.com/) support for [EFX](https://docs.ted.europa.eu/eforms/latest/efx), the expression and template language of the eForms SDK._

---

## In this release

VS Code now colours EFX files, as the EFX highlighter of the SDK colours them.

- **EFX-2 and EFX-1.** When a `.efx` file opens, the extension finds which version of EFX it holds and colours it accordingly. A file that does not tell, such as an empty one, opens as EFX-2. To choose the other version, click the language in the status bar.
- **Templates and rules.** Beside the language, the status bar shows whether an EFX-2 file is read as a template or as rules, also found when the file opens. Click it to choose the other. A new file is a template.
- **Your choice stays** until you close the file.
- **Large files** do not slow VS Code down: the extension reads them in the background.
- **Every theme** colours keywords, functions, fields and nodes, variables and literal values in its own colours.

The colours come from the EFX highlighter 0.7.0.

The extension is the `.vsix` file attached to this release. Install it in VS Code 1.101 or later with **Extensions: Install from VSIX…** from the Command Palette.
