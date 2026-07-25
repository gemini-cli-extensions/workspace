/**
 * @fileoverview Barrel for the PlateJS notes editor feature.
 *
 * - `PlateEditor`  — editable island (mount `client:only="react"`).
 * - `PlateRenderer`— read-only render for list/preview cards.
 * - serialization helpers bridge the Plate value and the team-notes `body`
 *   string column (legacy plain text handled transparently).
 */

export { PlateEditor, type PlateEditorProps } from "./PlateEditor";
export { PlateRenderer, type PlateRendererProps } from "./PlateRenderer";
export {
  bodyToPlateValue,
  bodyToSnippet,
  emptyPlateValue,
  extractPlainText,
  plainTextToPlateValue,
  plateValueToBody,
  type PlateElement,
  type PlateNode,
  type PlateText,
  type PlateValue,
} from "./plate-value";
