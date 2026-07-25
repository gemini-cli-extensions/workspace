/**
 * @fileoverview Type definitions for BrowserHitlAgent
 *
 * Provides type-safe interfaces and Zod schemas for browser automation
 * with human-in-the-loop approval workflows.
 */

import { z } from "zod";

/**
 * Browser navigation parameters
 */
export const navigateSchema = z.object({
  url: z.string().url().describe("Target URL to navigate to"),
  waitFor: z
    .enum(["load", "domcontentloaded", "networkidle"])
    .optional()
    .default("load")
    .describe("Wait condition after navigation"),
});

export type NavigateParams = z.infer<typeof navigateSchema>;

/**
 * Form filling parameters with approval requirement
 */
export const fillSecureFormSchema = z.object({
  url: z.string().url().describe("Page URL containing the form"),
  selector: z.string().describe("CSS selector for the form field"),
  payload: z.record(z.string(), z.any()).describe("Form data to fill"),
  submitSelector: z.string().optional().describe("CSS selector for submit button"),
});

export type FillSecureFormParams = z.infer<typeof fillSecureFormSchema>;

/**
 * Element click parameters with approval requirement
 */
export const clickElementSchema = z.object({
  url: z.string().url().describe("Page URL"),
  selector: z.string().describe("CSS selector for the element to click"),
  waitForNavigation: z.boolean().optional().default(false).describe("Wait for page navigation after click"),
});

export type ClickElementParams = z.infer<typeof clickElementSchema>;

/**
 * Screenshot capture parameters
 */
export const takeScreenshotSchema = z.object({
  url: z.string().url().optional().describe("URL to capture (if not current page)"),
  fullPage: z.boolean().optional().default(false).describe("Capture full scrollable page"),
  selector: z.string().optional().describe("Capture specific element only"),
});

export type TakeScreenshotParams = z.infer<typeof takeScreenshotSchema>;

/**
 * Browser action result
 */
export interface BrowserActionResult {
  status: "success" | "error" | "approval_required";
  message: string;
  url?: string;
  screenshot?: string; // base64 encoded
  error?: string;
}

/**
 * Agent state for browser automation tracking
 */
export interface BrowserAgentState {
  totalActions: number;
  approvedActions: number;
  rejectedActions: number;
  activeSessionUrl?: string;
}
