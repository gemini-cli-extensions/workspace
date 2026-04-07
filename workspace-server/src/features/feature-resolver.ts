/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Feature Resolver
 *
 * Resolves the final set of enabled tools and required OAuth scopes
 * using a three-layer precedence model:
 *
 *   1. Baked-in defaults (from feature-config.ts)
 *   2. Settings from gemini-extension.json (future — placeholder layer)
 *   3. WORKSPACE_FEATURE_OVERRIDES env var (highest precedence)
 *
 * Override syntax examples:
 *   - Group-level:  "gmail.write:off,slides.write:on"
 *   - Tool-level:   "calendar.deleteEvent:off,gmail.send:off"
 *
 * Tool-level overrides are subtractive only — they can disable individual
 * tools within an enabled group but cannot enable tools in a disabled group.
 */

import { logToFile } from '../utils/logger';
import {
  FEATURE_GROUPS,
  featureGroupKey,
  type FeatureGroup,
} from './feature-config';

export interface ResolvedFeatures {
  /** Set of tool names that should be registered */
  enabledTools: Set<string>;
  /** Deduplicated list of OAuth scopes required by enabled features */
  requiredScopes: string[];
}

interface Override {
  key: string; // e.g. "gmail.write" or "calendar.deleteEvent"
  enabled: boolean;
}

/**
 * Parses the WORKSPACE_FEATURE_OVERRIDES env var.
 *
 * Format: comma-separated "key:on" or "key:off" pairs.
 * Whitespace is trimmed. Empty entries are skipped.
 */
export function parseOverrides(raw: string): Override[] {
  const overrides: Override[] = [];
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const colonIndex = trimmed.lastIndexOf(':');
    if (colonIndex === -1) {
      logToFile(
        `[feature-resolver] Ignoring malformed override (missing ':'): "${trimmed}"`,
      );
      continue;
    }

    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed
      .slice(colonIndex + 1)
      .trim()
      .toLowerCase();

    if (value !== 'on' && value !== 'off') {
      logToFile(
        `[feature-resolver] Ignoring override with invalid value (expected on/off): "${trimmed}"`,
      );
      continue;
    }

    overrides.push({ key, enabled: value === 'on' });
  }
  return overrides;
}

/** Lookup from feature group key ("docs.read") to FeatureGroup. */
const GROUP_INDEX: ReadonlyMap<string, FeatureGroup> = new Map(
  FEATURE_GROUPS.map((fg) => [featureGroupKey(fg), fg]),
);

/** Lookup from tool name to its feature group key. */
const TOOL_INDEX: ReadonlyMap<string, string> = new Map(
  FEATURE_GROUPS.flatMap((fg) => {
    const key = featureGroupKey(fg);
    return fg.tools.map((tool) => [tool, key] as const);
  }),
);

/**
 * Resolves which features are enabled and computes the required scopes.
 *
 * @param settingsOverrides - Future: overrides from gemini-extension.json settings UI
 * @param envOverrides - Raw value of WORKSPACE_FEATURE_OVERRIDES env var
 */
export function resolveFeatures(
  settingsOverrides?: Record<string, boolean>,
  envOverrides?: string,
): ResolvedFeatures {
  const groupIndex = GROUP_INDEX;
  const toolIndex = TOOL_INDEX;

  // Layer 1: Start with defaults
  const groupEnabled = new Map<string, boolean>();
  for (const fg of FEATURE_GROUPS) {
    groupEnabled.set(featureGroupKey(fg), fg.defaultEnabled);
  }

  // Layer 2: Apply settings overrides (future — from gemini-extension.json)
  if (settingsOverrides) {
    for (const [key, enabled] of Object.entries(settingsOverrides)) {
      if (groupIndex.has(key)) {
        groupEnabled.set(key, enabled);
      }
    }
  }

  // Layer 3: Apply env var overrides (highest precedence)
  const toolDisabled = new Set<string>();
  if (envOverrides) {
    const overrides = parseOverrides(envOverrides);
    for (const { key, enabled } of overrides) {
      if (groupIndex.has(key)) {
        // Group-level override
        groupEnabled.set(key, enabled);
      } else if (toolIndex.has(key)) {
        // Tool-level override (subtractive only)
        if (!enabled) {
          toolDisabled.add(key);
        } else {
          logToFile(
            `[feature-resolver] Tool-level override "${key}:on" ignored — tool overrides are subtractive only`,
          );
        }
      } else {
        logToFile(
          `[feature-resolver] Unknown override key: "${key}" — not a known feature group or tool`,
        );
      }
    }
  }

  // Collect enabled tools and scopes
  const enabledTools = new Set<string>();
  const scopeSet = new Set<string>();

  for (const fg of FEATURE_GROUPS) {
    const key = featureGroupKey(fg);
    if (!groupEnabled.get(key)) continue;

    // Add scopes for this enabled group
    for (const scope of fg.scopes) {
      scopeSet.add(scope);
    }

    // Add tools (minus individually disabled ones)
    for (const tool of fg.tools) {
      if (!toolDisabled.has(tool)) {
        enabledTools.add(tool);
      }
    }
  }

  const requiredScopes = [...scopeSet];

  logToFile(
    `[feature-resolver] Resolved ${enabledTools.size} tools, ${requiredScopes.length} scopes`,
  );

  return { enabledTools, requiredScopes };
}
