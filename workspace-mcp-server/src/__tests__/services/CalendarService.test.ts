/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { CalendarService } from '../../services/CalendarService';
import { google } from 'googleapis';

// Mock the googleapis module
jest.mock('googleapis');
jest.mock('../../utils/logger');

describe('CalendarService', () => {
  let calendarService: CalendarService;
  let mockAuthManager: any;
  let mockCalendarAPI: any;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock AuthManager
    mockAuthManager = {
      getAuthenticatedClient: jest.fn(),
    };

    // Create mock Calendar API
    mockCalendarAPI = {
      calendarList: {
        list: jest.fn(),
      },
      events: {
        list: jest.fn(),
        insert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        get: jest.fn(),
        patch: jest.fn(),
      },
      freebusy: {
        query: jest.fn(),
      },
    };

    // Mock the google.calendar constructor
    (google.calendar as jest.Mock) = jest.fn().mockReturnValue(mockCalendarAPI);

    // Create CalendarService instance
    calendarService = new CalendarService(mockAuthManager);

    const mockAuthClient = { access_token: 'test-token' };
    mockAuthManager.getAuthenticatedClient.mockResolvedValue(mockAuthClient);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('listCalendars', () => {
    it('should list all calendars', async () => {
      const mockCalendars = [
        { id: 'primary', summary: 'Primary Calendar' },
        { id: 'work', summary: 'Work Calendar' },
        { id: 'personal', summary: 'Personal Calendar' },
      ];

      mockCalendarAPI.calendarList.list.mockResolvedValue({
        data: {
          items: mockCalendars,
        },
      });

      const result = await calendarService.listCalendars();

      expect(mockCalendarAPI.calendarList.list).toHaveBeenCalledTimes(1);
      
      const expectedResult = mockCalendars.map(c => ({ 
        id: c.id, 
        summary: c.summary 
      }));
      expect(JSON.parse(result.content[0].text)).toEqual(expectedResult);
    });

    it('should handle empty calendar list', async () => {
      mockCalendarAPI.calendarList.list.mockResolvedValue({
        data: {
          items: [],
        },
      });

      const result = await calendarService.listCalendars();

      expect(mockCalendarAPI.calendarList.list).toHaveBeenCalledTimes(1);
      expect(JSON.parse(result.content[0].text)).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('Calendar API failed');
      mockCalendarAPI.calendarList.list.mockRejectedValue(apiError);

      const result = await calendarService.listCalendars();

      expect(JSON.parse(result.content[0].text)).toEqual({ error: 'Calendar API failed' });
    });

    it('should handle undefined items in response', async () => {
      mockCalendarAPI.calendarList.list.mockResolvedValue({
        data: {},
      });

      const result = await calendarService.listCalendars();

      expect(JSON.parse(result.content[0].text)).toEqual([]);
    });
  });

  describe('createEvent', () => {
    beforeEach(async () => {
      mockCalendarAPI.calendarList.list.mockResolvedValue({
        data: {
          items: [{ id: 'primary-calendar-id', primary: true }],
        },
      });
    });

    it('should create a calendar event without a calendarId', async () => {
      const eventInput = {
        summary: 'Team Meeting',
        start: { dateTime: '2024-01-15T10:00:00-07:00' },
        end: { dateTime: '2024-01-15T11:00:00-07:00' },
      };

      const mockCreatedEvent = {
        id: 'event123',
        summary: 'Team Meeting',
        start: eventInput.start,
        end: eventInput.end,
        status: 'confirmed',
      };

      mockCalendarAPI.events.insert.mockResolvedValue({
        data: mockCreatedEvent,
      });

      const result = await calendarService.createEvent(eventInput);

      expect(mockCalendarAPI.events.insert).toHaveBeenCalledWith({
        calendarId: 'primary-calendar-id',
        requestBody: {
          summary: 'Team Meeting',
          start: eventInput.start,
          end: eventInput.end,
        },
      });

      expect(JSON.parse(result.content[0].text)).toEqual(mockCreatedEvent);
    });

    it('should create a calendar event', async () => {
      const eventInput = {
        calendarId: 'primary',
        summary: 'Team Meeting',
        start: { dateTime: '2024-01-15T10:00:00-07:00' },
        end: { dateTime: '2024-01-15T11:00:00-07:00' },
      };

      const mockCreatedEvent = {
        id: 'event123',
        summary: 'Team Meeting',
        start: eventInput.start,
        end: eventInput.end,
        status: 'confirmed',
      };

      mockCalendarAPI.events.insert.mockResolvedValue({
        data: mockCreatedEvent,
      });

      const result = await calendarService.createEvent(eventInput);

      expect(mockCalendarAPI.events.insert).toHaveBeenCalledWith({
        calendarId: 'primary',
        requestBody: {
          summary: 'Team Meeting',
          start: eventInput.start,
          end: eventInput.end,
        },
      });

      expect(JSON.parse(result.content[0].text)).toEqual(mockCreatedEvent);
    });

    it('should handle event creation errors', async () => {
      const eventInput = {
        calendarId: 'primary',
        summary: 'Invalid Event',
        start: { dateTime: 'invalid-date' },
        end: { dateTime: 'invalid-date' },
      };

      // The validation now catches this before it reaches the API
      const result = await calendarService.createEvent(eventInput);

      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.error).toBe('Invalid input format');
      expect(errorResponse.details).toContain('Invalid ISO 8601 datetime format');
    });
  });

  describe('listEvents', () => {
    beforeEach(async () => {
      mockCalendarAPI.calendarList.list.mockResolvedValue({
        data: {
          items: [{ id: 'primary-calendar-id', primary: true }],
        },
      });
    });

    it('should list events for a calendar without a calendarId', async () => {
      const mockEvents = [
        {
          id: 'event1',
          summary: 'Meeting 1',
          start: { dateTime: '2024-01-15T09:00:00Z' },
          end: { dateTime: '2024-01-15T10:00:00Z' },
          status: 'confirmed',
        },
        {
          id: 'event2',
          summary: 'Meeting 2',
          start: { dateTime: '2024-01-15T14:00:00Z' },
          end: { dateTime: '2024-01-15T15:00:00Z' },
          status: 'confirmed',
        },
      ];

      mockCalendarAPI.events.list.mockResolvedValue({
        data: {
          items: mockEvents,
        },
      });

      const result = await calendarService.listEvents({
        timeMin: '2024-01-15T00:00:00Z',
        timeMax: '2024-01-16T00:00:00Z',
      });

      expect(mockCalendarAPI.events.list).toHaveBeenCalledWith({
        calendarId: 'primary-calendar-id',
        timeMin: '2024-01-15T00:00:00Z',
        timeMax: '2024-01-16T00:00:00Z',
        singleEvents: true,
        fields: 'items(id,summary,start,end,description,htmlLink,attendees,status)',
      });

      expect(JSON.parse(result.content[0].text)).toEqual(mockEvents);
    });

    it('should list events for a calendar', async () => {
      const mockEvents = [
        {
          id: 'event1',
          summary: 'Meeting 1',
          start: { dateTime: '2024-01-15T09:00:00Z' },
          end: { dateTime: '2024-01-15T10:00:00Z' },
          status: 'confirmed',
        },
        {
          id: 'event2',
          summary: 'Meeting 2',
          start: { dateTime: '2024-01-15T14:00:00Z' },
          end: { dateTime: '2024-01-15T15:00:00Z' },
          status: 'confirmed',
        },
      ];

      mockCalendarAPI.events.list.mockResolvedValue({
        data: {
          items: mockEvents,
        },
      });

      const result = await calendarService.listEvents({
        calendarId: 'primary',
        timeMin: '2024-01-15T00:00:00Z',
        timeMax: '2024-01-16T00:00:00Z',
      });

      expect(mockCalendarAPI.events.list).toHaveBeenCalledWith({
        calendarId: 'primary',
        timeMin: '2024-01-15T00:00:00Z',
        timeMax: '2024-01-16T00:00:00Z',
        singleEvents: true,
        fields: 'items(id,summary,start,end,description,htmlLink,attendees,status)',
      });

      expect(JSON.parse(result.content[0].text)).toEqual(mockEvents);
    });

    it('should list events with a default timeMax', async () => {
      const mockEvents = [
        {
          id: 'event1',
          summary: 'Meeting 1',
          start: { dateTime: '2024-01-15T09:00:00Z' },
          end: { dateTime: '2024-01-15T10:00:00Z' },
          status: 'confirmed',
        },
        {
          id: 'event2',
          summary: 'Meeting 2',
          start: { dateTime: '2024-01-15T14:00:00Z' },
          end: { dateTime: '2024-01-15T15:00:00Z' },
          status: 'confirmed',
        },
      ];

      mockCalendarAPI.events.list.mockResolvedValue({
        data: {
          items: mockEvents,
        },
      });

      const result = await calendarService.listEvents({
        calendarId: 'primary',
        timeMin: '2024-01-15T00:00:00Z',
      });

      expect(mockCalendarAPI.events.list).toHaveBeenCalledWith(
        expect.objectContaining({
          timeMax: expect.any(String),
        }),
      );

      expect(JSON.parse(result.content[0].text)).toEqual(mockEvents);
    });

    it('should filter out cancelled events', async () => {
      const mockEvents = [
        {
          id: 'event1',
          summary: 'Active Meeting',
          status: 'confirmed',
        },
        {
          id: 'event2',
          summary: 'Cancelled Meeting',
          status: 'cancelled',
        },
        {
          id: 'event3',
          summary: 'Another Active Meeting',
          status: 'confirmed',
        },
      ];

      mockCalendarAPI.events.list.mockResolvedValue({
        data: {
          items: mockEvents,
        },
      });

      const result = await calendarService.listEvents({
        calendarId: 'primary',
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult).toHaveLength(2);
      expect(parsedResult.map((e: any) => e.id)).toEqual(['event1', 'event3']);
    });

    it('should filter events based on attendee response status', async () => {
      const mockEvents = [
        {
          id: 'event1',
          summary: 'Meeting I accepted',
          status: 'confirmed',
          attendees: [
            { email: 'me@example.com', self: true, responseStatus: 'accepted' },
            { email: 'other@example.com', responseStatus: 'tentative' },
          ],
        },
        {
          id: 'event2',
          summary: 'Meeting I declined',
          status: 'confirmed',
          attendees: [
            { email: 'me@example.com', self: true, responseStatus: 'declined' },
            { email: 'other@example.com', responseStatus: 'accepted' },
          ],
        },
        {
          id: 'event3',
          summary: 'Meeting needs response',
          status: 'confirmed',
          attendees: [
            { email: 'me@example.com', self: true, responseStatus: 'needsAction' },
          ],
        },
      ];

      mockCalendarAPI.events.list.mockResolvedValue({
        data: {
          items: mockEvents,
        },
      });

      const result = await calendarService.listEvents({
        calendarId: 'primary',
        attendeeResponseStatus: ['accepted', 'needsAction'],
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult).toHaveLength(2);
      expect(parsedResult.map((e: any) => e.id)).toEqual(['event1', 'event3']);
    });

    it('should include events with no attendees', async () => {
      const mockEvents = [
        {
          id: 'event1',
          summary: 'Personal Task',
          status: 'confirmed',
          // No attendees property
        },
        {
          id: 'event2',
          summary: 'Meeting with attendees',
          status: 'confirmed',
          attendees: [
            { email: 'me@example.com', self: true, responseStatus: 'accepted' },
          ],
        },
      ];

      mockCalendarAPI.events.list.mockResolvedValue({
        data: {
          items: mockEvents,
        },
      });

      const result = await calendarService.listEvents({
        calendarId: 'primary',
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult).toHaveLength(2);
    });

    it('should filter out events without summary', async () => {
      const mockEvents = [
        {
          id: 'event1',
          summary: 'Valid Event',
          status: 'confirmed',
        },
        {
          id: 'event2',
          // No summary
          status: 'confirmed',
        },
        {
          id: 'event3',
          summary: null,
          status: 'confirmed',
        },
      ];

      mockCalendarAPI.events.list.mockResolvedValue({
        data: {
          items: mockEvents,
        },
      });

      const result = await calendarService.listEvents({
        calendarId: 'primary',
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult).toHaveLength(1);
      expect(parsedResult[0].id).toBe('event1');
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('Events API failed');
      mockCalendarAPI.events.list.mockRejectedValue(apiError);

      const result = await calendarService.listEvents({
        calendarId: 'primary',
      });

      expect(JSON.parse(result.content[0].text)).toEqual({ error: 'Events API failed' });
    });

    it('should handle empty events list', async () => {
      mockCalendarAPI.events.list.mockResolvedValue({
        data: {
          items: [],
        },
      });

      const result = await calendarService.listEvents({
        calendarId: 'primary',
      });

      expect(JSON.parse(result.content[0].text)).toEqual([]);
    });

    it('should use default attendeeResponseStatus when not provided', async () => {
      const mockEvents = [
        {
          id: 'event1',
          summary: 'Meeting',
          status: 'confirmed',
          attendees: [
            { email: 'me@example.com', self: true, responseStatus: 'accepted' },
          ],
        },
      ];

      mockCalendarAPI.events.list.mockResolvedValue({
        data: {
          items: mockEvents,
        },
      });

      await calendarService.listEvents({
        calendarId: 'primary',
      });

      expect(mockCalendarAPI.events.list).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'primary',
        })
      );
    });
  });

  describe('findFreeTime', () => {
    it('should find a free time slot', async () => {
      const busyData = {
        'user1@example.com': {
          busy: [
            { start: '2024-01-15T09:00:00Z', end: '2024-01-15T10:00:00Z' },
            { start: '2024-01-15T14:00:00Z', end: '2024-01-15T15:00:00Z' },
          ],
        },
        'user2@example.com': {
          busy: [
            { start: '2024-01-15T10:30:00Z', end: '2024-01-15T11:30:00Z' },
          ],
        },
      };

      mockCalendarAPI.freebusy.query.mockResolvedValue({
        data: { calendars: busyData },
      });

      const result = await calendarService.findFreeTime({
        attendees: ['user1@example.com', 'user2@example.com'],
        timeMin: '2024-01-15T08:00:00Z',
        timeMax: '2024-01-15T18:00:00Z',
        duration: 60,
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.start).toBeDefined();
      expect(parsedResult.end).toBeDefined();
      expect(new Date(parsedResult.end).getTime() - new Date(parsedResult.start).getTime()).toBe(60 * 60 * 1000);
    });

    it('should return an error if no free time is found', async () => {
      const busyData = {
        'user1@example.com': {
          busy: [
            { start: '2024-01-15T08:00:00Z', end: '2024-01-15T18:00:00Z' },
          ],
        },
      };

      mockCalendarAPI.freebusy.query.mockResolvedValue({
        data: { calendars: busyData },
      });

      const result = await calendarService.findFreeTime({
        attendees: ['user1@example.com'],
        timeMin: '2024-01-15T08:00:00Z',
        timeMax: '2024-01-15T18:00:00Z',
        duration: 60,
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.error).toBe('No available free time found');
    });

    it('should handle the "me" attendee', async () => {
      mockCalendarAPI.calendarList.list.mockResolvedValue({
        data: {
          items: [{ id: 'primary-calendar-id', primary: true }],
        },
      });

      const busyData = {
        'primary-calendar-id': {
          busy: [],
        },
      };

      mockCalendarAPI.freebusy.query.mockResolvedValue({
        data: { calendars: busyData },
      });

      const result = await calendarService.findFreeTime({
        attendees: ['me'],
        timeMin: '2024-01-15T08:00:00Z',
        timeMax: '2024-01-15T18:00:00Z',
        duration: 30,
      });

      expect(mockCalendarAPI.freebusy.query).toHaveBeenCalledWith({
        requestBody: {
          items: [{ id: 'primary-calendar-id' }],
          timeMin: '2024-01-15T08:00:00Z',
          timeMax: '2024-01-15T18:00:00Z',
        },
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.start).toBeDefined();
    });
  });

  describe('updateEvent', () => {
    beforeEach(async () => {
      mockCalendarAPI.calendarList.list.mockResolvedValue({
        data: {
          items: [{ id: 'primary', primary: true }],
        },
      });
    });

    it('should update an event', async () => {
      const updatedEvent = {
        id: 'event123',
        summary: 'Updated Meeting',
        start: { dateTime: '2024-01-15T14:00:00Z' },
        end: { dateTime: '2024-01-15T15:00:00Z' },
        attendees: [{ email: 'new@example.com' }],
      };

      mockCalendarAPI.events.update.mockResolvedValue({ data: updatedEvent });

      const result = await calendarService.updateEvent({
        eventId: 'event123',
        summary: 'Updated Meeting',
        start: { dateTime: '2024-01-15T14:00:00Z' },
        end: { dateTime: '2024-01-15T15:00:00Z' },
        attendees: ['new@example.com'],
      });

      expect(mockCalendarAPI.events.update).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event123',
        requestBody: {
          summary: 'Updated Meeting',
          start: { dateTime: '2024-01-15T14:00:00Z' },
          end: { dateTime: '2024-01-15T15:00:00Z' },
          attendees: [{ email: 'new@example.com' }],
        },
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.id).toBe('event123');
      expect(parsedResult.summary).toBe('Updated Meeting');
    });

    it('should handle update errors', async () => {
      const apiError = new Error('Update failed');
      mockCalendarAPI.events.update.mockRejectedValue(apiError);

      const result = await calendarService.updateEvent({
        eventId: 'event123',
        summary: 'Updated Meeting',
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.error).toBe('Update failed');
    });

    it('should only send fields that are provided', async () => {
      const updatedEvent = {
        id: 'event123',
        summary: 'Updated Meeting Only',
      };

      mockCalendarAPI.events.update.mockResolvedValue({ data: updatedEvent });

      await calendarService.updateEvent({
        eventId: 'event123',
        summary: 'Updated Meeting Only',
      });

      expect(mockCalendarAPI.events.update).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event123',
        requestBody: {
          summary: 'Updated Meeting Only',
        },
      });
    });
  });

  describe('respondToEvent', () => {
    beforeEach(async () => {
      mockCalendarAPI.calendarList.list.mockResolvedValue({
        data: {
          items: [{ id: 'primary', primary: true }],
        },
      });
    });

    it('should accept a meeting invitation', async () => {
      const mockEvent = {
        id: 'event123',
        summary: 'Team Meeting',
        attendees: [
          { email: 'me@example.com', self: true, responseStatus: 'needsAction' },
          { email: 'other@example.com', responseStatus: 'accepted' },
        ],
      };

      const updatedEvent = {
        ...mockEvent,
        attendees: [
          { email: 'me@example.com', self: true, responseStatus: 'accepted' },
          { email: 'other@example.com', responseStatus: 'accepted' },
        ],
      };

      mockCalendarAPI.events.get.mockResolvedValue({ data: mockEvent });
      mockCalendarAPI.events.patch.mockResolvedValue({ data: updatedEvent });

      const result = await calendarService.respondToEvent({
        eventId: 'event123',
        responseStatus: 'accepted',
      });

      expect(mockCalendarAPI.events.get).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event123',
      });

      expect(mockCalendarAPI.events.patch).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event123',
        sendNotifications: true,
        requestBody: {
          attendees: expect.arrayContaining([
            expect.objectContaining({
              email: 'me@example.com',
              self: true,
              responseStatus: 'accepted',
            }),
          ]),
        },
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.eventId).toBe('event123');
      expect(parsedResult.responseStatus).toBe('accepted');
      expect(parsedResult.message).toContain('Successfully accepted');
    });

    it('should decline a meeting invitation with a message', async () => {
      const mockEvent = {
        id: 'event123',
        summary: 'Team Meeting',
        attendees: [
          { email: 'me@example.com', self: true, responseStatus: 'needsAction' },
          { email: 'other@example.com', responseStatus: 'accepted' },
        ],
      };

      const updatedEvent = {
        ...mockEvent,
        attendees: [
          { email: 'me@example.com', self: true, responseStatus: 'declined', comment: 'Sorry, I have a conflict' },
          { email: 'other@example.com', responseStatus: 'accepted' },
        ],
      };

      mockCalendarAPI.events.get.mockResolvedValue({ data: mockEvent });
      mockCalendarAPI.events.patch.mockResolvedValue({ data: updatedEvent });

      const result = await calendarService.respondToEvent({
        eventId: 'event123',
        responseStatus: 'declined',
        responseMessage: 'Sorry, I have a conflict',
      });

      expect(mockCalendarAPI.events.patch).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event123',
        sendNotifications: true,
        requestBody: {
          attendees: expect.arrayContaining([
            expect.objectContaining({
              email: 'me@example.com',
              self: true,
              responseStatus: 'declined',
              comment: 'Sorry, I have a conflict',
            }),
          ]),
        },
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.responseStatus).toBe('declined');
      expect(parsedResult.message).toContain('with message');
    });

    it('should mark attendance as tentative', async () => {
      const mockEvent = {
        id: 'event123',
        summary: 'Team Meeting',
        attendees: [
          { email: 'me@example.com', self: true, responseStatus: 'needsAction' },
        ],
      };

      mockCalendarAPI.events.get.mockResolvedValue({ data: mockEvent });
      mockCalendarAPI.events.patch.mockResolvedValue({ data: { ...mockEvent, attendees: [{ ...mockEvent.attendees[0], responseStatus: 'tentative' }] } });

      const result = await calendarService.respondToEvent({
        eventId: 'event123',
        responseStatus: 'tentative',
        sendNotification: false,
      });

      expect(mockCalendarAPI.events.patch).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event123',
        sendNotifications: false,
        requestBody: {
          attendees: expect.arrayContaining([
            expect.objectContaining({
              responseStatus: 'tentative',
            }),
          ]),
        },
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.responseStatus).toBe('tentative');
    });

    it('should handle events with no attendees', async () => {
      const mockEvent = {
        id: 'event123',
        summary: 'Personal Event',
        // No attendees
      };

      mockCalendarAPI.events.get.mockResolvedValue({ data: mockEvent });

      const result = await calendarService.respondToEvent({
        eventId: 'event123',
        responseStatus: 'accepted',
      });

      expect(mockCalendarAPI.events.patch).not.toHaveBeenCalled();

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.error).toBe('Event has no attendees');
    });

    it('should handle when user is not an attendee', async () => {
      const mockEvent = {
        id: 'event123',
        summary: 'Meeting',
        attendees: [
          { email: 'other1@example.com', responseStatus: 'accepted' },
          { email: 'other2@example.com', responseStatus: 'tentative' },
        ],
      };

      mockCalendarAPI.events.get.mockResolvedValue({ data: mockEvent });

      const result = await calendarService.respondToEvent({
        eventId: 'event123',
        responseStatus: 'accepted',
      });

      expect(mockCalendarAPI.events.patch).not.toHaveBeenCalled();

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.error).toBe('You are not an attendee of this event');
    });

    it('should use custom calendar ID when provided', async () => {
      const mockEvent = {
        id: 'event123',
        summary: 'Team Meeting',
        attendees: [
          { email: 'me@example.com', self: true, responseStatus: 'needsAction' },
        ],
      };

      mockCalendarAPI.events.get.mockResolvedValue({ data: mockEvent });
      mockCalendarAPI.events.patch.mockResolvedValue({ data: { ...mockEvent, attendees: [{ ...mockEvent.attendees[0], responseStatus: 'accepted' }] } });

      await calendarService.respondToEvent({
        eventId: 'event123',
        calendarId: 'custom-calendar-id',
        responseStatus: 'accepted',
      });

      expect(mockCalendarAPI.events.get).toHaveBeenCalledWith({
        calendarId: 'custom-calendar-id',
        eventId: 'event123',
      });

      expect(mockCalendarAPI.events.patch).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'custom-calendar-id',
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('Calendar API failed');
      mockCalendarAPI.events.get.mockRejectedValue(apiError);

      const result = await calendarService.respondToEvent({
        eventId: 'event123',
        responseStatus: 'accepted',
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.error).toBe('Calendar API failed');
    });
  });

  describe('getEvent', () => {
    beforeEach(async () => {
      const mockAuthClient = { access_token: 'test-token' };
      mockAuthManager.getAuthenticatedClient.mockResolvedValue(mockAuthClient);
      mockCalendarAPI.calendarList.list.mockResolvedValue({
        data: {
          items: [{ id: 'primary-calendar-id', primary: true }],
        },
      });
    });

    it('should retrieve a specific event', async () => {
      const mockEvent = {
        id: 'event123',
        summary: 'Test Event',
        start: { dateTime: '2024-01-15T10:00:00-07:00' },
        end: { dateTime: '2024-01-15T11:00:00-07:00' },
      };

      mockCalendarAPI.events.get.mockResolvedValue({ data: mockEvent });

      const result = await calendarService.getEvent({ eventId: 'event123', calendarId: 'primary' });

      expect(mockCalendarAPI.events.get).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event123',
      });

      expect(JSON.parse(result.content[0].text)).toEqual(mockEvent);
    });

    it('should retrieve an event using the primary calendar if no calendarId is provided', async () => {
      const mockEvent = {
        id: 'event123',
        summary: 'Test Event',
        start: { dateTime: '2024-01-15T10:00:00-07:00' },
        end: { dateTime: '2024-01-15T11:00:00-07:00' },
      };

      mockCalendarAPI.events.get.mockResolvedValue({ data: mockEvent });

      const result = await calendarService.getEvent({ eventId: 'event123' });

      expect(mockCalendarAPI.events.get).toHaveBeenCalledWith({
        calendarId: 'primary-calendar-id',
        eventId: 'event123',
      });

      expect(JSON.parse(result.content[0].text)).toEqual(mockEvent);
      });

    it('should handle API errors when getting an event', async () => {
      const apiError = new Error('Event not found');
      mockCalendarAPI.events.get.mockRejectedValue(apiError);

      const result = await calendarService.getEvent({ eventId: 'non-existent-event', calendarId: 'primary' });

      expect(JSON.parse(result.content[0].text)).toEqual({ error: 'Event not found' });
    });
  });
});