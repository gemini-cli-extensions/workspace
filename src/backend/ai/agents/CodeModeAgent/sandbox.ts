/**
 * @fileoverview Sandbox preparation utilities for the CodeModeAgent.
 *
 * The `WORKER_LOADERS` binding loads a `modules: { "main.js": code }` entry as a
 * plain **JavaScript** ES module — the runtime does not transpile TypeScript.
 * User- and model-authored snippets routinely contain TypeScript syntax
 * (parameter type annotations like `_request: Request`, return types, `interface`
 * / `type` declarations, `as` casts, generics), which make the isolate throw
 * `Unexpected token ':'` at parse time.
 *
 * esbuild-wasm is not available inside a Durable Object, so we perform a light,
 * AST-free strip of the most common TypeScript-only constructs. This is
 * deliberately conservative: it targets syntax that is illegal in JS but has no
 * runtime effect, leaving the executable logic intact.
 *
 * We also normalize the two accepted entry shapes into a single canonical
 * `export default { fetch }` module so both
 *   - `export default { fetch(req) { … } }`
 *   - `addEventListener('fetch', (e) => e.respondWith(…))`
 *   - a bare expression / statement body (implicit `return`)
 * run successfully.
 */

/** Result of preparing a snippet for the isolate. */
export interface PreparedModule {
  /** The final JavaScript module source, guaranteed to export a fetch handler. */
  code: string;
  /** How the entry handler was resolved, for diagnostics. */
  entry: "module" | "listener" | "wrapped-return" | "wrapped-expression";
}

/**
 * Strip TypeScript-only syntax that is invalid in a plain JS module.
 *
 * Handled (regex-based, no full parser):
 *  - `interface Name { … }` blocks (balanced-brace removal)
 *  - top-level `type Name = …;` aliases
 *  - `import type` / `export type` statements
 *  - parameter & variable type annotations (`: Type`) up to `,` `)` `=` `{` `;`
 *  - return type annotations on functions/arrows
 *  - `as Type` / `as const` casts
 *  - non-null assertions (`!` before `.`, `)`, `;`, `,`)
 *  - generic type arguments on calls/declarations are left alone (they are
 *    usually valid-enough or rare in snippets); we only remove annotations.
 *
 * @param src - Raw snippet, possibly containing TypeScript.
 * @returns JavaScript-safe source.
 */
export function stripTypeScript(src: string): string {
  let out = src;

  // Remove `import type … ;` and `export type … ;` lines entirely.
  out = out.replace(/^\s*(?:import|export)\s+type\s+[^;\n]*;?$/gm, "");

  // Remove `interface Name … { … }` blocks with balanced braces.
  out = removeBalancedBlocks(out, /\binterface\s+[A-Za-z_$][\w$]*\s*(?:extends\s+[^{]+)?{/g);

  // Remove top-level `type X = … ;` aliases (single or multi-line up to `;`).
  out = out.replace(/^\s*(?:export\s+)?type\s+[A-Za-z_$][\w$]*\s*(?:<[^>]*>)?\s*=[\s\S]*?;\s*$/gm, "");

  // Strip `as const` and `as SomeType` casts.
  out = out.replace(/\s+as\s+const\b/g, "");
  out = out.replace(/\s+as\s+[A-Za-z_$][\w$.<>[\] |&]*/g, "");

  // Strip parameter/variable/property type annotations: a `:` followed by a
  // type expression, stopping before `,` `)` `=` `{` `;` `\n` at the same depth.
  out = stripAnnotations(out);

  // Strip non-null assertions (`foo!.bar`, `foo!`).
  out = out.replace(/!(?=\s*[.);,\]])/g, "");

  return out;
}

/**
 * Remove balanced `{ … }` blocks whose opening is matched by `opener`.
 * Used for `interface` declarations.
 */
