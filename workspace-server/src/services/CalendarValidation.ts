/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { emailArraySchema, iso8601DateTimeSchema } from '../utils/validation';
import type {
  CalendarEventType,
  CreateEventInput,
  UpdateEventInput,
} from './CalendarService';

type EventDateInput = {
  dateTime?: string | null;
  date?: string | null;
};

type WorkingLocationValidationInput = {
  type?: string | null;
  officeLocation?: unknown;
  customLocation?: unknown;
};

type CompleteEventValidationInput = {
  summary?: string | null;
  start: EventDateInput;
  end: EventDateInput;
  attendees?: string[];
  eventType?: CalendarEventType | null;
  workingLocationProperties?: WorkingLocationValidationInput | null;
};

const isoDateSchema = z.string().refine(
  (val) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
    const parsed = new Date(`${val}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return false;
    return parsed.toISOString().slice(0, 10) === val;
  },
  {
    message: 'Invalid date format. Expected YYYY-MM-DD',
  },
);

function createIssue(path: (string | number)[], message: string): z.ZodError {
  return new z.ZodError([
    {
      code: 'custom',
      message,
      path,
    },
  ]);
}

function validateExclusiveDateField(
  fieldName: 'start' | 'end',
  fieldValue: EventDateInput,
): void {
  const hasDateTime = !!fieldValue.dateTime;
  const hasDate = !!fieldValue.date;

  if ((!hasDateTime && !hasDate) || (hasDateTime && hasDate)) {
    throw createIssue(
      [fieldName],
      `${fieldName} must have exactly one of "dateTime" (for timed events) or "date" (for all-day events)`,
    );
  }
}

function validateOptionalExclusiveDateField(
  fieldName: 'start' | 'end',
  fieldValue?: EventDateInput,
): void {
  if (!fieldValue) {
    return;
  }

  const hasDateTime = !!fieldValue.dateTime;
  const hasDate = !!fieldValue.date;

  if ((!hasDateTime && !hasDate) || (hasDateTime && hasDate)) {
    throw createIssue(
      [fieldName],
      `${fieldName} must have exactly one of "dateTime" (for timed events) or "date" (for all-day events)`,
    );
  }
}

function validateDateFieldFormats(
  fieldName: 'start' | 'end',
  field: EventDateInput,
) {
  if (field.dateTime) {
    iso8601DateTimeSchema.parse(field.dateTime);
  }
  if (field.date) {
    isoDateSchema.parse(field.date);
  }
}

function validateWorkingLocationProperties(
  workingLocationProperties?: WorkingLocationValidationInput | null,
): void {
  if (!workingLocationProperties) {
    throw createIssue(
      ['workingLocationProperties'],
      'workingLocationProperties is required when eventType is "workingLocation"',
    );
  }

  if (
    workingLocationProperties.type === 'officeLocation' &&
    !workingLocationProperties.officeLocation
  ) {
    throw createIssue(
      ['workingLocationProperties', 'officeLocation'],
      'officeLocation is required when workingLocationProperties.type is "officeLocation"',
    );
  }

  if (
    workingLocationProperties.type === 'customLocation' &&
    !workingLocationProperties.customLocation
  ) {
    throw createIssue(
      ['workingLocationProperties', 'customLocation'],
      'customLocation is required when workingLocationProperties.type is "customLocation"',
    );
  }
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function validateWorkingLocationDuration(
  input: CompleteEventValidationInput,
): void {
  if (
    input.eventType === 'workingLocation' &&
    input.start.date &&
    input.end.date
  ) {
    if (input.end.date < input.start.date) {
      throw createIssue(
        ['start', 'end'],
        'end.date must be on or after start.date',
      );
    }
    if (addDays(input.start.date, 1) !== input.end.date) {
      throw createIssue(
        ['start', 'end'],
        'all-day workingLocation events must span exactly one day',
      );
    }
  }
}

function validateCompleteEventInput(input: CompleteEventValidationInput): void {
  validateExclusiveDateField('start', input.start);
  validateExclusiveDateField('end', input.end);
  validateDateFieldFormats('start', input.start);
  validateDateFieldFormats('end', input.end);

  if ((!input.eventType || input.eventType === 'default') && !input.summary) {
    throw createIssue(['summary'], 'summary is required for regular events');
  }

  if (
    (input.eventType === 'focusTime' || input.eventType === 'outOfOffice') &&
    (input.start.date || input.end.date)
  ) {
    throw createIssue(
      ['start', 'end'],
      `${input.eventType} events cannot be all-day events; use dateTime instead of date`,
    );
  }

  if (input.eventType === 'workingLocation') {
    validateWorkingLocationProperties(input.workingLocationProperties);
    validateWorkingLocationDuration(input);
  }

  if (input.attendees) {
    emailArraySchema.parse(input.attendees);
  }
}

export function validateCreateEventInput(input: CreateEventInput): void {
  validateCompleteEventInput({
    summary: input.summary,
    start: input.start,
    end: input.end,
    attendees: input.attendees,
    eventType: input.eventType,
    workingLocationProperties: input.workingLocationProperties,
  });
}

export function validateUpdateEventInput(input: UpdateEventInput): void {
  validateOptionalExclusiveDateField('start', input.start);
  validateOptionalExclusiveDateField('end', input.end);

  if (input.start) {
    validateDateFieldFormats('start', input.start);
  }
  if (input.end) {
    validateDateFieldFormats('end', input.end);
  }
  if (input.attendees) {
    emailArraySchema.parse(input.attendees);
  }
}
