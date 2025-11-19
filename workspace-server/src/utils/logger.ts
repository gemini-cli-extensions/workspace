/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// Navigate up two levels from src/utils to get to the project root
const projectRoot = path.join(__dirname, '..', '..');
const logFilePath = path.join(projectRoot, 'logs', 'server.log');

async function ensureLogDirectoryExists() {
    try {
        await fs.mkdir(path.dirname(logFilePath), { recursive: true });
    } catch (error) {
        // If we can't create the log directory, log to console as a fallback.
        console.error('Could not create log directory:', error);
    }
}

// Ensure the directory exists when the module is loaded.
ensureLogDirectoryExists();

let isLoggingEnabled = false;

export function setLoggingEnabled(enabled: boolean) {
    isLoggingEnabled = enabled;
}

export function logToFile(message: string) {
    if (!isLoggingEnabled) {
        return;
    }
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} - ${message}\n`;

    fs.appendFile(logFilePath, logMessage).catch(err => {
        // Fallback to console if file logging fails
        console.error('Failed to write to log file:', err);
    });
}
