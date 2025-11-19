/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  jest,
  afterEach,
} from '@jest/globals';
import { openBrowserSecurely } from '../../utils/secure-browser-launcher';
import { platform } from 'node:os';
import { EventEmitter } from 'node:events';
import { ChildProcess } from 'node:child_process';

jest.mock('node:os');

const mockPlatform = platform as jest.Mock;

describe('secure-browser-launcher', () => {
  let mockChild: EventEmitter;
  let mockExecFile: jest.Mock;

  beforeEach(() => {
    mockChild = new EventEmitter();
    mockExecFile = jest.fn().mockReturnValue(mockChild as ChildProcess);
    mockPlatform.mockReturnValue('darwin');  // Default to macOS
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function simulateSuccess() {
    process.nextTick(() => {
      mockChild.emit('exit', 0);
    });
  }

  function simulateFailure(error = new Error('Command failed')) {
    process.nextTick(() => {
      mockChild.emit('error', error);
    });
  }

  describe('URL validation', () => {
    it('should allow valid HTTP URLs', async () => {
      const openPromise = openBrowserSecurely(
        'http://example.com',
        mockExecFile as any
      );
      simulateSuccess();
      await expect(openPromise).resolves.toBeUndefined();
      expect(mockExecFile).toHaveBeenCalledWith(
        'open',
        ['http://example.com'],
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should allow valid HTTPS URLs', async () => {
      const openPromise = openBrowserSecurely(
        'https://example.com',
        mockExecFile as any
      );
      simulateSuccess();
      await expect(openPromise).resolves.toBeUndefined();
      expect(mockExecFile).toHaveBeenCalledWith(
        'open',
        ['https://example.com'],
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should reject non-HTTP(S) protocols', async () => {
      await expect(
        openBrowserSecurely('file:///etc/passwd', mockExecFile as any)
      ).rejects.toThrow('Unsafe protocol');
      await expect(
        openBrowserSecurely('javascript:alert(1)', mockExecFile as any)
      ).rejects.toThrow('Unsafe protocol');
      await expect(
        openBrowserSecurely('ftp://example.com', mockExecFile as any)
      ).rejects.toThrow('Unsafe protocol');
    });

    it('should reject invalid URLs', async () => {
      await expect(
        openBrowserSecurely('not-a-url', mockExecFile as any)
      ).rejects.toThrow('Invalid URL');
      await expect(
        openBrowserSecurely('', mockExecFile as any)
      ).rejects.toThrow('Invalid URL');
    });

    it('should reject URLs with control characters', async () => {
      await expect(
        openBrowserSecurely(
          'http://example.com\nmalicious-command',
          mockExecFile as any
        )
      ).rejects.toThrow('invalid characters');
      await expect(
        openBrowserSecurely(
          'http://example.com\rmalicious-command',
          mockExecFile as any
        )
      ).rejects.toThrow('invalid characters');
      await expect(
        openBrowserSecurely('http://example.com\x00', mockExecFile as any)
      ).rejects.toThrow('invalid characters');
    });
  });

  describe('Command injection prevention', () => {
    it('should prevent PowerShell command injection on Windows', async () => {
      mockPlatform.mockReturnValue('win32');
      const maliciousUrl =
        "http://127.0.0.1:8080/?param=example#$(Invoke-Expression([System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('Y2FsYy5leGU='))))";

      const openPromise = openBrowserSecurely(maliciousUrl, mockExecFile as any);
      simulateSuccess();
      await expect(openPromise).resolves.toBeUndefined();

      expect(mockExecFile).toHaveBeenCalledWith(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-WindowStyle',
          'Hidden',
          '-Command',
          `Start-Process '${maliciousUrl.replace(/'/g, "''")}'`,
        ],
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should handle URLs with special shell characters safely', async () => {
      const urlsWithSpecialChars = [
        'http://example.com/path?param=value&other=$value',
        'http://example.com/path#fragment;command',
        'http://example.com/$(whoami)',
        'http://example.com/`command`',
        'http://example.com/|pipe',
        'http://example.com/>redirect',
      ];

      for (const url of urlsWithSpecialChars) {
        const openPromise = openBrowserSecurely(url, mockExecFile as any);
        simulateSuccess();
        await expect(openPromise).resolves.toBeUndefined();
        expect(mockExecFile).toHaveBeenCalledWith(
          'open',
          [url],
          expect.any(Object),
          expect.any(Function)
        );
      }
    });

    it('should properly escape single quotes in URLs on Windows', async () => {
      mockPlatform.mockReturnValue('win32');
      const urlWithSingleQuotes =
        "http://example.com/path?name=O'Brien&test='value'";

      const openPromise = openBrowserSecurely(
        urlWithSingleQuotes,
        mockExecFile as any
      );
      simulateSuccess();
      await expect(openPromise).resolves.toBeUndefined();

      expect(mockExecFile).toHaveBeenCalledWith(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-WindowStyle',
          'Hidden',
          '-Command',
          `Start-Process 'http://example.com/path?name=O''Brien&test=''value'''`,
        ],
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('Platform-specific behavior', () => {
    it('should use correct command on macOS', async () => {
      const openPromise = openBrowserSecurely(
        'https://example.com',
        mockExecFile as any
      );
      simulateSuccess();
      await expect(openPromise).resolves.toBeUndefined();
      expect(mockExecFile).toHaveBeenCalledWith(
        'open',
        ['https://example.com'],
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should use PowerShell on Windows', async () => {
      mockPlatform.mockReturnValue('win32');
      const openPromise = openBrowserSecurely(
        'https://example.com',
        mockExecFile as any
      );
      simulateSuccess();
      await expect(openPromise).resolves.toBeUndefined();
      expect(mockExecFile).toHaveBeenCalledWith(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-WindowStyle',
          'Hidden',
          '-Command',
          `Start-Process 'https://example.com'`,
        ],
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should use xdg-open on Linux', async () => {
      mockPlatform.mockReturnValue('linux');
      const openPromise = openBrowserSecurely(
        'https://example.com',
        mockExecFile as any
      );
      simulateSuccess();
      await expect(openPromise).resolves.toBeUndefined();
      expect(mockExecFile).toHaveBeenCalledWith(
        'xdg-open',
        ['https://example.com'],
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should throw on unsupported platforms', async () => {
      mockPlatform.mockReturnValue('aix');
      await expect(
        openBrowserSecurely('https://example.com', mockExecFile as any)
      ).rejects.toThrow('Unsupported platform');
    });
  });

  describe('Error handling', () => {
    it('should handle browser launch failures gracefully', async () => {
      const openPromise = openBrowserSecurely(
        'https://example.com',
        mockExecFile as any
      );
      simulateFailure();
      await expect(openPromise).rejects.toThrow('Failed to open browser');
    });

    it('should try fallback browsers on Linux', async () => {
      mockPlatform.mockReturnValue('linux');

      const mockChild2 = new EventEmitter();
      mockExecFile.mockImplementationOnce(() => {
        // Defer the emit call to allow the 'on' handlers to be set up.
        process.nextTick(() => {
          mockChild.emit('error', new Error('xdg-open not found'));
        });
        return mockChild as ChildProcess;
      });
      mockExecFile.mockImplementationOnce(() => {
        process.nextTick(() => {
          mockChild2.emit('exit', 0);
        });
        return mockChild2 as ChildProcess;
      });

      const openPromise = openBrowserSecurely(
        'https://example.com',
        mockExecFile as any
      );

      await expect(openPromise).resolves.toBeUndefined();

      expect(mockExecFile).toHaveBeenCalledTimes(2);
      expect(mockExecFile).toHaveBeenNthCalledWith(
        1,
        'xdg-open',
        ['https://example.com'],
        expect.any(Object),
        expect.any(Function)
      );
      expect(mockExecFile).toHaveBeenNthCalledWith(
        2,
        'gnome-open',
        ['https://example.com'],
        expect.any(Object),
        expect.any(Function)
      );
    });
  });
});