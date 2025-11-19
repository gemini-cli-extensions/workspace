/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { calendar_v3, google } from 'googleapis';
import { logToFile } from '../utils/logger';
import { gaxiosOptions } from '../utils/GaxiosConfig';
import { iso8601DateTimeSchema, emailArraySchema } from '../utils/validation';
import { z } from 'zod';

export class CalendarService {
  private primaryCalendarId: string | null = null;

  constructor(private authManager: any) {
  }

  private createValidationErrorResponse(error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Validation failed';
    let helpMessage = 'Please use strict ISO 8601 format with seconds and timezone. Examples: 2024-01-15T10:30:00Z (UTC) or 2024-01-15T10:30:00-05:00 (EST)';

    if (error instanceof z.ZodError && error.issues.some(issue => issue.path.includes('attendees') || issue.message.includes('email'))) {
      helpMessage = 'Please ensure all attendee emails are in a valid format.';
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          error: 'Invalid input format',
          details: errorMessage,
          help: helpMessage
        })
      }]
    };
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
    const primaryCalendar = res.data.items?.find(c => c.primary);
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
      logToFile(`Returning calendar data: ${JSON.stringify(calendars.map(c => ({ id: c?.id, summary: c?.summary })))}`);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(calendars.map(c => ({ id: c?.id, summary: c?.summary })))
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logToFile(`Error during calendar.list: ${errorMessage}`);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ error: errorMessage })
        }]
      };
    }
  }

  createEvent = async (input: { calendarId?: string, summary: string, start: { dateTime: string }, end: { dateTime: string }, attendees?: string[] }) => {
    const { calendarId, summary, start, end, attendees } = input;
    
    // Validate datetime formats
    try {
      iso8601DateTimeSchema.parse(start.dateTime);
      iso8601DateTimeSchema.parse(end.dateTime);
      if (attendees) {
        emailArraySchema.parse(attendees);
      }
    } catch (error) {
      return this.createValidationErrorResponse(error);
    }
    
    const finalCalendarId = calendarId || await this.getPrimaryCalendarId();
    logToFile(`Creating event in calendar: ${finalCalendarId}`);
    logToFile(`Event summary: ${summary}`);
    logToFile(`Event start: ${start.dateTime}`);
    logToFile(`Event end: ${end.dateTime}`);
    logToFile(`Event attendees: ${attendees?.join(', ')}`);
    try {
      const event = {
        summary,
        start,
        end,
        attendees: attendees?.map(email => ({ email }))
      };
      const calendar = await this.getCalendar();
      const res = await calendar.events.insert({
        calendarId: finalCalendarId,
        requestBody: event,
      });
      logToFile(`Successfully created event: ${res.data.id}`);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(res.data)
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logToFile(`Error during calendar.createEvent: ${errorMessage}`);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ error: errorMessage })
        }]
      };
    }
  }

  listEvents = async (input: { calendarId?: string, timeMin?: string, timeMax?: string, attendeeResponseStatus?: string[] }) => {
    const { calendarId, timeMin = (new Date()).toISOString(), attendeeResponseStatus = ['accepted', 'tentative', 'needsAction'] } = input;
    
    let timeMax = input.timeMax;
    if (!timeMax) {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      timeMax = thirtyDaysFromNow.toISOString();
    }

    const finalCalendarId = calendarId || await this.getPrimaryCalendarId();
    logToFile(`Listing events for calendar: ${finalCalendarId}`);
    try {
      const calendar = await this.getCalendar();
      const res = await calendar.events.list({
        calendarId: finalCalendarId,
        timeMin,
        timeMax,
        singleEvents: true,
        fields: 'items(id,summary,start,end,description,htmlLink,attendees,status)',
      });

      const events = res.data.items
        ?.filter(event => event.status !== 'cancelled' && !!event.summary)
        .filter(event => {
          if (!event.attendees || event.attendees.length === 0) {
            return true; // No attendees, so we can't filter, include it
          }
          if (event.attendees.length === 1 && event.attendees[0].self) {
            return true; // I'm the only one, always include it
          }
          const self = event.attendees.find(a => a.self);
          if (!self) {
            return true; // We are not an attendee, include it
          }
          return attendeeResponseStatus.includes(self.responseStatus || 'needsAction');
        });

      logToFile(`Found ${events?.length} events after filtering.`);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(events)
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logToFile(`Error during calendar.listEvents: ${errorMessage}`);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ error: errorMessage })
        }]
      };
    }
  }

  getEvent = async (input: { eventId: string, calendarId?: string }) => {
    const { eventId, calendarId } = input;
    const finalCalendarId = calendarId || await this.getPrimaryCalendarId();
    logToFile(`Getting event ${eventId} from calendar: ${finalCalendarId}`);
    try {
      const calendar = await this.getCalendar();
      const res = await calendar.events.get({
        calendarId: finalCalendarId,
        eventId,
      });
      logToFile(`Successfully retrieved event: ${res.data.id}`);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(res.data)
        }]
      };
    } catch (error) {
      const errorMessage = (error as any).response?.data?.error?.message || (error instanceof Error ? error.message : String(error));
      logToFile(`Error during calendar.getEvent: ${errorMessage}`);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ error: errorMessage })
        }]
      };
    }
  }

  updateEvent = async (input: { eventId: string, calendarId?: string, summary?: string, start?: { dateTime: string }, end?: { dateTime: string }, attendees?: string[] }) => {
    const { eventId, calendarId, summary, start, end, attendees } = input;

    // Validate datetime formats if provided
    try {
      if (start) {
        iso8601DateTimeSchema.parse(start.dateTime);
      }
      if (end) {
        iso8601DateTimeSchema.parse(end.dateTime);
      }
      if (attendees) {
        emailArraySchema.parse(attendees);
      }
    } catch (error) {
      return this.createValidationErrorResponse(error);
    }

    const finalCalendarId = calendarId || await this.getPrimaryCalendarId();
    logToFile(`Updating event ${eventId} in calendar: ${finalCalendarId}`);

    try {
      const calendar = await this.getCalendar();
      
      // Build request body with only the fields to update (patch semantics)
      const requestBody: calendar_v3.Schema$Event = {};
      if (summary !== undefined) requestBody.summary = summary;
      if (start) requestBody.start = start;
      if (end) requestBody.end = end;
      if (attendees) requestBody.attendees = attendees.map(email => ({ email }));

      const res = await calendar.events.update({
        calendarId: finalCalendarId,
        eventId,
        requestBody,
      });

      logToFile(`Successfully updated event: ${res.data.id}`);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(res.data)
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logToFile(`Error during calendar.updateEvent: ${errorMessage}`);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ error: errorMessage })
        }]
      };
    }
  }

  respondToEvent = async (input: { eventId: string, calendarId?: string, responseStatus: 'accepted' | 'declined' | 'tentative', sendNotification?: boolean, responseMessage?: string }) => {
    const { eventId, calendarId, responseStatus, sendNotification = true, responseMessage } = input;
    const finalCalendarId = calendarId || await this.getPrimaryCalendarId();

    logToFile(`Responding to event ${eventId} in calendar: ${finalCalendarId} with status: ${responseStatus}`);
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
          content: [{
            type: "text" as const,
            text: JSON.stringify({ error: 'Event has no attendees' })
          }]
        };
      }

      // Find the current user's attendee entry
      const selfAttendee = event.data.attendees.find(a => a.self === true);
      if (!selfAttendee) {
        logToFile('User is not an attendee of this event');
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ error: 'You are not an attendee of this event' })
          }]
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
          attendees: event.data.attendees
        }
      });

      logToFile(`Successfully responded to event: ${res.data.id} with status: ${responseStatus}`);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            eventId: res.data.id,
            summary: res.data.summary,
            responseStatus,
            message: `Successfully ${responseStatus} the meeting invitation${responseMessage ? ' with message' : ''}`
          })
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logToFile(`Error during calendar.respondToEvent: ${errorMessage}`);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ error: errorMessage })
        }]
      };
    }
  }

  findFreeTime = async (input: { attendees: string[], timeMin: string, timeMax: string, duration: number }) => {
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
      const items = await Promise.all(attendees.map(async (email) => {
        if (email === 'me') {
          const primaryId = await this.getPrimaryCalendarId();
          return { id: primaryId };
        }
        return { id: email };
      }));

      const res = await calendar.freebusy.query({
        requestBody: {
          items,
          timeMin,
          timeMax,
        },
      });

      const busyTimes = Object.values(res.data.calendars || {}).flatMap(cal => cal.busy || []);
      if (busyTimes.length === 0) {
        logToFile('No busy times found, returning the start of the time range.');
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ start: timeMin, end: new Date(new Date(timeMin).getTime() + duration * 60000).toISOString() })
          }]
        };
      }

      // Sort and merge overlapping busy intervals for better performance
      const sortedBusyTimes = busyTimes
        .filter(busy => busy.start && busy.end)
        .map(busy => ({
          start: new Date(busy.start!).getTime(),
          end: new Date(busy.end!).getTime()
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
        logToFile(`No busy times, found free time: ${timeMin} - ${slotEnd.toISOString()}`);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ start: timeMin, end: slotEnd.toISOString() })
          }]
        };
      }

      // Check if we can fit the meeting before the first busy slot
      if (startTime + durationMs <= mergedBusyTimes[0].start) {
        const slotEnd = new Date(startTime + durationMs);
        logToFile(`Found free time: ${timeMin} - ${slotEnd.toISOString()}`);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ start: timeMin, end: slotEnd.toISOString() })
          }]
        };
      }

      // Check gaps between busy slots
      for (let i = 0; i < mergedBusyTimes.length - 1; i++) {
        const gapStart = mergedBusyTimes[i].end;
        const gapEnd = mergedBusyTimes[i + 1].start;
        
        if (gapEnd - gapStart >= durationMs) {
          const slotStart = new Date(gapStart);
          const slotEnd = new Date(gapStart + durationMs);
          logToFile(`Found free time: ${slotStart.toISOString()} - ${slotEnd.toISOString()}`);
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ start: slotStart.toISOString(), end: slotEnd.toISOString() })
            }]
          };
        }
      }

      // Check if we can fit after the last busy slot
      const lastBusyEnd = mergedBusyTimes[mergedBusyTimes.length - 1].end;
      if (lastBusyEnd + durationMs <= endTime) {
        const slotStart = new Date(lastBusyEnd);
        const slotEnd = new Date(lastBusyEnd + durationMs);
        logToFile(`Found free time: ${slotStart.toISOString()} - ${slotEnd.toISOString()}`);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ start: slotStart.toISOString(), end: slotEnd.toISOString() })
          }]
        };
      }

      logToFile('No available free time found');
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ error: 'No available free time found' })
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logToFile(`Error during calendar.findFreeTime: ${errorMessage}`);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ error: errorMessage })
        }]
      };
    }
  }
}
