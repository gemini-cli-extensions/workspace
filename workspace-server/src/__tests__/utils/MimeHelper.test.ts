/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from '@jest/globals';
import { MimeHelper } from '../../utils/MimeHelper';

describe('MimeHelper', () => {
  describe('createMimeMessage', () => {
    it('should create a basic plain text email', () => {
      const encoded = MimeHelper.createMimeMessage({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        body: 'This is a test email body.',
      });

      // Decode the message to verify its structure
      const decoded = MimeHelper.decodeBase64Url(encoded);
      
      expect(decoded).toContain('To: recipient@example.com');
      expect(decoded).toContain('Subject: =?utf-8?B?VGVzdCBTdWJqZWN0?=');
      expect(decoded).toContain('Content-Type: text/plain; charset=utf-8');
      expect(decoded).toContain('This is a test email body.');
    });

    it('should create an HTML email', () => {
      const encoded = MimeHelper.createMimeMessage({
        to: 'recipient@example.com',
        subject: 'HTML Email',
        body: '<h1>Hello World</h1><p>This is HTML content.</p>',
        isHtml: true,
      });

      const decoded = MimeHelper.decodeBase64Url(encoded);
      
      expect(decoded).toContain('Content-Type: text/html; charset=utf-8');
      expect(decoded).toContain('<h1>Hello World</h1>');
    });

    it('should include optional headers when provided', () => {
      const encoded = MimeHelper.createMimeMessage({
        to: 'recipient@example.com',
        subject: 'Full Headers Test',
        body: 'Test body',
        from: 'sender@example.com',
        cc: 'cc@example.com',
        bcc: 'bcc@example.com',
        replyTo: 'reply@example.com',
      });

      const decoded = MimeHelper.decodeBase64Url(encoded);
      
      expect(decoded).toContain('From: sender@example.com');
      expect(decoded).toContain('To: recipient@example.com');
      expect(decoded).toContain('Cc: cc@example.com');
      expect(decoded).toContain('Bcc: bcc@example.com');
      expect(decoded).toContain('Reply-To: reply@example.com');
    });

    it('should handle UTF-8 subjects correctly', () => {
      const encoded = MimeHelper.createMimeMessage({
        to: 'recipient@example.com',
        subject: 'Test with emoji 🎉 and special chars é ñ',
        body: 'Test body',
      });

      const decoded = MimeHelper.decodeBase64Url(encoded);
      
      // The subject should be base64 encoded
      expect(decoded).toContain('Subject: =?utf-8?B?');
      
      // Decode the subject to verify it's correct
      const subjectMatch = decoded.match(/Subject: =\?utf-8\?B\?([^?]+)\?=/);
      if (subjectMatch) {
        const decodedSubject = Buffer.from(subjectMatch[1], 'base64').toString('utf-8');
        expect(decodedSubject).toBe('Test with emoji 🎉 and special chars é ñ');
      }
    });

    it('should properly format the MIME message with CRLF line endings', () => {
      const encoded = MimeHelper.createMimeMessage({
        to: 'recipient@example.com',
        subject: 'CRLF Test',
        body: 'Line 1\nLine 2',
      });

      const decoded = MimeHelper.decodeBase64Url(encoded);
      
      // Should use CRLF (\r\n) as line separators
      expect(decoded).toContain('\r\n');
      expect(decoded.split('\r\n').length).toBeGreaterThan(3);
    });

    it('should handle multiple recipients in to field', () => {
      const encoded = MimeHelper.createMimeMessage({
        to: 'recipient1@example.com, recipient2@example.com',
        subject: 'Multiple Recipients',
        body: 'Test body',
      });

      const decoded = MimeHelper.decodeBase64Url(encoded);
      
      expect(decoded).toContain('To: recipient1@example.com, recipient2@example.com');
    });

    it('should encode to base64url format (no padding, URL-safe characters)', () => {
      const encoded = MimeHelper.createMimeMessage({
        to: 'recipient@example.com',
        subject: 'Base64URL Test',
        body: 'Test content that should be encoded',
      });

      // Check that it doesn't contain standard base64 characters
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');
      
      // Should only contain base64url characters
      expect(encoded).toMatch(/^[A-Za-z0-9\-_]+$/);
    });
  });

  describe('createMimeMessageWithAttachments', () => {
    it('should create a message without attachments when none provided', () => {
      const encoded = MimeHelper.createMimeMessageWithAttachments({
        to: 'recipient@example.com',
        subject: 'No Attachments',
        body: 'Simple message',
      });

      const decoded = MimeHelper.decodeBase64Url(encoded);
      
      // Should not contain multipart boundary
      expect(decoded).not.toContain('Content-Type: multipart/mixed');
      expect(decoded).toContain('Content-Type: text/plain; charset=utf-8');
    });

    it('should create a multipart message with attachments', () => {
      const attachments = [
        {
          filename: 'test.txt',
          content: Buffer.from('Hello, World!'),
          contentType: 'text/plain',
        },
      ];

      const encoded = MimeHelper.createMimeMessageWithAttachments({
        to: 'recipient@example.com',
        subject: 'With Attachment',
        body: 'Message with attachment',
        attachments,
      });

      const decoded = MimeHelper.decodeBase64Url(encoded);
      
      expect(decoded).toContain('Content-Type: multipart/mixed; boundary=');
      expect(decoded).toContain('Content-Disposition: attachment; filename="test.txt"');
      expect(decoded).toContain('Content-Type: text/plain');
      expect(decoded).toContain('Content-Transfer-Encoding: base64');
    });

    it('should handle multiple attachments', () => {
      const attachments = [
        {
          filename: 'file1.txt',
          content: 'First file content',
          contentType: 'text/plain',
        },
        {
          filename: 'file2.pdf',
          content: Buffer.from('PDF content'),
          contentType: 'application/pdf',
        },
      ];

      const encoded = MimeHelper.createMimeMessageWithAttachments({
        to: 'recipient@example.com',
        subject: 'Multiple Attachments',
        body: 'Message with multiple attachments',
        attachments,
      });

      const decoded = MimeHelper.decodeBase64Url(encoded);
      
      expect(decoded).toContain('filename="file1.txt"');
      expect(decoded).toContain('filename="file2.pdf"');
      expect(decoded).toContain('Content-Type: text/plain');
      expect(decoded).toContain('Content-Type: application/pdf');
    });

    it('should use default content type for attachments without specified type', () => {
      const attachments = [
        {
          filename: 'unknown.bin',
          content: Buffer.from('Binary content'),
        },
      ];

      const encoded = MimeHelper.createMimeMessageWithAttachments({
        to: 'recipient@example.com',
        subject: 'Default Content Type',
        body: 'Message',
        attachments,
      });

      const decoded = MimeHelper.decodeBase64Url(encoded);
      
      expect(decoded).toContain('Content-Type: application/octet-stream');
    });

    it('should properly format attachment content in 76-character lines', () => {
      const longContent = 'a'.repeat(200); // Long content that needs to be wrapped
      const attachments = [
        {
          filename: 'long.txt',
          content: Buffer.from(longContent),
        },
      ];

      const encoded = MimeHelper.createMimeMessageWithAttachments({
        to: 'recipient@example.com',
        subject: 'Long Attachment',
        body: 'Message',
        attachments,
      });

      const decoded = MimeHelper.decodeBase64Url(encoded);
      
      // Find the base64 encoded attachment content
      const lines = decoded.split('\r\n');
      const attachmentStart = lines.findIndex(line => 
        line.includes('Content-Transfer-Encoding: base64')
      );
      
      if (attachmentStart !== -1) {
        // Check lines after the attachment header
        for (let i = attachmentStart + 2; i < lines.length; i++) {
          const line = lines[i];
          if (line.startsWith('--')) break; // Reached boundary
          if (line.length > 0) {
            expect(line.length).toBeLessThanOrEqual(76);
          }
        }
      }
    });

    it('should handle HTML body with attachments', () => {
      const attachments = [
        {
          filename: 'doc.html',
          content: '<html><body>HTML Doc</body></html>',
          contentType: 'text/html',
        },
      ];

      const encoded = MimeHelper.createMimeMessageWithAttachments({
        to: 'recipient@example.com',
        subject: 'HTML with Attachment',
        body: '<p>HTML Message Body</p>',
        isHtml: true,
        attachments,
      });

      const decoded = MimeHelper.decodeBase64Url(encoded);
      
      // Body should be HTML
      expect(decoded).toMatch(/Content-Type: text\/html; charset=utf-8\r\n\r\n<p>HTML Message Body<\/p>/);
      // Attachment should also be present
      expect(decoded).toContain('filename="doc.html"');
    });

    it('should include all optional headers with attachments', () => {
      const attachments = [
        {
          filename: 'test.txt',
          content: 'Test',
        },
      ];

      const encoded = MimeHelper.createMimeMessageWithAttachments({
        to: 'recipient@example.com',
        subject: 'Full Headers with Attachments',
        body: 'Test body',
        from: 'sender@example.com',
        cc: 'cc@example.com',
        bcc: 'bcc@example.com',
        attachments,
      });

      const decoded = MimeHelper.decodeBase64Url(encoded);
      
      expect(decoded).toContain('From: sender@example.com');
      expect(decoded).toContain('Cc: cc@example.com');
      expect(decoded).toContain('Bcc: bcc@example.com');
      expect(decoded).toContain('MIME-Version: 1.0');
    });

    it('should create unique boundary for each message', () => {
      const attachments = [
        {
          filename: 'test.txt',
          content: 'Test',
        },
      ];

      const encoded1 = MimeHelper.createMimeMessageWithAttachments({
        to: 'recipient@example.com',
        subject: 'Message 1',
        body: 'Body 1',
        attachments,
      });

      const encoded2 = MimeHelper.createMimeMessageWithAttachments({
        to: 'recipient@example.com',
        subject: 'Message 2',
        body: 'Body 2',
        attachments,
      });

      const decoded1 = MimeHelper.decodeBase64Url(encoded1);
      const decoded2 = MimeHelper.decodeBase64Url(encoded2);
      
      const boundary1Match = decoded1.match(/boundary="([^"]+)"/);
      const boundary2Match = decoded2.match(/boundary="([^"]+)"/);
      
      expect(boundary1Match).toBeTruthy();
      expect(boundary2Match).toBeTruthy();
      expect(boundary1Match![1]).not.toBe(boundary2Match![1]);
    });
  });

  describe('decodeBase64Url', () => {
    it('should decode base64url encoded strings', () => {
      const original = 'Hello, World! This is a test.';
      const base64url = Buffer.from(original)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      
      const decoded = MimeHelper.decodeBase64Url(base64url);
      
      expect(decoded).toBe(original);
    });

    it('should handle strings without padding', () => {
      const base64url = 'SGVsbG8'; // "Hello" without padding
      const decoded = MimeHelper.decodeBase64Url(base64url);
      
      expect(decoded).toBe('Hello');
    });

    it('should convert URL-safe characters back to standard base64', () => {
      const base64url = 'SGVsbG8-V29ybGRfIQ'; // Contains - and _
      const decoded = MimeHelper.decodeBase64Url(base64url);
      
      expect(decoded).toBeTruthy();
      expect(typeof decoded).toBe('string');
    });

    it('should handle empty strings', () => {
      const decoded = MimeHelper.decodeBase64Url('');
      
      expect(decoded).toBe('');
    });

    it('should properly decode a complete MIME message', () => {
      const mimeMessage = MimeHelper.createMimeMessage({
        to: 'test@example.com',
        subject: 'Test',
        body: 'Test body',
      });

      const decoded = MimeHelper.decodeBase64Url(mimeMessage);
      
      expect(decoded).toContain('To: test@example.com');
      expect(decoded).toContain('Test body');
    });
  });
});