/**
 * @fileoverview Serialization layer between the PlateJS editor value and the
 * team-notes API `body` column (a plain `string`).
 *
 * We do NOT change the backend schema. The `body` string stores a JSON-encoded
 * Plate value wrapped in a small versioned envelope so we can tell rich-text
 * bodies apart from the legacy plain-text bodies that already exist in the DB.
 *
 * Wire format stored in `body`:
 *   {"v":1,"format":"plate","value":[ ...slate nodes... ]}
 *
 * Anything that is NOT a parseable envelope of this shape (legacy notes, or a
 * note authored before this feature shipped) is treated as raw plain text and
 * lifted into a single paragraph so the editor / renderer never crash.
 *
 * `extractPlainText` produces the search/preview snippet — it walks the Plate
 * tree and concatenates text leaves. The team-notes API still only sees a
 * `string`, so previews and the server-side `q` search keep working against the
 * JSON blob; the snippet is purely a client-side convenience for list cards.
 */

/** A single Slate/Plate text leaf. Marks (bold/italic/…) are boolean flags. */
export interface PlateText {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  code?: boolean;
  [mark: string]: unknown;
}

/** A Slate/Plate element node. `type` keys into the plugin registry. */
export interface PlateElement {
  type: string;
  children: PlateNode[];
  [prop: string]: unknown;
}

/** Either an element or a text leaf. */
export type PlateNode = PlateElement | PlateText;

/** The editor value is an array of top-level block elements. */
export type PlateValue = PlateElement[];

/** Versioned envelope persisted into the `body` string column. */
interface PlateEnvelope {
  v: 1;
  format: "plate";
  value: PlateValue;
}

const ENVELOPE_VERSION = 1 as const;

/** A minimal, valid empty document (one empty paragraph). */
export function emptyPlateValue(): PlateValue {
  return [{ type: "p", children: [{ text: "" }] }];
}

/** Type guard: does this node look like a Plate element (has `children`)? */
function isElement(node: PlateNode): node is PlateElement {
  return typeof node === "object" && node !== null && "children" in node && Array.isArray(node.children);
}

/** Wrap arbitrary plain text into a single-paragraph Plate value. */
export function plainTextToPlateValue(text: string): PlateValue {
  const trimmed = text ?? "";
  // Preserve hard line breaks as separate paragraphs so legacy multi-line
  // notes don't collapse into one run.
  const lines = trimmed.split(/\r?\n/);
  if (lines.length === 1) {
    return [{ type: "p", children: [{ text: lines[0] ?? "" }] }];
  }
  return lines.map((line) => ({ type: "p", children: [{ text: line }] }));
}

/**
 * Decode a stored `body` string into a Plate value for the editor/renderer.
 *
 * - Valid `{v:1,format:"plate",value:[…]}` envelope → returns `value`.
 * - Anything else (legacy plain text, malformed JSON, empty) → wraps the raw
 *   string as plain-text paragraphs. Never throws.
 */
export function bodyToPlateValue(body: string | null | undefined): PlateValue {
  const raw = body ?? "";
  if (!raw.trim()) return emptyPlateValue();

  // Only attempt JSON parsing if the string actually looks like our envelope;
  // this avoids accidentally interpreting a legacy note that happens to start
  // with `{` as malformed JSON and losing its text.
  if (raw.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as Partial<PlateEnvelope>;
      if (
        parsed &&
        parsed.format === "plate" &&
        parsed.v === ENVELOPE_VERSION &&
        Array.isArray(parsed.value) &&
        parsed.value.length > 0
      ) {
        return parsed.value as PlateValue;
      }
    } catch {
      // Fall through to plain-text handling below.
    }
  }

  return plainTextToPlateValue(raw);
}

/**
 * Encode an editor Plate value into the `body` string for persistence.
 * Empty documents are stored as an empty string so the API's "body required"
 * validation behaves the same as before.
 */
export function plateValueToBody(value: PlateValue): string {
  if (!value || value.length === 0 || !extractPlainText(value).trim()) {
    return "";
  }
  const envelope: PlateEnvelope = { v: ENVELOPE_VERSION, format: "plate", value };
  return JSON.stringify(envelope);
}

/**
 * Flatten a Plate value to plain text for previews, search snippets, and the
 * NoteDialog "body required" check. Joins block-level elements with newlines.
 */
export function extractPlainText(value: PlateValue | PlateNode[]): string {
  const parts: string[] = [];

  const walk = (nodes: PlateNode[]): string => {
    let acc = "";
    for (const node of nodes) {
      if (isElement(node)) {
        acc += walk(node.children);
      } else if (typeof node.text === "string") {
        acc += node.text;
      }
    }
    return acc;
  };

  for (const block of value) {
    if (isElement(block)) {
      parts.push(walk(block.children));
    } else if (typeof (block as PlateText).text === "string") {
      parts.push((block as PlateText).text);
    }
  }

  return parts.filter((p) => p.length > 0).join("\n");
}

/** Convenience: derive the preview snippet directly from a stored body string. */
export function bodyToSnippet(body: string | null | undefined): string {
  return extractPlainText(bodyToPlateValue(body));
}
