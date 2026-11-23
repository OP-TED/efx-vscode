import type { EfxHighlight, EfxHighlightTag } from '@op-ted/efx-syntax-highlighter';

// The kinds of semantic token of the extension, and the tokens of a text as VS Code takes them,
// without VS Code's API, so that the worker thread (worker.ts) can make them.

/** A kind of semantic token of VS Code: its type, and its modifiers. */
interface TokenKind {
  readonly type: string;
  readonly modifiers: readonly string[];
}

/**
 * The kind of semantic token of each highlight tag: VS Code's own types where one fits, the others
 * the extension's own (package.json "semanticTokenTypes"). The tag of plain names makes no token.
 * package.json "semanticTokenScopes" gives each kind the TextMate scope of its tag, so that a theme
 * colours the tokens as the TextMate grammar's, but where it colours their kind itself.
 */
export const TOKEN_KINDS: Readonly<Record<Exclude<EfxHighlightTag, 'name'>, TokenKind>> = {
  keyword: { type: 'keyword', modifiers: [] },
  className: { type: 'efxWord', modifiers: [] },
  typeName: { type: 'type', modifiers: [] },
  'function(keyword)': { type: 'function', modifiers: ['defaultLibrary'] },
  literal: { type: 'efxLiteral', modifiers: [] },
  string: { type: 'string', modifiers: [] },
  number: { type: 'number', modifiers: [] },
  propertyName: { type: 'property', modifiers: [] },
  variableName: { type: 'variable', modifiers: [] },
  'function(name)': { type: 'function', modifiers: [] },
  'special(name)': { type: 'efxAssetName', modifiers: [] },
  'special(string)': { type: 'efxText', modifiers: [] },
  operator: { type: 'operator', modifiers: [] },
  punctuation: { type: 'efxPunctuation', modifiers: [] },
  bracket: { type: 'efxBracket', modifiers: [] },
  lineComment: { type: 'comment', modifiers: [] },
};

const kinds = Object.values(TOKEN_KINDS);

/** The types and modifiers of the tokens, in the order of the legend that numbers them. */
export const TOKEN_TYPES: readonly string[] = [...new Set(kinds.map(({ type }) => type))];
export const TOKEN_MODIFIERS: readonly string[] = [...new Set(kinds.flatMap(({ modifiers }) => modifiers))];

/** Where each line of a text starts, and where its text ends, before its line break, as VS Code cuts lines. */
function linesOf(text: string): { start: number; end: number }[] {
  const lines: { start: number; end: number }[] = [];
  let start = 0;
  for (let at = 0; at < text.length; at += 1) {
    const code = text.charCodeAt(at);
    if (code === 0x0a || code === 0x0d) {
      lines.push({ start, end: at });
      if (code === 0x0d && text.charCodeAt(at + 1) === 0x0a) {
        at += 1;
      }
      start = at + 1;
    }
  }
  lines.push({ start, end: text.length });
  return lines;
}

/**
 * The semantic tokens of a text, from its highlighted ranges, as VS Code takes them: for each token,
 * a token for each line of its range, five numbers, each relative to the token before (its line, its
 * start, its length, its type and its modifiers, by the legend).
 */
export function encodedTokens(text: string, highlights: readonly EfxHighlight[]): Uint32Array {
  const lines = linesOf(text);
  const data: number[] = [];
  let line = 0;
  let previousLine = 0;
  let previousStart = 0;
  const sorted = [...highlights].sort((a, b) => a.from - b.from || a.to - b.to);
  for (const { from, to, tag } of sorted) {
    const kind = tag === 'name' ? undefined : TOKEN_KINDS[tag];
    if (kind !== undefined) {
      const type = TOKEN_TYPES.indexOf(kind.type);
      const modifiers = kind.modifiers.reduce((bits, modifier) => bits | (1 << TOKEN_MODIFIERS.indexOf(modifier)), 0);
      while (line + 1 < lines.length && lines[line + 1].start <= from) {
        line += 1;
      }
      for (let each = line; each < lines.length && lines[each].start < to; each += 1) {
        const first = Math.max(from, lines[each].start);
        const last = Math.min(to, lines[each].end);
        if (last > first) {
          const start = first - lines[each].start;
          data.push(each - previousLine, each === previousLine ? start - previousStart : start, last - first, type, modifiers);
          previousLine = each;
          previousStart = start;
        }
      }
    }
  }
  return Uint32Array.from(data);
}
