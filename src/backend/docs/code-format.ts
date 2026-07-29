/**
 * @file docs/code-format.ts
 * @description Pure syntax-highlighting → Docs batchUpdate requests. A heuristic
 * regex tokenizer (edge-safe, no grammar files) + theme palettes. Given the
 * index where code text starts (the 1x1 container cell's paragraph), emits the
 * insertText + per-token updateTextStyle requests. The container (shaded cell)
 * is styled by the tool, which knows the table location.
 */

export type TokenType = "keyword" | "string" | "comment" | "number" | "function" | "default";

type Rgb = { red: number; green: number; blue: number };
interface TokenStyle {
  color: Rgb;
  bold?: boolean;
  italic?: boolean;
}
export interface CodeTheme {
  background: Rgb;
  font: string;
  fontSizePt: number;
  default: Rgb;
  tokens: Record<Exclude<TokenType, "default">, TokenStyle>;
}

const hex = (r: number, g: number, b: number): Rgb => ({ red: r / 255, green: g / 255, blue: b / 255 });

export const CODE_THEMES: Record<string, CodeTheme> = {
  dracula: {
    background: hex(40, 42, 54),
    font: "Consolas",
    fontSizePt: 10,
    default: hex(248, 248, 242),
    tokens: {
      keyword: { color: hex(255, 121, 198), bold: true },
      string: { color: hex(241, 250, 140) },
      comment: { color: hex(98, 114, 164), italic: true },
      number: { color: hex(189, 147, 249) },
      function: { color: hex(80, 250, 123) },
    },
  },
  github: {
    background: hex(246, 248, 250),
    font: "Consolas",
    fontSizePt: 10,
    default: hex(36, 41, 47),
    tokens: {
      keyword: { color: hex(207, 34, 46), bold: true },
      string: { color: hex(10, 48, 105) },
      comment: { color: hex(106, 115, 125), italic: true },
      number: { color: hex(5, 80, 174) },
      function: { color: hex(110, 60, 190) },
    },
  },
};

const KEYWORDS: Record<string, string[]> = {
  sql: ["select", "from", "where", "insert", "into", "values", "update", "set", "delete", "create", "table", "alter", "add", "column", "drop", "join", "left", "right", "inner", "outer", "on", "group", "by", "order", "having", "limit", "references", "primary", "key", "foreign", "not", "null", "default", "and", "or"],
  javascript: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "import", "from", "export", "class", "async", "await", "try", "catch", "new", "typeof", "of", "in"],
  typescript: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "import", "from", "export", "class", "async", "await", "try", "catch", "new", "typeof", "interface", "type", "enum", "as", "of", "in"],
  python: ["def", "return", "if", "elif", "else", "for", "while", "import", "from", "class", "try", "except", "with", "as", "lambda", "yield", "async", "await", "and", "or", "not", "in", "is", "None", "True", "False"],
  bash: ["if", "then", "else", "fi", "for", "in", "do", "done", "while", "case", "esac", "function", "echo", "export", "local", "return"],
};

/** Heuristic single-pass tokenizer. Comments/strings first so they win overlaps. */
export function tokenizeCode(code: string, language: string): { type: Exclude<TokenType, "default">; start: number; end: number }[] {
  const kw = KEYWORDS[language.toLowerCase()] ?? [];
  const kwPattern = kw.length ? new RegExp(`\\b(${kw.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi") : null;
  const rules: { type: Exclude<TokenType, "default">; regex: RegExp }[] = [
    { type: "comment", regex: /(\/\/.*|\/\*[\s\S]*?\*\/|#.*|--.*)/g },
    { type: "string", regex: /(["'`])(?:\\.|(?!\1).)*\1/g },
    { type: "function", regex: /\b([a-zA-Z_]\w*)(?=\s*\()/g },
    ...(kwPattern ? [{ type: "keyword" as const, regex: kwPattern }] : []),
    { type: "number", regex: /\b\d+(\.\d+)?\b/g },
  ];

  const taken: { start: number; end: number }[] = [];
  const overlaps = (s: number, e: number) => taken.some((t) => s < t.end && e > t.start);
  const out: { type: Exclude<TokenType, "default">; start: number; end: number }[] = [];
  for (const rule of rules) {
    let m: RegExpExecArray | null;
    rule.regex.lastIndex = 0;
    while ((m = rule.regex.exec(code)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (end === start || overlaps(start, end)) continue;
      out.push({ type: rule.type, start, end });
      taken.push({ start, end });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

type DocsRequest = Record<string, unknown>;

const colorStyle = (c: Rgb) => ({ color: { rgbColor: c } });

/** insertText + default styling + per-token color requests, anchored at `cellIndex`. */
export function buildCodeTextRequests(
  cellIndex: number,
  code: string,
  language: string,
  themeName: string,
  tabId?: string,
): DocsRequest[] {
  const theme = CODE_THEMES[themeName] ?? CODE_THEMES.github;
  const loc = (index: number) => (tabId ? { index, tabId } : { index });
  const range = (startIndex: number, endIndex: number) => (tabId ? { startIndex, endIndex, tabId } : { startIndex, endIndex });

  const requests: DocsRequest[] = [
    { insertText: { location: loc(cellIndex), text: code } },
    {
      updateTextStyle: {
        range: range(cellIndex, cellIndex + code.length),
        textStyle: {
          weightedFontFamily: { fontFamily: theme.font },
          fontSize: { magnitude: theme.fontSizePt, unit: "PT" },
          foregroundColor: colorStyle(theme.default),
        },
        fields: "weightedFontFamily,fontSize,foregroundColor",
      },
    },
  ];

  for (const tok of tokenizeCode(code, language)) {
    const style = theme.tokens[tok.type];
    const fields = ["foregroundColor", style.bold ? "bold" : "", style.italic ? "italic" : ""].filter(Boolean).join(",");
    requests.push({
      updateTextStyle: {
        range: range(cellIndex + tok.start, cellIndex + tok.end),
        textStyle: {
          foregroundColor: colorStyle(style.color),
          ...(style.bold ? { bold: true } : {}),
          ...(style.italic ? { italic: true } : {}),
        },
        fields,
      },
    });
  }
  return requests;
}
