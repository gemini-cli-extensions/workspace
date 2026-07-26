/**
 * @fileoverview Types for the Slides specialist agent.
 */

import type { GoogleAccount } from "@/backend/auth/provider";

/** Predefined Slides layout names accepted by the Slides client. */
export type SlideLayout =
  | "BLANK"
  | "CAPTION_ONLY"
  | "TITLE"
  | "TITLE_AND_BODY"
  | "TITLE_AND_TWO_COLUMNS"
  | "TITLE_ONLY"
  | "SECTION_HEADER"
  | "SECTION_TITLE_AND_DESCRIPTION"
  | "ONE_COLUMN_TEXT"
  | "MAIN_POINT"
  | "BIG_NUMBER";

/** Result of a Slides health probe. */
export interface SlidesHealth {
  agent: "slides";
  ok: boolean;
  account: GoogleAccount;
  error?: string;
}
