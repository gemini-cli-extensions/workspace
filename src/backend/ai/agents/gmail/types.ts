/**
 * @fileoverview Types for the Gmail specialist agent.
 *
 * Centralizes the input/output shapes shared across the agent class, its
 * callable RPC methods, and its AI tool definitions.
 */

import { z } from "zod";

import type { GoogleAccount } from "@/backend/auth/provider";

/** Account selector accepted by every Gmail RPC method. */
export const accountArg = z
  .enum(["workspace", "personal"])
  .default("workspace");

/** Schema for sending a message via Gmail. */
export const sendMessageSchema = z.object({
  to: z.email(),
  subject: z.string(),
  body: z.string(),
  cc: z.email().optional(),
  bcc: z.email().optional(),
  html: z.boolean().optional(),
});

/** Inferred type for {@link sendMessageSchema}. */
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/** Result of a Gmail health probe. */
export interface GmailHealth {
  agent: "gmail";
  ok: boolean;
  account: GoogleAccount;
  labelCount?: number;
  error?: string;
}
