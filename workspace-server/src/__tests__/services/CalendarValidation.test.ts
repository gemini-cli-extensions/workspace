/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import {
  validateCreateEventInput,
  validateUpdateEventInput,
} from '../../services/CalendarValidation';

function getZodIssueMessages(fn: () => void): string[] {
  try {
    fn();
    return [];
  } catch (error) {
    if (error instanceof z.ZodError) {
      return error.issues.map((issue) => issue.message);
    }
    throw error;
  }
}

describe('CalendarValidation', () => {
  describe('validateCreateEventInput', () => {
    it('accepts a single-day all-day working location event', () => {
      expect(() =>
        validateCreateEventInput({
          start: { date: '2024-01-15' },
          end: { date: '2024-01-16' },
          eventType: 'workingLocation',
          workingLocationProperties: { type: 'homeOffice' },
        }),
      ).not.toThrow();
    });

    it('rejects an all-day working location event that spans multiple days', () => {
      expect(() =>
        validateCreateEventInput({
          start: { date: '2024-01-15' },
          end: { date: '2024-01-17' },
          eventType: 'workingLocation',
          workingLocationProperties: { type: 'homeOffice' },
        }),
      ).toThrow(
        'all-day workingLocation events must span exactly one day',
      );
    });

    it('accepts a leap-day working location event that spans one day', () => {
      expect(() =>
        validateCreateEventInput({
          start: { date: '2024-02-29' },
          end: { date: '2024-03-01' },
          eventType: 'workingLocation',
          workingLocationProperties: { type: 'homeOffice' },
        }),
      ).not.toThrow();
    });

    it('rejects a regular event without a summary', () => {
      expect(() =>
        validateCreateEventInput({
          start: { dateTime: '2024-01-15T10:00:00Z' },
          end: { dateTime: '2024-01-15T11:00:00Z' },
        }),
      ).toThrow('summary is required for regular events');
    });

    it('rejects focus time events with all-day dates', () => {
      expect(() =>
        validateCreateEventInput({
          start: { date: '2024-01-15' },
          end: { date: '2024-01-16' },
          eventType: 'focusTime',
        }),
      ).toThrow('focusTime events cannot be all-day events');
    });

    it('rejects working location officeLocation without office details', () => {
      const messages = getZodIssueMessages(() =>
        validateCreateEventInput({
          start: { date: '2024-01-15' },
          end: { date: '2024-01-16' },
          eventType: 'workingLocation',
          workingLocationProperties: { type: 'officeLocation' },
        }),
      );

      expect(messages).toContain(
        'officeLocation is required when workingLocationProperties.type is "officeLocation"',
      );
    });

    it('rejects invalid attendee emails', () => {
      expect(() =>
        validateCreateEventInput({
          summary: 'Team Meeting',
          start: { dateTime: '2024-01-15T10:00:00Z' },
          end: { dateTime: '2024-01-15T11:00:00Z' },
          attendees: ['not-an-email'],
        }),
      ).toThrow('Invalid email format');
    });
  });

  describe('validateUpdateEventInput', () => {
    it('accepts all-day date updates', () => {
      expect(() =>
        validateUpdateEventInput({
          eventId: 'event123',
          start: { date: '2024-01-15' },
          end: { date: '2024-01-16' },
        }),
      ).not.toThrow();
    });

    it('rejects empty start objects', () => {
      const messages = getZodIssueMessages(() =>
        validateUpdateEventInput({
          eventId: 'event123',
          start: {},
        }),
      );

      expect(messages).toContain(
        'start must have exactly one of "dateTime" or "date"',
      );
    });

    it('rejects invalid dateTime strings', () => {
      expect(() =>
        validateUpdateEventInput({
          eventId: 'event123',
          start: { dateTime: 'not-a-date' },
        }),
      ).toThrow('Invalid ISO 8601 datetime format');
    });

    it('rejects invalid calendar dates', () => {
      expect(() =>
        validateUpdateEventInput({
          eventId: 'event123',
          start: { date: '2024-02-30' },
        }),
      ).toThrow('Invalid date format. Expected YYYY-MM-DD');
    });
  });
});
