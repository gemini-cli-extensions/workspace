/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile, ExecFileOptions } from 'node:child_process';
import { platform } from 'node:os';
import { URL } from 'node:url';


function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

/**
 * Validates that a URL is safe to open in a browser.
 * Only allows HTTP and HTTPS URLs to prevent command injection.
 *
 * @param url The URL to validate
 * @throws Error if the URL is invalid or uses an unsafe protocol
 */
function validateUrl(url: string): void {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }

  // Only allow HTTP and HTTPS protocols
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(
      `Unsafe protocol: ${parsedUrl.protocol}. Only HTTP and HTTPS are allowed.`
    );
  }

  // Additional validation: ensure no newlines or control characters
  if (/[\r\n\x00-\x1F]/.test(url)) {
    throw new Error('URL contains invalid characters');
  }
}

/**
 * Opens a URL in the default browser using platform-specific commands.
 * This implementation avoids shell injection vulnerabilities by:
 * 1. Validating the URL to ensure it's HTTP/HTTPS only
 * 2. Using execFile instead of exec to avoid shell interpretation
 * 3. Passing the URL as an argument rather than constructing a command string
 *
 * @param url The URL to open
 * @param execFileFn The function to execute a command. Defaults to node's execFile.
 * @throws Error if the URL is invalid or if opening the browser fails
 */
export async function openBrowserSecurely(
  url: string,
  execFileFn: typeof execFile = execFile
): Promise<void> {
  // Validate the URL first
  validateUrl(url);

  const platformName = platform();
  let command: string;
  let args: string[];

  switch (platformName) {
    case 'darwin':
      // macOS
      command = 'open';
      args = [url];
      break;

    case 'win32':
      // Windows - use PowerShell with Start-Process
      // This avoids the cmd.exe shell which is vulnerable to injection
      command = 'powershell.exe';
      args = [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-Command',
        `Start-Process '${url.replace(/'/g, "''")}'`,
      ];
      break;

    case 'linux':
    case 'freebsd':
    case 'openbsd':
      // Linux and BSD variants
      // Try xdg-open first, fall back to other options
      command = 'xdg-open';
      args = [url];
      break;

    default:
      throw new Error(`Unsupported platform: ${platformName}`);
  }

  const options: Record<string, unknown> = {
    // Don't inherit parent's environment to avoid potential issues
    env: {
      ...process.env,
      // Ensure we're not in a shell that might interpret special characters
      SHELL: undefined,
    },
    // Detach the browser process so it doesn't block
    detached: true,
    stdio: 'ignore',
  };

  const tryCommand = (cmd: string, cmdArgs: string[]): Promise<void> => {
    return new Promise((resolve, reject) => {
      const child = execFileFn(
        cmd,
        cmdArgs,
        options as ExecFileOptions,
        (error) => {
          if (error) {
            // This callback handles errors after the process has run,
            // but for our case, the 'error' event is more important for spawn failures.
            reject(error);
          }
        }
      );

      // The 'error' event is critical. It fires if the command cannot be found or spawned.
      child.on('error', (error) => {
        reject(error);
      });

      // If the process spawns successfully, 'xdg-open' and similar commands
      // exit almost immediately. We don't need to wait for the browser to close.
      // We can consider the job done if the process exits with code 0.
      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Process exited with code ${code}`));
        }
      });
    });
  };

  try {
    await withTimeout(tryCommand(command, args), 5000);
  } catch (error) {
    // For Linux, try fallback commands if xdg-open fails
    if (
      (platformName === 'linux' ||
        platformName === 'freebsd' ||
        platformName === 'openbsd') &&
      command === 'xdg-open'
    ) {
      const fallbackCommands = [
        'gnome-open',
        'kde-open',
        'firefox',
        'chromium',
        'google-chrome',
      ];

      for (const fallbackCommand of fallbackCommands) {
        try {
          await withTimeout(tryCommand(fallbackCommand, [url]), 5000);
          return; // Success!
        } catch {
          // Try next command
          continue;
        }
      }
    }

    // Re-throw the error if all attempts failed
    throw new Error(
      `Failed to open browser: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Checks if the current environment should attempt to launch a browser.
 * This is the same logic as in browser.ts for consistency.
 *
 * @returns True if the tool should attempt to launch a browser
 */
export function shouldLaunchBrowser(): boolean {
  // A list of browser names that indicate we should not attempt to open a
  // web browser for the user.
  const browserBlocklist = ['www-browser'];
  const browserEnv = process.env.BROWSER;
  if (browserEnv && browserBlocklist.includes(browserEnv)) {
    return false;
  }

  // Common environment variables used in CI/CD or other non-interactive shells.
  if (process.env.CI || process.env.DEBIAN_FRONTEND === 'noninteractive') {
    return false;
  }

  // The presence of SSH_CONNECTION indicates a remote session.
  // We should not attempt to launch a browser unless a display is explicitly available
  // (checked below for Linux).
  const isSSH = !!process.env.SSH_CONNECTION;

  // On Linux, the presence of a display server is a strong indicator of a GUI.
  if (platform() === 'linux') {
    // These are environment variables that can indicate a running compositor on Linux.
    const displayVariables = ['DISPLAY', 'WAYLAND_DISPLAY', 'MIR_SOCKET'];
    const hasDisplay = displayVariables.some((v) => !!process.env[v]);
    if (!hasDisplay) {
      return false;
    }
  }

  // If in an SSH session on a non-Linux OS (e.g., macOS), don't launch browser.
  // The Linux case is handled above (it's allowed if DISPLAY is set).
  if (isSSH && platform() !== 'linux') {
    return false;
  }

  // For non-Linux OSes, we generally assume a GUI is available
  // unless other signals (like SSH) suggest otherwise.
  return true;
}
