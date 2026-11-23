import * as vscode from 'vscode';

/** A semantic token: where it is in its document, and its type and modifiers by name. */
interface Token {
  readonly range: vscode.Range;
  readonly type: string;
  readonly modifiers: readonly string[];
}

/** The semantic tokens VS Code has for a document, from the providers of its language, read with their legend. */
export class SemanticTokens {
  private constructor(private readonly document: vscode.TextDocument, private readonly tokens: readonly Token[]) {}

  static async of(document: vscode.TextDocument): Promise<SemanticTokens> {
    const legend = await vscode.commands.executeCommand<vscode.SemanticTokensLegend | undefined>(
      'vscode.provideDocumentSemanticTokensLegend', document.uri);
    const tokens = await vscode.commands.executeCommand<vscode.SemanticTokens | undefined>(
      'vscode.provideDocumentSemanticTokens', document.uri);
    if (legend === undefined || tokens === undefined) {
      throw new Error(`VS Code has no semantic tokens for ${document.uri}`);
    }
    return new SemanticTokens(document, SemanticTokens.#decoded(tokens.data, legend));
  }

  /** The tokens, from the five numbers of each, relative to the token before (VS Code's encoding). */
  static #decoded(data: Uint32Array, legend: vscode.SemanticTokensLegend): Token[] {
    const tokens: Token[] = [];
    let line = 0;
    let character = 0;
    for (let index = 0; index < data.length; index += 5) {
      const [deltaLine, deltaStart, length, type, modifierBits] = data.slice(index, index + 5);
      line += deltaLine;
      character = deltaLine === 0 ? character + deltaStart : deltaStart;
      tokens.push({
        range: new vscode.Range(line, character, line, character + length),
        type: legend.tokenTypes[type],
        modifiers: legend.tokenModifiers.filter((_, bit) => (modifierBits & (1 << bit)) !== 0),
      });
    }
    return tokens;
  }

  /**
   * The type of the token at the first character of a text of the document, its occurrence-th one,
   * with its modifiers after a dot, as VS Code's selectors write them: 'function.defaultLibrary'.
   */
  at(text: string, occurrence = 0): string | undefined {
    const content = this.document.getText();
    let offset = content.indexOf(text);
    for (let found = 0; found < occurrence && offset >= 0; found += 1) {
      offset = content.indexOf(text, offset + 1);
    }
    if (offset < 0) {
      throw new Error(`the document has no ${text}`);
    }
    const position = this.document.positionAt(offset);
    const token = this.tokens.find(({ range }) => range.contains(position) && !range.end.isEqual(position));
    return token === undefined ? undefined : [token.type, ...token.modifiers].join('.');
  }
}
