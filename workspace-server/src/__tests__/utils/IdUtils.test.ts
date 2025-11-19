/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from '@jest/globals';
import { extractDocId } from '../../utils/IdUtils';

describe('IdUtils', () => {
  describe('extractDocId', () => {
    it('should extract document ID from a full Google Docs URL', () => {
      const url = 'https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit';
      const result = extractDocId(url);
      expect(result).toBe('1a2b3c4d5e6f7g8h9i0j');
    });

    it('should extract document ID from URL with additional parameters', () => {
      const url = 'https://docs.google.com/document/d/abc123-XYZ_789/edit?usp=sharing';
      const result = extractDocId(url);
      expect(result).toBe('abc123-XYZ_789');
    });

    it('should extract document ID from URL with preview path', () => {
      const url = 'https://docs.google.com/document/d/test-doc-id-123/preview';
      const result = extractDocId(url);
      expect(result).toBe('test-doc-id-123');
    });

    it('should extract document ID from URL without protocol', () => {
      const url = 'docs.google.com/document/d/my_document_id/view';
      const result = extractDocId(url);
      expect(result).toBe('my_document_id');
    });

    it('should return undefined when raw document ID is passed directly', () => {
      const docId = '1a2b3c4d5e6f7g8h9i0j';
      const result = extractDocId(docId);
      expect(result).toBeUndefined();
    });

    it('should return undefined for document ID with underscores and hyphens', () => {
      const docId = 'doc_id-with-special_chars_123';
      const result = extractDocId(docId);
      expect(result).toBeUndefined();
    });

    it('should return undefined if no pattern matches', () => {
      const randomString = 'not a doc id or url';
      const result = extractDocId(randomString);
      expect(result).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      const result = extractDocId('');
      expect(result).toBeUndefined();
    });

    it('should extract from partial URL path', () => {
      const partialPath = '/document/d/abc123xyz/';
      const result = extractDocId(partialPath);
      expect(result).toBe('abc123xyz');
    });

    it('should handle URL with multiple document paths (edge case)', () => {
      // Should extract the first match
      const url = '/document/d/first123/document/d/second456/';
      const result = extractDocId(url);
      expect(result).toBe('first123');
    });

    it('should handle very long document IDs', () => {
      const longId = 'a'.repeat(100) + '_' + 'b'.repeat(50);
      const url = `https://docs.google.com/document/d/${longId}/edit`;
      const result = extractDocId(url);
      expect(result).toBe(longId);
    });

    it('should handle document ID with only numbers', () => {
      const url = 'https://docs.google.com/document/d/1234567890/edit';
      const result = extractDocId(url);
      expect(result).toBe('1234567890');
    });

    it('should handle document ID with only letters', () => {
      const url = 'https://docs.google.com/document/d/abcdefghij/edit';
      const result = extractDocId(url);
      expect(result).toBe('abcdefghij');
    });

    it('should handle malformed URLs gracefully', () => {
      const malformedUrl = 'https://docs.google.com/document/edit';
      const result = extractDocId(malformedUrl);
      // Should return the input as-is when pattern doesn't match
      expect(result).toBeUndefined();
    });

    it('should be case sensitive for document IDs', () => {
      const url = 'https://docs.google.com/document/d/AbCdEfGhIj/edit';
      const result = extractDocId(url);
      expect(result).toBe('AbCdEfGhIj');
    });

    it('should extract document ID from a complex URL with resourcekey', () => {
      const url = 'https://docs.google.com/document/d/1MGqTbt5joTs40QS-YZTP9QH1-TxQ5tij7RgXPFWMPiI/edit?resourcekey=0-X_p2TPxpk0visLTHHMF7Yg&tab=t.0';
      const result = extractDocId(url);
      expect(result).toBe('1MGqTbt5joTs40QS-YZTP9QH1-TxQ5tij7RgXPFWMPiI');
    });

    it('should extract document ID from a URL without a trailing slash', () => {
      const url = 'https://docs.google.com/document/d/1MGqTbt5joTs40QS-YZTP9QH1-TxQ5tij7RgXPFWMPiI';
      const result = extractDocId(url);
      expect(result).toBe('1MGqTbt5joTs40QS-YZTP9QH1-TxQ5tij7RgXPFWMPiI');
    });
  });
});
