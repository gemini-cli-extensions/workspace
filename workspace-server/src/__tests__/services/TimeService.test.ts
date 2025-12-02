/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { TimeService } from '../../services/TimeService';

describe('TimeService', () => {
  let timeService: TimeService;
  const mockDate = new Date('2025-08-19T12:34:56Z');

  beforeEach(() => {
    timeService = new TimeService();
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getCurrentDate', () => {
    it('should return the current date with utc, local, and timeZone fields', async () => {
      const result = await timeService.getCurrentDate();
      const parsed = JSON.parse(result.content[0].text);
      const expectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      expect(parsed.utc).toEqual('2025-08-19');
      expect(parsed.local).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(parsed.timeZone).toEqual(expectedTimeZone);
    });
  });

  describe('getCurrentTime', () => {
    it('should return the current time with utc, local, and timeZone fields', async () => {
      const result = await timeService.getCurrentTime();
      const parsed = JSON.parse(result.content[0].text);
      const expectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      expect(parsed.utc).toEqual('12:34:56');
      expect(parsed.local).toBeDefined();
      expect(parsed.timeZone).toEqual(expectedTimeZone);
    });
  });

  describe('getTimeZone', () => {
    it('should return the local timezone', async () => {
      const result = await timeService.getTimeZone();
      const expectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      expect(result.content[0].text).toEqual(JSON.stringify({ timeZone: expectedTimeZone }));
    });
  });
});
