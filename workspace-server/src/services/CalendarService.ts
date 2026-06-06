/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import { calendar_v3, google } from 'googleapis';
import { logToFile } from '../utils/logger';
import { gaxiosOptions } from '../utils/GaxiosConfig';
import { iso8601DateTimeSchema } from '../utils/validation';
import {
  validateCreateEventInput,
  validateUpdateEventInput,
} from './CalendarValidation';
import { z } from 'zod';

/**
 * Google Drive file attachment for calendar events.
 * Attachments are fully replaced (not appended) when provided.
 */
interface EventAttachment {
  fileUrl: string;
  title?: string;
  mimeType?: string;
}

export type CalendarEventType =
  | 'default'
  | 'focusTime'
  | 'outOfOffice'
  | 'workingLocation';

export type ListEventsEventType = CalendarEventType | 'birthday' | 'fromGmail';

export interface CreateEventInput {
  calendarId?: string;
  summary?: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: string[];
  sendUpdates?: 'all' | 'externalOnly' | 'none';
  addGoogleMeet?: boolean;
  attachments?: EventAttachment[];
  eventType?: CalendarEventType;
  focusTimeProperties?: {
    chatStatus?: 'available' | 'doNotDisturb';
    autoDeclineMode?:
      | 'declineNone'
      | 'declineAllConflictingInvitations'
      | 'declineOnlyNewConflictingInvitations';
    declineMessage?: string;
  };
  outOfOfficeProperties?: {
    autoDeclineMode?:
      | 'declineNone'
      | 'declineAllConflictingInvitations'
      | 'declineOnlyNewConflictingInvitations';
    declineMessage?: string;
  };
  workingLocationProperties?: {
    type: 'homeOffice' | 'officeLocation' | 'customLocation';
    officeLocation?: { buildingId?: string; label?: string };
    customLocation?: { label: string };
  };
}

export interface ListEventsInput {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  attendeeResponseStatus?: string[];
  eventTypes?: ListEventsEventType[];
}

export interface GetEventInput {
  eventId: string;
  calendarId?: string;
}

export interface DeleteEventInput {
  eventId: string;
  calendarId?: string;
}

export interface UpdateEventInput {
  eventId: string;
  calendarId?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: string[];
  addGoogleMeet?: boolean;
  attachments?: EventAttachment[];
}

export interface RespondToEventInput {
  eventId: string;
  calendarId?: string;
  responseStatus: 'accepted' | 'declined' | 'tentative';
  sendNotification?: boolean;
  responseMessage?: string;
}

export interface FindFreeTimeInput {
  attendees: string[];
  timeMin: string;
  timeMax: string;
  duration: number;
}

export class CalendarService {
  private primaryCalendarId: string | null = null;

  constructor(private authManager: any) {}

  /**
   * Adds conferenceData and attachments to an event body and its API params.
   *
   * IMPORTANT: Attachments are fully REPLACED, not appended. When attachments
   * are provided, any existing attachments on the event will be removed.
   */
  private applyMeetAndAttachments(
    event: calendar_v3.Schema$Event,
    params: { conferenceDataVersion?: number; supportsAttachments?: boolean },
    addGoogleMeet?: boolean,
    attachments?: EventAttachment[],
    options?: { allowEmptyAttachments?: boolean },
  ): void {
    if (addGoogleMeet) {
      event.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
      params.conferenceDataVersion = 1;
    }
    if (
      attachments &&
      (attachments.length > 0 || options?.allowEmptyAttachments)
    ) {
      event.attachments = attachments.map((a) => ({
        fileUrl: a.fileUrl,
        title: a.title,
        mimeType: a.mimeType,
      }));
      params.supportsAttachments = true;
    }
  }

