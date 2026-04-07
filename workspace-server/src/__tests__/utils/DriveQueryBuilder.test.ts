/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from '@jest/globals';
import { escapeQueryString } from '../../utils/DriveQueryBuilder';

describe('DriveQueryBuilder', () => {
  describe('escapeQueryString', () => {
    it('should escape backslashes', () => {
      expect(escapeQueryString('path\\to\\file')).toBe('path\\\\to\\\\file');
    });

    it('should escape single quotes', () => {
      expect(escapeQueryString("it's a test")).toBe("it\\'s a test");
    });

    it('should escape both backslashes and single quotes', () => {
      expect(escapeQueryString("John's Presentation\\2024")).toBe(
        "John\\'s Presentation\\\\2024",
      );
    });

    it('should handle strings without special characters', () => {
      expect(escapeQueryString('hello world')).toBe('hello world');
    });

    it('should handle empty strings', () => {
      expect(escapeQueryString('')).toBe('');
    });
  });
});