function removeBalancedBlocks(src: string, opener: RegExp): string {
  let result = src;
  let match: RegExpExecArray | null;
  // Re-scan from scratch each pass because indices shift after a removal.
  // Bounded by the number of matches, so it terminates.
  // eslint-disable-next-line no-cond-assign
  while ((match = opener.exec(result))) {
    const start = match.index;
    let depth = 0;
    let i = match.index + match[0].length - 1; // at the opening brace
    for (; i < result.length; i++) {
      const ch = result[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    result = result.slice(0, start) + result.slice(i + 1);
    opener.lastIndex = 0;
  }
  return result;
}

/**
 * Strip type annotations introduced by a top-level `:` in parameter lists,
 * variable declarations, and function return positions. Skips `:` that belong
 * to object literals, ternaries, and labels by only removing annotations that
 * are followed by an identifier/type-looking token and terminated by a
 * structural delimiter.
 */
function stripAnnotations(src: string): string {
  // Return-type annotations: `) : Type {` or `) : Type =>`.
  let out = src.replace(/\)\s*:\s*[A-Za-z_$][\w$.<>[\], |&]*(?=\s*(?:{|=>))/g, ")");

  // Parameter / variable annotations: `<ident> : <Type>` terminated by , ) = ; or newline.
  // Require the type to start with a capital letter, `(`, `{`, or a known lowercase
  // primitive to avoid eating object-literal / ternary colons.
  const primitives = "string|number|boolean|any|unknown|void|never|object|bigint|symbol|null|undefined|Record|Array|Promise|Request|Response|Map|Set|readonly";
  const typeStart = `(?:[A-Z][\\w$]*|(?:${primitives})\\b)`;
  const annotation = new RegExp(
    `(\\b[A-Za-z_$][\\w$]*\\??)\\s*:\\s*${typeStart}[\\w$.<>\\[\\]\\s|&,]*?(?=\\s*[,)=;\\n])`,
    "g",
  );
  out = out.replace(annotation, "$1");

  return out;
}

/**
 * Whether the (already TS-stripped) source exposes a usable fetch entrypoint.
 * Accepts both modern `export default { fetch }` and the legacy
 * `addEventListener('fetch', …)` service-worker form.
 */
export function hasFetchEntry(code: string): boolean {
  const hasModuleDefault = /export\s+default\b/.test(code) && /\bfetch\b/.test(code);
  const hasListener = /addEventListener\s*\(\s*['"]fetch['"]/.test(code);
  return hasModuleDefault || hasListener;
}

/**
 * Normalize a snippet into a loadable ES module that always exports a default
 * object with a `fetch` handler.
 *
 * Resolution order:
 *  1. Already a module (`export default { … }`) → strip TS, use as-is.
 *  2. Service-worker listener (`addEventListener('fetch', …)`) → wrap in a
 *     module whose fetch delegates to the dispatched handler via a shim.
 *  3. A bare body containing `return …` → wrap the body in a fetch handler that
 *     JSON-encodes the returned value.
 *  4. Otherwise treat the snippet as an expression and return its value.
 *
 * @param rawCode - The user/model snippet (may be TypeScript).
 * @returns A prepared JavaScript module + how the entry was resolved.
 */
export function prepareModule(rawCode: string): PreparedModule {
  const code = stripTypeScript(rawCode).trim();

  if (/export\s+default\b/.test(code)) {
    return { code, entry: "module" };
  }

  if (/addEventListener\s*\(\s*['"]fetch['"]/.test(code)) {
    return { code: wrapListener(code), entry: "listener" };
  }

  if (/\breturn\b/.test(code)) {
    return { code: wrapReturningBody(code), entry: "wrapped-return" };
  }

  return { code: wrapExpression(code), entry: "wrapped-expression" };
}

/** Wrap a service-worker `addEventListener('fetch', …)` snippet into a module. */
function wrapListener(code: string): string {
  // Provide a local `addEventListener` shim that captures the fetch handler,
  // then run the user's listener registration, then delegate from the module's
  // fetch export. The shim is declared BEFORE the user code so the call resolves
  // to it rather than the (absent) global.
  return `let __handler;
const addEventListener = (type, fn) => { if (type === "fetch") __handler = fn; };
${code}
export default {
  async fetch(request) {
    if (!__handler) return new Response("No fetch listener registered", { status: 500 });
    let response;
    const event = { request, respondWith(r) { response = r; } };
    await __handler(event);
    return response ?? new Response(null, { status: 204 });
  },
};`;
}

/**
 * Wrap a statement body that uses `return` into a fetch handler. The returned
 * value is JSON-encoded so the panel can display structured output.
 */
function wrapReturningBody(body: string): string {
  return `export default {
  async fetch(_request) {
    const __run = async () => {
${indent(body)}
    };
    const __value = await __run();
    return new Response(
      JSON.stringify(__value ?? null, null, 2),
      { headers: { "content-type": "application/json" } },
    );
  },
};`;
}

/** Wrap a bare expression snippet, echoing its evaluated value as JSON. */
function wrapExpression(expr: string): string {
  const cleaned = expr.replace(/;\s*$/, "");
  return `export default {
  async fetch(_request) {
    const __value = await (async () => (${cleaned}))();
    return new Response(
      JSON.stringify(__value ?? null, null, 2),
      { headers: { "content-type": "application/json" } },
    );
  },
};`;
}

/** Indent every line of `text` by two levels (six spaces) for readability. */
function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.trim() ? `      ${line}` : line))
    .join("\n");
}
