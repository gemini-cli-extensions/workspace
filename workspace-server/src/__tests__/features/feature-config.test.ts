/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from '@jest/globals';
import {
  FEATURE_GROUPS,
  featureGroupKey,
  getAllPossibleScopes,
} from '../../features/feature-config';

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

describe('getAllPossibleScopes (issue #323)', () => {
  it('should include both write and readonly scopes for paired groups', () => {
    const scopes = getAllPossibleScopes();
    // Both must be registered on the consent screen — users may flip
    // <service>.write off, which causes <service>.readonly to be requested.
    expect(scopes).toContain('https://www.googleapis.com/auth/drive');
    expect(scopes).toContain('https://www.googleapis.com/auth/drive.readonly');
    expect(scopes).toContain('https://www.googleapis.com/auth/gmail.modify');
    expect(scopes).toContain('https://www.googleapis.com/auth/gmail.readonly');
    expect(scopes).toContain('https://www.googleapis.com/auth/calendar');
    expect(scopes).toContain(
      'https://www.googleapis.com/auth/calendar.readonly',
    );
  });

  it('should exclude default-OFF group scopes that are not in any default-ON group', () => {
    const scopes = getAllPossibleScopes();
    // tasks.* are default-OFF and their scopes are not shared with any
    // default-ON group, so they shouldn't be in the registration list.
    expect(scopes).not.toContain('https://www.googleapis.com/auth/tasks');
    expect(scopes).not.toContain(
      'https://www.googleapis.com/auth/tasks.readonly',
    );
  });

  it('should be sorted and deduplicated', () => {
    const scopes = getAllPossibleScopes();
    const sortedUnique = [...new Set(scopes)].sort();
    expect(scopes).toEqual(sortedUnique);
  });

  it('print-scopes.ts should emit the same list (drift guard for setup-gcp.sh)', () => {
    // setup-gcp.sh shells out to scripts/print-scopes.ts; if this test
    // fails, the consent screen registration list will drift from
    // FEATURE_GROUPS — which is the bug in issue #323.
    const repoRoot = join(__dirname, '..', '..', '..', '..');
    // execSync (not execFileSync) so Windows can resolve npx.cmd via the
    // shell. Tests run on ubuntu/macos/windows.
    const output = execSync(
      'npx --no-install ts-node --transpile-only --project scripts/tsconfig.json scripts/print-scopes.ts',
      { cwd: repoRoot, encoding: 'utf8' },
    );
    const printed = output.trim().split(/\r?\n/);
    expect(printed).toEqual(getAllPossibleScopes());
  });

  it('setup-gcp.sh should not contain a hardcoded SCOPES list (drift guard)', () => {
    // If someone re-inlines the list, this test catches it.
    const repoRoot = join(__dirname, '..', '..', '..', '..');
    const setupScript = readFileSync(
      join(repoRoot, 'scripts', 'setup-gcp.sh'),
      'utf8',
    );
    // A hardcoded list would have a literal scope URL inside SCOPES=( ... ).
    const hardcodedMatch = setupScript.match(
      /SCOPES=\(\s*"https:\/\/www\.googleapis\.com\//,
    );
    expect(hardcodedMatch).toBeNull();
  });
});
