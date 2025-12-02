/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { logToFile } from '../utils/logger';

export class TimeService {
  constructor() {
    logToFile('TimeService initialized.');
  }

  private async handleErrors<T>(fn: () => Promise<T>): Promise<{ content: [{ type: "text"; text: string; }] }> {
    try {
      const result = await fn();
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(result)
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logToFile(`Error in TimeService: ${errorMessage}`);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ error: errorMessage })
        }]
      };
    }
  }

  private getTimeContext() {
    return {
      now: new Date(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }

  getCurrentDate = async () => {
    logToFile('getCurrentDate called');
    return this.handleErrors(async () => {
      const { now, timeZone } = this.getTimeContext();
      return {
        utc: now.toISOString().slice(0, 10),
        local: now.toLocaleDateString('en-CA', { timeZone }), // YYYY-MM-DD format
        timeZone
      };
    });
  }

  getCurrentTime = async () => {
    logToFile('getCurrentTime called');
    return this.handleErrors(async () => {
      const { now, timeZone } = this.getTimeContext();
      return {
        utc: now.toISOString().slice(11, 19),
        local: now.toLocaleTimeString('en-GB', { hour12: false, timeZone }), // HH:MM:SS format
        timeZone
      };
    });
  }

  getTimeZone = async () => {
    logToFile('getTimeZone called');
    return this.handleErrors(async () => {
      return { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    });
  }
}
