/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from '@jest/globals';
import { FEATURE_GROUPS, featureGroupKey } from '../../features/feature-config';

describe('feature-config', () => {
  it('should have unique feature group keys', () => {
    const keys = FEATURE_GROUPS.map(featureGroupKey);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it('should not have duplicate tool names across groups', () => {
    const allTools: string[] = [];
    for (const fg of FEATURE_GROUPS) {
      allTools.push(...fg.tools);
    }
    const duplicates = allTools.filter(
      (tool, i) => allTools.indexOf(tool) !== i,
    );
    expect(duplicates).toEqual([]);
  });

  it('should have slides.write, sheets.write, tasks.read, and tasks.write defaulted to OFF', () => {
    const offByDefault = FEATURE_GROUPS.filter((fg) => !fg.defaultEnabled).map(
      featureGroupKey,
    );
    expect(offByDefault).toContain('slides.write');
    expect(offByDefault).toContain('sheets.write');
    expect(offByDefault).toContain('tasks.read');
    expect(offByDefault).toContain('tasks.write');
  });

  it('should have all default-ON services with at least one tool', () => {
    const defaultOnWithNoTools = FEATURE_GROUPS.filter(
      (fg) => fg.defaultEnabled && fg.tools.length === 0,
    );
    expect(defaultOnWithNoTools).toEqual([]);
  });

  it('should have valid scope URLs', () => {
    for (const fg of FEATURE_GROUPS) {
      for (const scope of fg.scopes) {
        expect(scope).toMatch(/^https:\/\/www\.googleapis\.com\/auth\//);
      }
    }
  });

  it('should have time.read with no scopes', () => {
    const timeRead = FEATURE_GROUPS.find(
      (fg) => fg.service === 'time' && fg.group === 'read',
    );
    expect(timeRead).toBeDefined();
    expect(timeRead!.scopes).toEqual([]);
  });
});
