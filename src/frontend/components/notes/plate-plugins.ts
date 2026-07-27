/**
 * @fileoverview The shared PlateJS plugin stack for team notes.
 *
 * One source of truth so the editable `PlateEditor` and the read-only
 * `PlateRenderer` register the same nodes — saved notes therefore render
 * identically to how they were authored.
 *
 * Capability surface (matches the toolbar):
 *   marks   — bold, italic, underline
 *   blocks  — H1/H2/H3, blockquote, code block
 *   lists   — bulleted (disc) + numbered (decimal), indent-based
 *   inline  — link
 *
 * Lists use the modern indent-based `ListPlugin` (flat DOM, each block carries
 * its own `listStyleType`/`indent`), which requires the `IndentPlugin`.
 */

import {
  BlockquotePlugin,
  BoldPlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  ItalicPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react";
import { CodeBlockPlugin, CodeLinePlugin } from "@platejs/code-block/react";
import { IndentPlugin } from "@platejs/indent/react";
import { LinkPlugin } from "@platejs/link/react";
import { ListPlugin } from "@platejs/list/react";
import { ParagraphPlugin } from "platejs/react";

import {
  BlockquoteElement,
  BoldLeaf,
  CodeBlockElement,
  CodeLineElement,
  H1Element,
  H2Element,
  H3Element,
  ItalicLeaf,
  LinkElement,
  ParagraphElement,
  UnderlineLeaf,
} from "./PlateNodes";

export { ParagraphElement };

/**
 * The full plugin list, with each node wired to its Monolith-styled component.
 * `usePlateEditor`/`createPlateEditor` memoize the editor; this array is a
 * stable module constant so the editor identity stays stable across renders.
 */
export const notesPlugins = [
  // Default block
  ParagraphPlugin.withComponent(ParagraphElement),

  // Marks
  BoldPlugin.withComponent(BoldLeaf),
  ItalicPlugin.withComponent(ItalicLeaf),
  UnderlinePlugin.withComponent(UnderlineLeaf),

  // Headings
  H1Plugin.withComponent(H1Element),
  H2Plugin.withComponent(H2Element),
  H3Plugin.withComponent(H3Element),

  // Blocks
  BlockquotePlugin.withComponent(BlockquoteElement),
  CodeBlockPlugin.withComponent(CodeBlockElement),
  CodeLinePlugin.withComponent(CodeLineElement),

  // Inline
  LinkPlugin.withComponent(LinkElement),

  // Lists (indent-based) + the indent dependency it builds on
  IndentPlugin,
  ListPlugin,
];
