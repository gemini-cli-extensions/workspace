/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Helper class for creating RFC 2822 compliant MIME messages for Gmail API
 */
export class MimeHelper {
    /**
     * Creates a base64url-encoded MIME message for Gmail API
     */
    public static createMimeMessage({
        to,
        subject,
        body,
        from,
        cc,
        bcc,
        replyTo,
        isHtml = false
    }: {
        to: string;
        subject: string;
        body: string;
        from?: string;
        cc?: string;
        bcc?: string;
        replyTo?: string;
        isHtml?: boolean;
    }): string {
        // Encode subject for UTF-8 support
        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
        
        // Build message headers
        const messageParts: string[] = [];
        
        // Add From header if provided, otherwise Gmail will use the authenticated user
        if (from) {
            messageParts.push(`From: ${from}`);
        }
        
        messageParts.push(`To: ${to}`);
        
        if (cc) {
            messageParts.push(`Cc: ${cc}`);
        }
        
        if (bcc) {
            messageParts.push(`Bcc: ${bcc}`);
        }
        
        if (replyTo) {
            messageParts.push(`Reply-To: ${replyTo}`);
        }
        
        messageParts.push(`Subject: ${utf8Subject}`);
        
        // Add content type based on whether it's HTML or plain text
        if (isHtml) {
            messageParts.push('Content-Type: text/html; charset=utf-8');
        } else {
            messageParts.push('Content-Type: text/plain; charset=utf-8');
        }
        
        messageParts.push(''); // Empty line between headers and body
        messageParts.push(body);
        
        // Join all parts with CRLF as per RFC 2822
        const message = messageParts.join('\r\n');
        
        // Encode to base64url format required by Gmail API
        const encodedMessage = Buffer.from(message)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        
        return encodedMessage;
    }
    
    /**
     * Creates a MIME message with attachments
     */
    public static createMimeMessageWithAttachments({
        to,
        subject,
        body,
        from,
        cc,
        bcc,
        attachments,
        isHtml = false
    }: {
        to: string;
        subject: string;
        body: string;
        from?: string;
        cc?: string;
        bcc?: string;
        attachments?: Array<{
            filename: string;
            content: Buffer | string;
            contentType?: string;
        }>;
        isHtml?: boolean;
    }): string {
        const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
        
        const messageParts: string[] = [];
        
        // Headers
        if (from) {
            messageParts.push(`From: ${from}`);
        }
        messageParts.push(`To: ${to}`);
        if (cc) {
            messageParts.push(`Cc: ${cc}`);
        }
        if (bcc) {
            messageParts.push(`Bcc: ${bcc}`);
        }
        messageParts.push(`Subject: ${utf8Subject}`);
        messageParts.push('MIME-Version: 1.0');
        
        if (!attachments || attachments.length === 0) {
            // Simple message without attachments
            return this.createMimeMessage({ to, subject, body, from, cc, bcc, isHtml });
        }
        
        // Multipart message with attachments
        messageParts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
        messageParts.push('');
        
        // Body part
        messageParts.push(`--${boundary}`);
        if (isHtml) {
            messageParts.push('Content-Type: text/html; charset=utf-8');
        } else {
            messageParts.push('Content-Type: text/plain; charset=utf-8');
        }
        messageParts.push('');
        messageParts.push(body);
        
        // Attachments
        for (const attachment of attachments) {
            messageParts.push(`--${boundary}`);
            messageParts.push(`Content-Type: ${attachment.contentType || 'application/octet-stream'}`);
            messageParts.push('Content-Transfer-Encoding: base64');
            messageParts.push(`Content-Disposition: attachment; filename="${attachment.filename}"`);
            messageParts.push('');
            
            const content = typeof attachment.content === 'string' 
                ? attachment.content 
                : attachment.content.toString('base64');
            
            // Add content in chunks of 76 characters as per MIME spec
            const chunks = content.match(/.{1,76}/g) || [];
            messageParts.push(...chunks);
        }
        
        // End boundary
        messageParts.push(`--${boundary}--`);
        
        const message = messageParts.join('\r\n');
        
        // Encode to base64url
        return Buffer.from(message)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }
    
    /**
     * Decodes a base64url-encoded string (inverse of encoding)
     */
    public static decodeBase64Url(encoded: string): string {
        // Add back padding if needed
        let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) {
            base64 += '=';
        }
        return Buffer.from(base64, 'base64').toString('utf-8');
    }
}