  private createValidationErrorResponse(error: unknown) {
    const errorMessage =
      error instanceof z.ZodError
        ? error.issues
            .map((issue) =>
              issue.path.length
                ? `${issue.path.join('.')}: ${issue.message}`
                : issue.message,
            )
            .join('; ')
        : error instanceof Error
          ? error.message
          : 'Validation failed';
    let helpMessage =
      'Please use strict ISO 8601 format with seconds and timezone. Examples: 2024-01-15T10:30:00Z (UTC) or 2024-01-15T10:30:00-05:00 (EST)';

    if (
      error instanceof z.ZodError &&
      error.issues.some(
        (issue) =>
          issue.path.includes('attendees') || issue.message.includes('email'),
      )
    ) {
      helpMessage = 'Please ensure all attendee emails are in a valid format.';
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: 'Invalid input format',
            details: errorMessage,
            help: helpMessage,
          }),
        },
      ],
    };
  }

  private extractErrorMessage(error: unknown): string {
    const details = (
      error as {
        response?: {
          data?: {
            error?: {
              message?: string;
              code?: number;
              errors?: Array<{
                domain?: string;
                reason?: string;
                message?: string;
                location?: string;
                locationType?: string;
              }>;
            };
          };
        };
      }
    )?.response?.data?.error;

    if (details) {
      const topLevelMessage = details.message ?? 'Unknown Error';
      const code = details.code ? ` (code ${details.code})` : '';

      if (details.errors?.length) {
        const fieldErrors = details.errors
          .map((e) => {
            const context = [e.domain, e.locationType, e.location]
              .filter(Boolean)
              .join('.');
            const identity = [context, e.reason].filter(Boolean).join(' ');
            return identity ? `${identity}: ${e.message}` : e.message;
          })
          .join('; ');

        // If the top-level message is just a generic summary of the first field error,
        // or if they are identical, just show the field errors to avoid stutter.
        if (
          details.errors.length === 1 &&
          (topLevelMessage === details.errors[0].message ||
            topLevelMessage.includes(details.errors[0].message ?? ''))
        ) {
          return `${fieldErrors}${code}`;
        }

        return `${topLevelMessage}${code}: ${fieldErrors}`;
      }

      return `${topLevelMessage}${code}`;
    }

    return error instanceof Error ? error.message : String(error);
  }

  private async getCalendar(): Promise<calendar_v3.Calendar> {
    logToFile('Getting authenticated client for calendar...');
    const auth = await this.authManager.getAuthenticatedClient();
    logToFile('Got auth client, creating calendar instance...');
    const options = { ...gaxiosOptions, auth };
    return google.calendar({ version: 'v3', ...options });
  }

  private async getPrimaryCalendarId(): Promise<string> {
    if (this.primaryCalendarId) {
      return this.primaryCalendarId;
    }
    logToFile('Getting primary calendar ID...');
    const calendar = await this.getCalendar();
    const res = await calendar.calendarList.list();
    const primaryCalendar = res.data.items?.find((c) => c.primary);
    if (primaryCalendar && primaryCalendar.id) {
      logToFile(`Found primary calendar: ${primaryCalendar.id}`);
      this.primaryCalendarId = primaryCalendar.id;
      return primaryCalendar.id;
    }
    logToFile('No primary calendar found, defaulting to "primary"');
    return 'primary';
  }

  listCalendars = async () => {
    logToFile('listCalendars called');
    try {
      logToFile('Getting calendar instance...');
      const calendar = await this.getCalendar();
      logToFile('Making API call to calendar.calendarList.list()...');
      const res = await calendar.calendarList.list();
      logToFile(`Found ${res.data.items?.length} calendars.`);
      const calendars = res.data.items || [];
      logToFile(
        `Returning calendar data: ${JSON.stringify(calendars.map((c) => ({ id: c?.id, summary: c?.summary })))}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              calendars.map((c) => ({ id: c?.id, summary: c?.summary })),
            ),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(`Error during calendar.list: ${errorMessage}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  createEvent = async (input: CreateEventInput) => {
    const {
      calendarId,
      description,
      start,
      end,
      attendees,
      sendUpdates,
      addGoogleMeet,
      attachments,
      eventType,
      focusTimeProperties,
      outOfOfficeProperties,
      workingLocationProperties,
    } = input;

    // Apply default summary based on event type
    const summaryDefaults: Record<string, string> = {
      focusTime: 'Focus Time',
      outOfOffice: 'Out of Office',
      workingLocation: 'Working Location',
    };
    const summary =
      input.summary ?? (eventType ? summaryDefaults[eventType] : undefined);

    try {
      validateCreateEventInput(input);
    } catch (error) {
      return this.createValidationErrorResponse(error);
    }

    const finalCalendarId = calendarId || (await this.getPrimaryCalendarId());
    logToFile(`Creating event in calendar: ${finalCalendarId}`);
    logToFile(`Event summary: ${summary}`);
    if (eventType) logToFile(`Event type: ${eventType}`);
    if (description) logToFile(`Event description: ${description}`);
    logToFile(`Event start: ${start.dateTime || start.date}`);
    logToFile(`Event end: ${end.dateTime || end.date}`);
    logToFile(`Event attendees: ${attendees?.join(', ')}`);
    if (addGoogleMeet) logToFile('Adding Google Meet link');
    if (attachments?.length)
      logToFile(`Attachments: ${attachments.length} file(s)`);

    // Determine sendUpdates value
    let finalSendUpdates = sendUpdates;
    if (finalSendUpdates === undefined) {
      finalSendUpdates = attendees?.length ? 'all' : 'none';
    }
    if (finalSendUpdates) {
      logToFile(`Sending updates: ${finalSendUpdates}`);
    }

    try {
      const event: calendar_v3.Schema$Event = {
        summary,
        description,
        start,
        end,
        attendees: attendees?.map((email) => ({ email })),
      };

      // Set event type and type-specific properties
      if (eventType && eventType !== 'default') {
        event.eventType = eventType;
      }

      if (eventType === 'focusTime') {
        event.transparency = 'opaque';
        event.focusTimeProperties = {
          chatStatus: focusTimeProperties?.chatStatus ?? 'doNotDisturb',
          autoDeclineMode:
            focusTimeProperties?.autoDeclineMode ??
            'declineOnlyNewConflictingInvitations',
        };
        if (focusTimeProperties?.declineMessage !== undefined) {
          event.focusTimeProperties.declineMessage =
            focusTimeProperties.declineMessage;
        }
      } else if (eventType === 'outOfOffice') {
        event.transparency = 'opaque';
        event.outOfOfficeProperties = {
          autoDeclineMode:
            outOfOfficeProperties?.autoDeclineMode ??
            'declineOnlyNewConflictingInvitations',
        };
        if (outOfOfficeProperties?.declineMessage !== undefined) {
          event.outOfOfficeProperties.declineMessage =
            outOfOfficeProperties.declineMessage;
        }
      } else if (eventType === 'workingLocation') {
        // workingLocationProperties is guaranteed non-null by validation above
        const wlInput = workingLocationProperties!;
        event.visibility = 'public';
        event.transparency = 'transparent';

        const wlProps: calendar_v3.Schema$EventWorkingLocationProperties = {
          type: wlInput.type,
        };
        if (wlInput.type === 'homeOffice') {
          wlProps.homeOffice = {};
        } else if (
          wlInput.type === 'officeLocation' &&
          wlInput.officeLocation
        ) {
          wlProps.officeLocation = {
            buildingId: wlInput.officeLocation.buildingId,
            label: wlInput.officeLocation.label,
          };
        } else if (
          wlInput.type === 'customLocation' &&
          wlInput.customLocation
        ) {
          wlProps.customLocation = {
            label: wlInput.customLocation.label,
          };
        }
        event.workingLocationProperties = wlProps;
      }

      const calendar = await this.getCalendar();
      const insertParams: calendar_v3.Params$Resource$Events$Insert = {
        calendarId: finalCalendarId,
        requestBody: event,
        sendUpdates: finalSendUpdates,
      };
      this.applyMeetAndAttachments(
        event,
        insertParams,
        addGoogleMeet,
        attachments,
        { allowEmptyAttachments: false },
      );

      const res = await calendar.events.insert(insertParams);
      logToFile(`Successfully created event: ${res.data.id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(res.data),
          },
        ],
      };
    } catch (error) {
      const errorMessage = this.extractErrorMessage(error);
      logToFile(`Error during calendar.createEvent: ${errorMessage}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  listEvents = async (input: ListEventsInput) => {
    const {
      calendarId,
      timeMin = new Date().toISOString(),
      attendeeResponseStatus = ['accepted', 'tentative', 'needsAction'],
      eventTypes,
    } = input;

    let timeMax = input.timeMax;
    if (!timeMax) {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      timeMax = thirtyDaysFromNow.toISOString();
    }

    const finalCalendarId = calendarId || (await this.getPrimaryCalendarId());
    logToFile(`Listing events for calendar: ${finalCalendarId}`);
    try {
      const calendar = await this.getCalendar();
      const listParams: calendar_v3.Params$Resource$Events$List = {
        calendarId: finalCalendarId,
        timeMin,
        timeMax,
        singleEvents: true,
        fields:
          'items(id,summary,start,end,description,htmlLink,attendees,status,eventType,focusTimeProperties,outOfOfficeProperties,workingLocationProperties)',
      };
      if (eventTypes && eventTypes.length > 0) {
        listParams.eventTypes = eventTypes;
      }
      const res = await calendar.events.list(listParams);

      const events = res.data.items
        ?.filter(
          (event) =>
            event.status !== 'cancelled' &&
            (!!event.summary ||
              (event.eventType && event.eventType !== 'default')),
        )
        .filter((event) => {
          if (!event.attendees || event.attendees.length === 0) {
            return true; // No attendees, so we can't filter, include it
          }
          if (event.attendees.length === 1 && event.attendees[0].self) {
            return true; // I'm the only one, always include it
          }
          const self = event.attendees.find((a) => a.self);
          if (!self) {
            return true; // We are not an attendee, include it
          }
          return attendeeResponseStatus.includes(
            self.responseStatus || 'needsAction',
          );
        });

      logToFile(`Found ${events?.length} events after filtering.`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(events),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(`Error during calendar.listEvents: ${errorMessage}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  getEvent = async (input: GetEventInput) => {
    const { eventId, calendarId } = input;
    const finalCalendarId = calendarId || (await this.getPrimaryCalendarId());
    logToFile(`Getting event ${eventId} from calendar: ${finalCalendarId}`);
    try {
      const calendar = await this.getCalendar();
      const res = await calendar.events.get({
        calendarId: finalCalendarId,
        eventId,
      });
      logToFile(`Successfully retrieved event: ${res.data.id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(res.data),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        (error as any).response?.data?.error?.message ||
        (error instanceof Error ? error.message : String(error));
      logToFile(`Error during calendar.getEvent: ${errorMessage}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  deleteEvent = async (input: DeleteEventInput) => {
    const { eventId, calendarId } = input;
    const finalCalendarId = calendarId || (await this.getPrimaryCalendarId());
    logToFile(`Deleting event ${eventId} from calendar: ${finalCalendarId}`);

    try {
      const calendar = await this.getCalendar();
      await calendar.events.delete({
        calendarId: finalCalendarId,
        eventId,
      });

      logToFile(`Successfully deleted event: ${eventId}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              message: `Successfully deleted event ${eventId}`,
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        (error as any).response?.data?.error?.message ||
        (error instanceof Error ? error.message : String(error));
      logToFile(`Error during calendar.deleteEvent: ${errorMessage}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  updateEvent = async (input: UpdateEventInput) => {
    const {
      eventId,
      calendarId,
      summary,
      description,
      start,
      end,
      attendees,
      addGoogleMeet,
      attachments,
    } = input;

    try {
      validateUpdateEventInput(input);
    } catch (error) {
      return this.createValidationErrorResponse(error);
    }

    const finalCalendarId = calendarId || (await this.getPrimaryCalendarId());
    logToFile(`Updating event ${eventId} in calendar: ${finalCalendarId}`);
    if (addGoogleMeet) logToFile('Adding Google Meet link');
    if (attachments?.length)
      logToFile(`Attachments: ${attachments.length} file(s)`);

    try {
      const calendar = await this.getCalendar();
      const requestBody: calendar_v3.Schema$Event = {};
      if (summary !== undefined) requestBody.summary = summary;
      if (description !== undefined) requestBody.description = description;
      if (start) requestBody.start = start;
      if (end) requestBody.end = end;
      if (attendees !== undefined)
        requestBody.attendees = attendees.map((email) => ({ email }));

      const updateParams: calendar_v3.Params$Resource$Events$Patch = {
        calendarId: finalCalendarId,
        eventId,
        requestBody,
      };
      this.applyMeetAndAttachments(
        requestBody,
        updateParams,
        addGoogleMeet,
        attachments,
        { allowEmptyAttachments: true },
      );

      const res = await calendar.events.patch(updateParams);

      logToFile(`Successfully updated event: ${res.data.id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(res.data),
          },
        ],
      };
    } catch (error) {
      const errorMessage = this.extractErrorMessage(error);
      logToFile(`Error during calendar.updateEvent: ${errorMessage}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  respondToEvent = async (input: RespondToEventInput) => {
    const {
      eventId,
      calendarId,
      responseStatus,
      sendNotification = true,
      responseMessage,
    } = input;
    const finalCalendarId = calendarId || (await this.getPrimaryCalendarId());

    logToFile(
      `Responding to event ${eventId} in calendar: ${finalCalendarId} with status: ${responseStatus}`,
    );
    if (responseMessage) {
      logToFile(`Response message: ${responseMessage}`);
    }

    try {
      const calendar = await this.getCalendar();

      // First, get the current event to find the attendee entry
      const event = await calendar.events.get({
        calendarId: finalCalendarId,
        eventId,
      });

      if (!event.data.attendees || event.data.attendees.length === 0) {
        logToFile('Event has no attendees');
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: 'Event has no attendees' }),
            },
          ],
        };
      }

      // Find the current user's attendee entry
      const selfAttendee = event.data.attendees.find((a) => a.self === true);
      if (!selfAttendee) {
        logToFile('User is not an attendee of this event');
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'You are not an attendee of this event',
              }),
            },
          ],
        };
      }

      // Update the response status for the current user
      selfAttendee.responseStatus = responseStatus;
      if (responseMessage !== undefined) {
        selfAttendee.comment = responseMessage;
      }

      // Patch the event with the updated attendee list
      const res = await calendar.events.patch({
        calendarId: finalCalendarId,
        eventId,
        sendNotifications: sendNotification,
        requestBody: {
          attendees: event.data.attendees,
        },
      });

      logToFile(
        `Successfully responded to event: ${res.data.id} with status: ${responseStatus}`,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              eventId: res.data.id,
              summary: res.data.summary,
              responseStatus,
              message: `Successfully ${responseStatus} the meeting invitation${responseMessage ? ' with message' : ''}`,
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(`Error during calendar.respondToEvent: ${errorMessage}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  findFreeTime = async (input: FindFreeTimeInput) => {
    const { attendees, timeMin, timeMax, duration } = input;

    // Validate datetime formats
    try {
      iso8601DateTimeSchema.parse(timeMin);
      iso8601DateTimeSchema.parse(timeMax);
      // Note: attendees can include 'me' as a special value, so we don't validate as emails
    } catch (error) {
      return this.createValidationErrorResponse(error);
    }

    logToFile(`Finding free time for attendees: ${attendees.join(', ')}`);
    logToFile(`Time range: ${timeMin} - ${timeMax}`);
    logToFile(`Duration: ${duration} minutes`);

    try {
      const calendar = await this.getCalendar();
      const items = await Promise.all(
        attendees.map(async (email) => {
          if (email === 'me') {
            const primaryId = await this.getPrimaryCalendarId();
            return { id: primaryId };
          }
          return { id: email };
        }),
      );

      const res = await calendar.freebusy.query({
        requestBody: {
          items,
          timeMin,
          timeMax,
        },
      });

      const busyTimes = Object.values(res.data.calendars || {}).flatMap(
        (cal) => cal.busy || [],
      );
      if (busyTimes.length === 0) {
        logToFile(
          'No busy times found, returning the start of the time range.',
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                start: timeMin,
                end: new Date(
                  new Date(timeMin).getTime() + duration * 60000,
                ).toISOString(),
              }),
            },
          ],
        };
      }

      // Sort and merge overlapping busy intervals for better performance
      const sortedBusyTimes = busyTimes
        .filter((busy) => busy.start && busy.end)
        .map((busy) => ({
          start: new Date(busy.start!).getTime(),
          end: new Date(busy.end!).getTime(),
        }))
        .sort((a, b) => a.start - b.start);

      const mergedBusyTimes: { start: number; end: number }[] = [];
      for (const busy of sortedBusyTimes) {
        if (mergedBusyTimes.length === 0) {
          mergedBusyTimes.push(busy);
        } else {
          const last = mergedBusyTimes[mergedBusyTimes.length - 1];
          if (busy.start <= last.end) {
            // Overlapping or adjacent intervals - merge them
            last.end = Math.max(last.end, busy.end);
          } else {
            mergedBusyTimes.push(busy);
          }
        }
      }

      const startTime = new Date(timeMin).getTime();
      const endTime = new Date(timeMax).getTime();
      const durationMs = duration * 60000;

      // If no busy times, return the start of the range
      if (mergedBusyTimes.length === 0) {
        const slotEnd = new Date(startTime + durationMs);
        logToFile(
          `No busy times, found free time: ${timeMin} - ${slotEnd.toISOString()}`,
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                start: timeMin,
                end: slotEnd.toISOString(),
              }),
            },
          ],
        };
      }

      // Check if we can fit the meeting before the first busy slot
      if (startTime + durationMs <= mergedBusyTimes[0].start) {
        const slotEnd = new Date(startTime + durationMs);
        logToFile(`Found free time: ${timeMin} - ${slotEnd.toISOString()}`);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                start: timeMin,
                end: slotEnd.toISOString(),
              }),
            },
          ],
        };
      }

      // Check gaps between busy slots
      for (let i = 0; i < mergedBusyTimes.length - 1; i++) {
        const gapStart = mergedBusyTimes[i].end;
        const gapEnd = mergedBusyTimes[i + 1].start;

        if (gapEnd - gapStart >= durationMs) {
          const slotStart = new Date(gapStart);
          const slotEnd = new Date(gapStart + durationMs);
          logToFile(
            `Found free time: ${slotStart.toISOString()} - ${slotEnd.toISOString()}`,
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  start: slotStart.toISOString(),
                  end: slotEnd.toISOString(),
                }),
              },
            ],
          };
        }
      }

      // Check if we can fit after the last busy slot
      const lastBusyEnd = mergedBusyTimes[mergedBusyTimes.length - 1].end;
      if (lastBusyEnd + durationMs <= endTime) {
        const slotStart = new Date(lastBusyEnd);
        const slotEnd = new Date(lastBusyEnd + durationMs);
        logToFile(
          `Found free time: ${slotStart.toISOString()} - ${slotEnd.toISOString()}`,
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                start: slotStart.toISOString(),
                end: slotEnd.toISOString(),
              }),
            },
          ],
        };
      }

      logToFile('No available free time found');
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'No available free time found' }),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(`Error during calendar.findFreeTime: ${errorMessage}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };
}
