/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../utils/logger', () => ({
  logToFile: jest.fn(),
}));

import {
  resolveFeatures,
  parseOverrides,
} from '../../features/feature-resolver';
import { FEATURE_GROUPS } from '../../features/feature-config';

describe('parseOverrides', () => {
  it('should parse valid overrides', () => {
    const result = parseOverrides('gmail.write:off,slides.write:on');
    expect(result).toEqual([
      { key: 'gmail.write', enabled: false },
      { key: 'slides.write', enabled: true },
    ]);
  });

  it('should handle whitespace', () => {
    const result = parseOverrides(' gmail.write : off , slides.write : on ');
    expect(result).toEqual([
      { key: 'gmail.write', enabled: false },
      { key: 'slides.write', enabled: true },
    ]);
  });

  it('should skip empty entries', () => {
    const result = parseOverrides('gmail.write:off,,slides.write:on,');
    expect(result).toHaveLength(2);
  });

  it('should skip malformed entries (no colon)', () => {
    const result = parseOverrides('gmail.write:off,badentry,slides.write:on');
    expect(result).toHaveLength(2);
  });

  it('should skip entries with invalid values', () => {
    const result = parseOverrides('gmail.write:off,slides.write:maybe');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ key: 'gmail.write', enabled: false });
  });

  it('should handle empty string', () => {
    expect(parseOverrides('')).toEqual([]);
  });

  it('should handle tool-level overrides', () => {
    const result = parseOverrides('calendar.deleteEvent:off,gmail.send:off');
    expect(result).toEqual([
      { key: 'calendar.deleteEvent', enabled: false },
      { key: 'gmail.send', enabled: false },
    ]);
  });
});

