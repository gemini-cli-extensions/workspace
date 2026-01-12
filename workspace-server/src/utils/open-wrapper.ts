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
  // Always print the URL to stderr first for headless/VM environments
  console.error(`\nPlease open this URL in your browser to authenticate:\n${url}\n`);

  // Check if we should also try to launch the browser
  if (!shouldLaunchBrowser()) {
    return createMockChildProcess();
  }

  // Try to open the browser securely (best effort, don't fail if it doesn't work)
  try {
    await openBrowserSecurely(url);
  } catch {
    // Browser launch failed, but URL is already printed above
  }
  return createMockChildProcess();
};

// Use standard ES Module export and let the compiler generate the CommonJS correct output.
export default openWrapper;