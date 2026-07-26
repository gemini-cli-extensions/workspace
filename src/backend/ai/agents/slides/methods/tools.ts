/**
 * @fileoverview AI SDK tool definitions for the Slides agent chat surface.
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";

import type { GoogleSlidesClient } from "@/backend/google";
import type { SlideLayout } from "@/backend/ai/agents/slides/types";

/** Predefined layouts the model may pick from when adding a slide. */
const SLIDE_LAYOUTS = [
  "BLANK",
  "CAPTION_ONLY",
  "TITLE",
  "TITLE_AND_BODY",
  "TITLE_AND_TWO_COLUMNS",
  "TITLE_ONLY",
  "SECTION_HEADER",
  "SECTION_TITLE_AND_DESCRIPTION",
  "ONE_COLUMN_TEXT",
  "MAIN_POINT",
  "BIG_NUMBER",
] as const satisfies readonly SlideLayout[];

/**
 * Build the Slides chat tool set bound to a client instance.
 */
export function buildSlidesTools(client: GoogleSlidesClient): ToolSet {
  return {
    createPresentation: tool({
      description: "Create a new Google Slides presentation.",
      inputSchema: z.object({ title: z.string() }),
      execute: async ({ title }) => client.createPresentation(title),
    }),
    readPresentation: tool({
      description: "Read a presentation's structure.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => client.read(id),
    }),
    createSlide: tool({
      description: "Add a slide to a presentation.",
      inputSchema: z.object({
        id: z.string(),
        layout: z.enum(SLIDE_LAYOUTS).default("BLANK"),
      }),
      execute: async ({ id, layout }) => client.createSlide(id, layout),
    }),
    insertText: tool({
      description: "Insert text into a slide object placeholder.",
      inputSchema: z.object({ id: z.string(), objectId: z.string(), text: z.string() }),
      execute: async ({ id, objectId, text }) => client.insertText(id, objectId, text),
    }),
    replaceAllText: tool({
      description: "Replace all occurrences of text across a presentation.",
      inputSchema: z.object({ id: z.string(), find: z.string(), replace: z.string() }),
      execute: async ({ id, find, replace }) => client.replaceAllText(id, find, replace),
    }),
  };
}