describe('resolveFeatures', () => {
  it('should return all default-ON tools when no overrides', () => {
    const { enabledTools } = resolveFeatures();

    // All tools from default-ON groups should be present
    for (const fg of FEATURE_GROUPS) {
      if (fg.defaultEnabled) {
        for (const tool of fg.tools) {
          expect(enabledTools.has(tool)).toBe(true);
        }
      }
    }

    // No tools from default-OFF groups
    for (const fg of FEATURE_GROUPS) {
      if (!fg.defaultEnabled) {
        for (const tool of fg.tools) {
          expect(enabledTools.has(tool)).toBe(false);
        }
      }
    }
  });

  it('should compute scopes only for enabled groups', () => {
    const { requiredScopes } = resolveFeatures();

    // Default-OFF groups should not contribute scopes
    const offGroups = FEATURE_GROUPS.filter((fg) => !fg.defaultEnabled);
    for (const fg of offGroups) {
      for (const scope of fg.scopes) {
        // Only check if scope is absent when it's not also in an ON group
        const inOnGroup = FEATURE_GROUPS.some(
          (other) => other.defaultEnabled && other.scopes.includes(scope),
        );
        if (!inOnGroup) {
          expect(requiredScopes).not.toContain(scope);
        }
      }
    }
  });

  it('should disable a group via env override', () => {
    const { enabledTools, requiredScopes } = resolveFeatures(
      undefined,
      'gmail.write:off',
    );

    // Gmail write tools should be absent
    expect(enabledTools.has('gmail.send')).toBe(false);
    expect(enabledTools.has('gmail.createDraft')).toBe(false);
    expect(enabledTools.has('gmail.modify')).toBe(false);

    // Gmail read tools should still be present
    expect(enabledTools.has('gmail.search')).toBe(true);
    expect(enabledTools.has('gmail.get')).toBe(true);

    // gmail.readonly scope should be present (from gmail.read)
    expect(requiredScopes).toContain(
      'https://www.googleapis.com/auth/gmail.readonly',
    );
  });

  it('should enable a default-OFF group via env override', () => {
    const { requiredScopes } = resolveFeatures(undefined, 'tasks.read:on');

    // tasks.read scopes should be present
    expect(requiredScopes).toContain(
      'https://www.googleapis.com/auth/tasks.readonly',
    );
  });

  it('should disable individual tools via tool-level override', () => {
    const { enabledTools } = resolveFeatures(
      undefined,
      'calendar.deleteEvent:off',
    );

    // calendar.deleteEvent should be disabled
    expect(enabledTools.has('calendar.deleteEvent')).toBe(false);

    // Other calendar write tools should still be present
    expect(enabledTools.has('calendar.createEvent')).toBe(true);
    expect(enabledTools.has('calendar.updateEvent')).toBe(true);
  });

  it('should ignore tool-level :on overrides (subtractive only)', () => {
    // Disable gmail.write group, then try to re-enable gmail.send
    const { enabledTools } = resolveFeatures(
      undefined,
      'gmail.write:off,gmail.send:on',
    );

    // gmail.send should still be disabled because its group is off
    // and tool-level :on is ignored
    expect(enabledTools.has('gmail.send')).toBe(false);
  });

  it('should apply settings overrides (layer 2)', () => {
    const { enabledTools } = resolveFeatures(
      { 'gmail.write': false },
      undefined,
    );

    expect(enabledTools.has('gmail.send')).toBe(false);
    expect(enabledTools.has('gmail.search')).toBe(true);
  });

  it('should give env overrides precedence over settings', () => {
    // Settings disables gmail.write, but env re-enables it
    const { enabledTools } = resolveFeatures(
      { 'gmail.write': false },
      'gmail.write:on',
    );

    expect(enabledTools.has('gmail.send')).toBe(true);
  });

  it('should combine group and tool-level overrides', () => {
    const { enabledTools } = resolveFeatures(
      undefined,
      'calendar.deleteEvent:off,gmail.send:off',
    );

    expect(enabledTools.has('calendar.deleteEvent')).toBe(false);
    expect(enabledTools.has('calendar.createEvent')).toBe(true);
    expect(enabledTools.has('gmail.send')).toBe(false);
    expect(enabledTools.has('gmail.createDraft')).toBe(true);
  });

  it('should deduplicate scopes', () => {
    const { requiredScopes } = resolveFeatures();
    const unique = new Set(requiredScopes);
    expect(requiredScopes.length).toBe(unique.size);
  });

  describe('read/write scope dedup (issue #323)', () => {
    const READONLY_PAIRS: Array<[string, string]> = [
      ['drive.readonly', 'drive'],
      ['calendar.readonly', 'calendar'],
      ['chat.spaces.readonly', 'chat.spaces'],
      ['chat.messages.readonly', 'chat.messages'],
      ['chat.memberships.readonly', 'chat.memberships'],
      ['gmail.readonly', 'gmail.modify'],
    ];
    const fullUrl = (s: string) => `https://www.googleapis.com/auth/${s}`;

    it.each(READONLY_PAIRS)(
      'should not request %s when paired write scope is enabled (defaults)',
      (readonlyScope, writeScope) => {
        const { requiredScopes } = resolveFeatures();
        expect(requiredScopes).not.toContain(fullUrl(readonlyScope));
        expect(requiredScopes).toContain(fullUrl(writeScope));
      },
    );

    it.each([
      ['drive.write:off', 'drive.readonly'],
      ['calendar.write:off', 'calendar.readonly'],
      ['gmail.write:off', 'gmail.readonly'],
      ['chat.write:off', 'chat.spaces.readonly'],
    ])(
      'should request readonly scope when write group disabled (%s)',
      (override, readonlyScope) => {
        const { requiredScopes } = resolveFeatures(undefined, override);
        expect(requiredScopes).toContain(fullUrl(readonlyScope));
      },
    );

    it('should not affect tool registration — read tools stay enabled when write is on', () => {
      const { enabledTools } = resolveFeatures();
      expect(enabledTools.has('drive.search')).toBe(true);
      expect(enabledTools.has('gmail.search')).toBe(true);
      expect(enabledTools.has('calendar.list')).toBe(true);
      expect(enabledTools.has('chat.listSpaces')).toBe(true);
    });

    it('should still include read scopes for services without a write group (people)', () => {
      const { requiredScopes } = resolveFeatures();
      expect(requiredScopes).toContain(fullUrl('directory.readonly'));
      expect(requiredScopes).toContain(fullUrl('userinfo.profile'));
    });

    it('should still include readonly scopes for default-OFF write groups (slides, sheets)', () => {
      const { requiredScopes } = resolveFeatures();
      expect(requiredScopes).toContain(fullUrl('presentations.readonly'));
      expect(requiredScopes).toContain(fullUrl('spreadsheets.readonly'));
    });
  });
});
