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
    it('should return the current date in YYYY-MM-DD format', async () => {
      const result = await timeService.getCurrentDate();
      expect(result.content[0].text).toEqual(JSON.stringify({ date: '2025-08-19' }));
    });
  });

  describe('getCurrentTime', () => {
    it('should return the current time in HH:MM:SS format', async () => {
        const result = await timeService.getCurrentTime();
        expect(result.content[0].text).toEqual(JSON.stringify({ time: '12:34:56' }));
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
