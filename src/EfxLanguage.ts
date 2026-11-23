import type * as vscode from 'vscode';

/** A language of VS Code for a version of EFX (package.json "languages"). */
export class EfxLanguage {
  /** EFX-2, the language of every .efx file when VS Code opens it. */
  static readonly EFX_2 = new EfxLanguage('efx', 2);

  /** EFX-1, which a file is switched to when it reads as EFX-1 (EfxReadings). */
  static readonly EFX_1 = new EfxLanguage('efx1', 1);

  static readonly ALL: readonly EfxLanguage[] = [EfxLanguage.EFX_2, EfxLanguage.EFX_1];

  private constructor(readonly id: string, readonly version: 1 | 2) {}

  /** The EFX language of a document, or undefined for a document of another language. */
  static of(document: vscode.TextDocument): EfxLanguage | undefined {
    return EfxLanguage.ALL.find((language) => language.id === document.languageId);
  }

  /** The documents of this language, for VS Code's providers. */
  get selector(): vscode.DocumentFilter {
    return { language: this.id };
  }
}
