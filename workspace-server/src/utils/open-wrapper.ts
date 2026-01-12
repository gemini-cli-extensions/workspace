/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This module acts as a drop-in replacement for the 'open' package.
 * It intercepts browser launch requests and either:
 * 1. Opens the browser securely using our secure-browser-launcher
 * 2. Prints the URL to console if browser launch should be skipped or fails
 */

import { openBrowserSecurely, shouldLaunchBrowser } from './secure-browser-launcher';

// Create a mock child process object that matches what open returns
const createMockChildProcess = () => ({
  unref: () => {},
  ref: () => {},
  pid: 123,
  stdout: null,
  stderr: null,
  stdin: null,
  channel: null,
  connected: false,
  exitCode: 0,
  killed: false,
  signalCode: null,
  spawnargs: [],
  spawnfile: '',
});

const openWrapper = async (url: string): Promise<any> => {
  // Check if we should launch the browser
  if (!shouldLaunchBrowser()) {
    console.error(`Browser launch not supported. Please open this URL in your browser: ${url}`);
    return createMockChildProcess();
  }

  // Try to open the browser securely
  try {
    await openBrowserSecurely(url);
    return createMockChildProcess();
  } catch {
    console.error(`Failed to open browser. Please open this URL in your browser: ${url}`);
    return createMockChildProcess();
  }
};

// Use standard ES Module export and let the compiler generate the CommonJS correct output.
export default openWrapper;