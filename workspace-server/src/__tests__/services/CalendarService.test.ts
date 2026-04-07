/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
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
    expect(mockCalendarAPI.events.update).not.toHaveBeenCalled();
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

      const expectedResult = mockCalendars.map((c) => ({
        id: c.id,
        summary: c.summary,
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

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'Calendar API failed',
      });
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
        sendUpdates: 'none',
      });

      expect(JSON.parse(result.content[0].text)).toEqual(mockCreatedEvent);
    });

    it('creates a single-day all-day workingLocation event', async () => {
      mockCalendarAPI.events.insert.mockResolvedValue({ data: { id: 'wl1' } });
      await calendarService.createEvent({
        start: { date: '2024-01-15' },
        end: { date: '2024-01-16' },
        eventType: 'workingLocation',
        workingLocationProperties: { type: 'homeOffice' },
      });
      const body = mockCalendarAPI.events.insert.mock.calls[0][0].requestBody;
      expect(body.start).toEqual({ date: '2024-01-15' });
      expect(body.end).toEqual({ date: '2024-01-16' });
      expect(body.eventType).toBe('workingLocation');
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
        sendUpdates: 'none',
      });

      expect(JSON.parse(result.content[0].text)).toEqual(mockCreatedEvent);
    });

    it('should create a calendar event with a description', async () => {
      const eventInput = {
        calendarId: 'primary',
        summary: 'Team Meeting',
        description: 'Monthly strategy sync',
        start: { dateTime: '2024-01-15T10:00:00-07:00' },
        end: { dateTime: '2024-01-15T11:00:00-07:00' },
      };

      const mockCreatedEvent = {
        id: 'event123',
        summary: 'Team Meeting',
        description: 'Monthly strategy sync',
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
          description: 'Monthly strategy sync',
          start: eventInput.start,
          end: eventInput.end,
        },
        sendUpdates: 'none',
      });

      expect(JSON.parse(result.content[0].text)).toEqual(mockCreatedEvent);
    });

    it('should create a calendar event with sendUpdates parameter', async () => {
      const eventInput = {
        calendarId: 'primary',
        summary: 'Team Meeting',
        start: { dateTime: '2024-01-15T10:00:00-07:00' },
        end: { dateTime: '2024-01-15T11:00:00-07:00' },
        attendees: ['test@example.com'],
        sendUpdates: 'all' as const,
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
          attendees: [{ email: 'test@example.com' }],
        },
        sendUpdates: 'all',
      });

      expect(JSON.parse(result.content[0].text)).toEqual(mockCreatedEvent);
    });

    it('should default sendUpdates to "all" when attendees are present but sendUpdates is not provided', async () => {
      const eventInput = {
        calendarId: 'primary',
        summary: 'Team Meeting',
        start: { dateTime: '2024-01-15T10:00:00-07:00' },
        end: { dateTime: '2024-01-15T11:00:00-07:00' },
        attendees: ['test@example.com'],
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
          attendees: [{ email: 'test@example.com' }],
        },
        sendUpdates: 'all',
      });

      expect(JSON.parse(result.content[0].text)).toEqual(mockCreatedEvent);
    });

    it('should default sendUpdates to "none" when no attendees are present and sendUpdates is not provided', async () => {
      const eventInput = {
        calendarId: 'primary',
        summary: 'Solo Working Session',
        start: { dateTime: '2024-01-15T10:00:00-07:00' },
        end: { dateTime: '2024-01-15T11:00:00-07:00' },
      };

      const mockCreatedEvent = {
        id: 'event123',
        summary: 'Solo Working Session',
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
          summary: 'Solo Working Session',
          start: eventInput.start,
          end: eventInput.end,
        },
        sendUpdates: 'none',
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
      expect(errorResponse.details).toContain(
        'Invalid ISO 8601 datetime format',
      );
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
        fields:
          'items(id,summary,start,end,description,htmlLink,attendees,status,eventType,focusTimeProperties,outOfOfficeProperties,workingLocationProperties)',
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
        fields:
          'items(id,summary,start,end,description,htmlLink,attendees,status,eventType,focusTimeProperties,outOfOfficeProperties,workingLocationProperties)',
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
            {
              email: 'me@example.com',
              self: true,
              responseStatus: 'needsAction',
            },
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

    it('should keep status events without summary (focusTime, outOfOffice, workingLocation)', async () => {
      const mockEvents = [
        {
          id: 'event1',
          // No summary, but has a non-default eventType
          status: 'confirmed',
          eventType: 'focusTime',
          focusTimeProperties: { chatStatus: 'doNotDisturb' },
        },
        {
          id: 'event2',
          // No summary, no eventType — should be filtered out
          status: 'confirmed',
        },
        {
          id: 'event3',
          status: 'confirmed',
          eventType: 'workingLocation',
          workingLocationProperties: { type: 'homeOffice' },
        },
      ];

      mockCalendarAPI.events.list.mockResolvedValue({
        data: { items: mockEvents },
      });

      const result = await calendarService.listEvents({
        calendarId: 'primary',
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult).toHaveLength(2);
      expect(parsedResult.map((e: any) => e.id)).toEqual(['event1', 'event3']);
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('Events API failed');
      mockCalendarAPI.events.list.mockRejectedValue(apiError);

      const result = await calendarService.listEvents({
        calendarId: 'primary',
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'Events API failed',
      });
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
        }),
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
      expect(
        new Date(parsedResult.end).getTime() -
          new Date(parsedResult.start).getTime(),
      ).toBe(60 * 60 * 1000);
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

      mockCalendarAPI.events.patch.mockResolvedValue({ data: updatedEvent });

      const result = await calendarService.updateEvent({
        eventId: 'event123',
        summary: 'Updated Meeting',
        start: { dateTime: '2024-01-15T14:00:00Z' },
        end: { dateTime: '2024-01-15T15:00:00Z' },
        attendees: ['new@example.com'],
      });

      expect(mockCalendarAPI.events.patch).toHaveBeenCalledWith({
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

    it('should update an event with a description', async () => {
      const updatedEvent = {
        id: 'event123',
        description: 'New updated description',
      };

      mockCalendarAPI.events.patch.mockResolvedValue({ data: updatedEvent });

      const result = await calendarService.updateEvent({
        eventId: 'event123',
        description: 'New updated description',
      });

      expect(mockCalendarAPI.events.patch).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event123',
        requestBody: {
          description: 'New updated description',
        },
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.description).toBe('New updated description');
    });

    it('should handle update errors', async () => {
      const apiError = new Error('Update failed');
      mockCalendarAPI.events.patch.mockRejectedValue(apiError);

      const result = await calendarService.updateEvent({
        eventId: 'event123',
        summary: 'Updated Meeting',
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.error).toBe('Update failed');
    });

    it('should surface structured Google API field errors on update', async () => {
      mockCalendarAPI.events.patch.mockRejectedValue({
        response: {
          data: {
            error: {
              message: 'Invalid Value',
              code: 400,
              errors: [
                {
                  location: 'start.dateTime',
                  reason: 'invalid',
                  message: 'Invalid start time',
                },
                {
                  location: 'attendees',
                  reason: 'invalid',
                  message: 'Attendee email is invalid',
                },
              ],
            },
          },
        },
      });

      const result = await calendarService.updateEvent({
        eventId: 'event123',
        start: { dateTime: '2024-01-15T10:00:00Z' },
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.error).toBe(
        'Invalid Value (code 400): start.dateTime invalid: Invalid start time; attendees invalid: Attendee email is invalid',
      );
    });

    it('should only send fields that are provided', async () => {
      const updatedEvent = {
        id: 'event123',
        summary: 'Updated Meeting Only',
      };

      mockCalendarAPI.events.patch.mockResolvedValue({ data: updatedEvent });

      await calendarService.updateEvent({
        eventId: 'event123',
        summary: 'Updated Meeting Only',
      });

      expect(mockCalendarAPI.events.patch).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event123',
        requestBody: {
          summary: 'Updated Meeting Only',
        },
      });
    });

    it.each([
      ['summary', { summary: 'X' }],
      ['description', { description: 'X' }],
      ['start', { start: { dateTime: '2024-01-15T10:00:00Z' } }],
      ['end', { end: { dateTime: '2024-01-15T11:00:00Z' } }],
      ['attendees', { attendees: ['a@b.com'] }],
    ])(
      '#313: patch body for %s update contains only that field',
      async (field, patch) => {
        mockCalendarAPI.events.patch.mockResolvedValue({ data: { id: 'e' } });
        await calendarService.updateEvent({ eventId: 'e', ...patch });
        const body = mockCalendarAPI.events.patch.mock.calls[0][0].requestBody;
        expect(Object.keys(body)).toEqual([field]);
      },
    );

    it('should clear description when passed an empty string', async () => {
      mockCalendarAPI.events.patch.mockResolvedValue({
        data: { id: 'event123', description: '' },
      });

      await calendarService.updateEvent({
        eventId: 'event123',
        description: '',
      });

      expect(mockCalendarAPI.events.patch).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event123',
        requestBody: {
          description: '',
        },
      });
    });

    it('should clear attendees when passed an empty array', async () => {
      mockCalendarAPI.events.patch.mockResolvedValue({
        data: { id: 'event123', attendees: [] },
      });

      await calendarService.updateEvent({
        eventId: 'event123',
        attendees: [],
      });

      expect(mockCalendarAPI.events.patch).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event123',
        requestBody: {
          attendees: [],
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
          {
            email: 'me@example.com',
            self: true,
            responseStatus: 'needsAction',
          },
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
          {
            email: 'me@example.com',
            self: true,
            responseStatus: 'needsAction',
          },
          { email: 'other@example.com', responseStatus: 'accepted' },
        ],
      };

      const updatedEvent = {
        ...mockEvent,
        attendees: [
          {
            email: 'me@example.com',
            self: true,
            responseStatus: 'declined',
            comment: 'Sorry, I have a conflict',
          },
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
          {
            email: 'me@example.com',
            self: true,
            responseStatus: 'needsAction',
          },
        ],
      };

      mockCalendarAPI.events.get.mockResolvedValue({ data: mockEvent });
      mockCalendarAPI.events.patch.mockResolvedValue({
        data: {
          ...mockEvent,
          attendees: [
            { ...mockEvent.attendees[0], responseStatus: 'tentative' },
          ],
        },
      });

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
          {
            email: 'me@example.com',
            self: true,
            responseStatus: 'needsAction',
          },
        ],
      };

      mockCalendarAPI.events.get.mockResolvedValue({ data: mockEvent });
      mockCalendarAPI.events.patch.mockResolvedValue({
        data: {
          ...mockEvent,
          attendees: [
            { ...mockEvent.attendees[0], responseStatus: 'accepted' },
          ],
        },
      });

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
        }),
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

      const result = await calendarService.getEvent({
        eventId: 'event123',
        calendarId: 'primary',
      });

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

      const result = await calendarService.getEvent({
        eventId: 'non-existent-event',
        calendarId: 'primary',
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'Event not found',
      });
    });
  });
  describe('deleteEvent', () => {
    beforeEach(async () => {
      mockCalendarAPI.calendarList.list.mockResolvedValue({
        data: {
          items: [{ id: 'primary', primary: true }],
        },
      });
    });

    it('should delete an event from the primary calendar', async () => {
      mockCalendarAPI.events.delete.mockResolvedValue({});

      const result = await calendarService.deleteEvent({
        eventId: 'event123',
      });

      expect(mockCalendarAPI.events.delete).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event123',
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        message: 'Successfully deleted event event123',
      });
    });

    it('should delete an event from a specific calendar', async () => {
      mockCalendarAPI.events.delete.mockResolvedValue({});

      const result = await calendarService.deleteEvent({
        eventId: 'event123',
        calendarId: 'work-calendar',
      });

      expect(mockCalendarAPI.events.delete).toHaveBeenCalledWith({
        calendarId: 'work-calendar',
        eventId: 'event123',
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        message: 'Successfully deleted event event123',
      });
    });

    it('should handle delete errors', async () => {
      const apiError = new Error('Delete failed');
      mockCalendarAPI.events.delete.mockRejectedValue(apiError);

      const result = await calendarService.deleteEvent({
        eventId: 'event123',
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'Delete failed',
      });
    });
  });

  describe('events with Google Meet and attachments', () => {
    beforeEach(async () => {
      mockCalendarAPI.calendarList.list.mockResolvedValue({
        data: {
          items: [{ id: 'primary', primary: true }],
        },
      });
    });

    describe('createEvent with Google Meet', () => {
      it('should create an event with a Google Meet link', async () => {
        const mockCreatedEvent = {
          id: 'event123',
          summary: 'Meeting with Meet',
          conferenceData: {
            conferenceId: 'meet-id',
            entryPoints: [{ uri: 'https://meet.google.com/abc-defg-hij' }],
          },
        };

        mockCalendarAPI.events.insert.mockResolvedValue({
          data: mockCreatedEvent,
        });

        const result = await calendarService.createEvent({
          calendarId: 'primary',
          summary: 'Meeting with Meet',
          start: { dateTime: '2024-01-15T10:00:00-07:00' },
          end: { dateTime: '2024-01-15T11:00:00-07:00' },
          addGoogleMeet: true,
        });

        expect(mockCalendarAPI.events.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            calendarId: 'primary',
            conferenceDataVersion: 1,
            requestBody: expect.objectContaining({
              summary: 'Meeting with Meet',
              conferenceData: expect.objectContaining({
                createRequest: expect.objectContaining({
                  conferenceSolutionKey: { type: 'hangoutsMeet' },
                }),
              }),
            }),
          }),
        );

        expect(JSON.parse(result.content[0].text)).toEqual(mockCreatedEvent);
      });

      it('should not include conferenceData when addGoogleMeet is false', async () => {
        const mockCreatedEvent = { id: 'event123', summary: 'No Meet' };
        mockCalendarAPI.events.insert.mockResolvedValue({
          data: mockCreatedEvent,
        });

        await calendarService.createEvent({
          calendarId: 'primary',
          summary: 'No Meet',
          start: { dateTime: '2024-01-15T10:00:00-07:00' },
          end: { dateTime: '2024-01-15T11:00:00-07:00' },
          addGoogleMeet: false,
        });

        const callArgs = mockCalendarAPI.events.insert.mock.calls[0][0];
        expect(callArgs.conferenceDataVersion).toBeUndefined();
        expect(callArgs.requestBody.conferenceData).toBeUndefined();
      });
    });

    describe('createEvent with attachments', () => {
      it('should create an event with file attachments', async () => {
        const mockCreatedEvent = {
          id: 'event123',
          summary: 'Meeting with Docs',
          attachments: [
            {
              fileUrl: 'https://drive.google.com/open?id=file123',
              title: 'Agenda',
            },
          ],
        };

        mockCalendarAPI.events.insert.mockResolvedValue({
          data: mockCreatedEvent,
        });

        const result = await calendarService.createEvent({
          calendarId: 'primary',
          summary: 'Meeting with Docs',
          start: { dateTime: '2024-01-15T10:00:00-07:00' },
          end: { dateTime: '2024-01-15T11:00:00-07:00' },
          attachments: [
            {
              fileUrl: 'https://drive.google.com/open?id=file123',
              title: 'Agenda',
              mimeType: 'application/vnd.google-apps.document',
            },
          ],
        });

        expect(mockCalendarAPI.events.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            supportsAttachments: true,
            requestBody: expect.objectContaining({
              attachments: [
                {
                  fileUrl: 'https://drive.google.com/open?id=file123',
                  title: 'Agenda',
                  mimeType: 'application/vnd.google-apps.document',
                },
              ],
            }),
          }),
        );

        expect(JSON.parse(result.content[0].text)).toEqual(mockCreatedEvent);
      });

      it('should create an event with both Google Meet and attachments', async () => {
        const mockCreatedEvent = { id: 'event123' };
        mockCalendarAPI.events.insert.mockResolvedValue({
          data: mockCreatedEvent,
        });

        await calendarService.createEvent({
          calendarId: 'primary',
          summary: 'Full Featured Meeting',
          start: { dateTime: '2024-01-15T10:00:00-07:00' },
          end: { dateTime: '2024-01-15T11:00:00-07:00' },
          addGoogleMeet: true,
          attachments: [
            { fileUrl: 'https://drive.google.com/open?id=file123' },
          ],
        });

        const callArgs = mockCalendarAPI.events.insert.mock.calls[0][0];
        expect(callArgs.conferenceDataVersion).toBe(1);
        expect(callArgs.supportsAttachments).toBe(true);
        expect(callArgs.requestBody.conferenceData).toBeDefined();
        expect(callArgs.requestBody.attachments).toBeDefined();
      });
    });

    describe('updateEvent with Google Meet', () => {
      it('should add Google Meet to an existing event', async () => {
        const updatedEvent = {
          id: 'event123',
          conferenceData: {
            conferenceId: 'meet-id',
            entryPoints: [{ uri: 'https://meet.google.com/abc-defg-hij' }],
          },
        };

        mockCalendarAPI.events.patch.mockResolvedValue({ data: updatedEvent });

        const result = await calendarService.updateEvent({
          eventId: 'event123',
          addGoogleMeet: true,
        });

        const callArgs = mockCalendarAPI.events.patch.mock.calls[0][0];
        expect(callArgs.conferenceDataVersion).toBe(1);
        expect(callArgs.requestBody.conferenceData).toBeDefined();
        expect(
          callArgs.requestBody.conferenceData.createRequest
            .conferenceSolutionKey.type,
        ).toBe('hangoutsMeet');

        expect(JSON.parse(result.content[0].text)).toEqual(updatedEvent);
      });

      it('should not include conferenceData when addGoogleMeet is false', async () => {
        const updatedEvent = { id: 'event123', summary: 'No Meet' };
        mockCalendarAPI.events.patch.mockResolvedValue({ data: updatedEvent });

        await calendarService.updateEvent({
          eventId: 'event123',
          summary: 'No Meet',
          addGoogleMeet: false,
        });

        const callArgs = mockCalendarAPI.events.patch.mock.calls[0][0];
        expect(callArgs.conferenceDataVersion).toBeUndefined();
        expect(callArgs.requestBody.conferenceData).toBeUndefined();
      });
    });

    describe('updateEvent with attachments', () => {
      it('should add attachments to an existing event', async () => {
        const updatedEvent = {
          id: 'event123',
          attachments: [
            {
              fileUrl: 'https://drive.google.com/open?id=file123',
              title: 'Notes',
            },
          ],
        };

        mockCalendarAPI.events.patch.mockResolvedValue({ data: updatedEvent });

        const result = await calendarService.updateEvent({
          eventId: 'event123',
          attachments: [
            {
              fileUrl: 'https://drive.google.com/open?id=file123',
              title: 'Notes',
            },
          ],
        });

        const callArgs = mockCalendarAPI.events.patch.mock.calls[0][0];
        expect(callArgs.supportsAttachments).toBe(true);
        expect(callArgs.requestBody.attachments).toEqual([
          expect.objectContaining({
            fileUrl: 'https://drive.google.com/open?id=file123',
            title: 'Notes',
          }),
        ]);

        expect(JSON.parse(result.content[0].text)).toEqual(updatedEvent);
      });

      it('should clear attachments when passed an empty array', async () => {
        mockCalendarAPI.events.patch.mockResolvedValue({
          data: { id: 'event123', attachments: [] },
        });

        await calendarService.updateEvent({
          eventId: 'event123',
          attachments: [],
        });

        expect(mockCalendarAPI.events.patch).toHaveBeenCalledWith({
          calendarId: 'primary',
          eventId: 'event123',
          supportsAttachments: true,
          requestBody: {
            attachments: [],
          },
        });
      });
    });
  });

  describe('updateEvent start/end validation', () => {
    it('should reject start with both dateTime and date', async () => {
      const result = await calendarService.updateEvent({
        eventId: 'event1',
        start: { dateTime: '2024-01-15T10:00:00Z', date: '2024-01-15' },
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.error).toBe('Invalid input format');
    });

    it('should reject end with both dateTime and date', async () => {
      const result = await calendarService.updateEvent({
        eventId: 'event1',
        end: { dateTime: '2024-01-15T12:00:00Z', date: '2024-01-15' },
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.error).toBe('Invalid input format');
    });

    it('should reject start with neither dateTime nor date', async () => {
      const result = await calendarService.updateEvent({
        eventId: 'event1',
        start: {},
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.error).toBe('Invalid input format');
    });
  });

  describe('listEvents with eventTypes', () => {
    beforeEach(async () => {
      mockCalendarAPI.calendarList.list.mockResolvedValue({
        data: {
          items: [{ id: 'primary-calendar-id', primary: true }],
        },
      });
    });

    it('should pass eventTypes to the API when provided', async () => {
      mockCalendarAPI.events.list.mockResolvedValue({
        data: { items: [] },
      });

      await calendarService.listEvents({
        calendarId: 'primary',
        eventTypes: ['focusTime', 'outOfOffice'],
      });

      expect(mockCalendarAPI.events.list).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'primary',
          eventTypes: ['focusTime', 'outOfOffice'],
        }),
      );
    });

    it('should not pass eventTypes when not provided', async () => {
      mockCalendarAPI.events.list.mockResolvedValue({
        data: { items: [] },
      });

      await calendarService.listEvents({
        calendarId: 'primary',
      });

      const callArgs = mockCalendarAPI.events.list.mock.calls[0][0];
      expect(callArgs.eventTypes).toBeUndefined();
    });

    it('should include eventType and status properties in fields', async () => {
      mockCalendarAPI.events.list.mockResolvedValue({
        data: { items: [] },
      });

      await calendarService.listEvents({
        calendarId: 'primary',
      });

      const callArgs = mockCalendarAPI.events.list.mock.calls[0][0];
      expect(callArgs.fields).toContain('eventType');
      expect(callArgs.fields).toContain('focusTimeProperties');
      expect(callArgs.fields).toContain('outOfOfficeProperties');
      expect(callArgs.fields).toContain('workingLocationProperties');
    });

    it('should return focus time events when filtered', async () => {
      const mockEvents = [
        {
          id: 'focus1',
          summary: 'Focus Time',
          status: 'confirmed',
          eventType: 'focusTime',
          focusTimeProperties: {
            chatStatus: 'doNotDisturb',
            autoDeclineMode: 'declineOnlyNewConflictingInvitations',
          },
        },
      ];

      mockCalendarAPI.events.list.mockResolvedValue({
        data: { items: mockEvents },
      });

      const result = await calendarService.listEvents({
        calendarId: 'primary',
        eventTypes: ['focusTime'],
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult).toHaveLength(1);
      expect(parsedResult[0].eventType).toBe('focusTime');
    });
  });

  describe('createEvent with eventType', () => {
    beforeEach(async () => {
      mockCalendarAPI.calendarList.list.mockResolvedValue({
        data: {
          items: [{ id: 'primary-calendar-id', primary: true }],
        },
      });
    });

    it('should create a focus time event with defaults', async () => {
      const mockCreatedEvent = {
        id: 'focus123',
        summary: 'Focus Time',
        eventType: 'focusTime',
        focusTimeProperties: {
          chatStatus: 'doNotDisturb',
          autoDeclineMode: 'declineOnlyNewConflictingInvitations',
        },
      };

      mockCalendarAPI.events.insert.mockResolvedValue({
        data: mockCreatedEvent,
      });

      const result = await calendarService.createEvent({
        start: { dateTime: '2024-01-15T10:00:00Z' },
        end: { dateTime: '2024-01-15T12:00:00Z' },
        eventType: 'focusTime',
      });

      const insertArgs = mockCalendarAPI.events.insert.mock.calls[0][0];

      expect(mockCalendarAPI.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'primary-calendar-id',
          requestBody: expect.objectContaining({
            summary: 'Focus Time',
            start: { dateTime: '2024-01-15T10:00:00Z' },
            end: { dateTime: '2024-01-15T12:00:00Z' },
            eventType: 'focusTime',
            transparency: 'opaque',
          }),
        }),
      );
      expect(insertArgs.requestBody?.focusTimeProperties).toEqual({
        chatStatus: 'doNotDisturb',
        autoDeclineMode: 'declineOnlyNewConflictingInvitations',
      });

      expect(JSON.parse(result.content[0].text)).toEqual(mockCreatedEvent);
    });

    it('should create a focus time event with custom properties', async () => {
      const mockCreatedEvent = {
        id: 'focus123',
        summary: 'Deep Work',
        eventType: 'focusTime',
      };

      mockCalendarAPI.events.insert.mockResolvedValue({
        data: mockCreatedEvent,
      });

      const result = await calendarService.createEvent({
        calendarId: 'work-calendar',
        summary: 'Deep Work',
        start: { dateTime: '2024-01-15T10:00:00Z' },
        end: { dateTime: '2024-01-15T12:00:00Z' },
        eventType: 'focusTime',
        focusTimeProperties: {
          chatStatus: 'available',
          autoDeclineMode: 'declineAllConflictingInvitations',
          declineMessage: 'In focus mode, will respond later',
        },
      });

      expect(mockCalendarAPI.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'work-calendar',
          requestBody: expect.objectContaining({
            summary: 'Deep Work',
            start: { dateTime: '2024-01-15T10:00:00Z' },
            end: { dateTime: '2024-01-15T12:00:00Z' },
            eventType: 'focusTime',
            transparency: 'opaque',
            focusTimeProperties: {
              chatStatus: 'available',
              autoDeclineMode: 'declineAllConflictingInvitations',
              declineMessage: 'In focus mode, will respond later',
            },
          }),
        }),
      );

      expect(JSON.parse(result.content[0].text)).toEqual(mockCreatedEvent);
    });

    it('should create an out-of-office event with defaults', async () => {
      const mockCreatedEvent = {
        id: 'ooo123',
        summary: 'Out of Office',
        eventType: 'outOfOffice',
        outOfOfficeProperties: {
          autoDeclineMode: 'declineOnlyNewConflictingInvitations',
        },
      };

      mockCalendarAPI.events.insert.mockResolvedValue({
        data: mockCreatedEvent,
      });

      const result = await calendarService.createEvent({
        start: { dateTime: '2024-01-15T00:00:00Z' },
        end: { dateTime: '2024-01-19T00:00:00Z' },
        eventType: 'outOfOffice',
      });

      const insertArgs = mockCalendarAPI.events.insert.mock.calls[0][0];

      expect(mockCalendarAPI.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'primary-calendar-id',
          requestBody: expect.objectContaining({
            summary: 'Out of Office',
            start: { dateTime: '2024-01-15T00:00:00Z' },
            end: { dateTime: '2024-01-19T00:00:00Z' },
            eventType: 'outOfOffice',
            transparency: 'opaque',
          }),
        }),
      );
      expect(insertArgs.requestBody?.outOfOfficeProperties).toEqual({
        autoDeclineMode: 'declineOnlyNewConflictingInvitations',
      });

      expect(JSON.parse(result.content[0].text)).toEqual(mockCreatedEvent);
    });

    it('should create an out-of-office event with custom properties', async () => {
      const mockCreatedEvent = {
        id: 'ooo123',
        summary: 'Vacation',
        eventType: 'outOfOffice',
      };

      mockCalendarAPI.events.insert.mockResolvedValue({
        data: mockCreatedEvent,
      });

      const result = await calendarService.createEvent({
        calendarId: 'work-calendar',
        summary: 'Vacation',
        start: { dateTime: '2024-01-15T00:00:00Z' },
        end: { dateTime: '2024-01-19T00:00:00Z' },
        eventType: 'outOfOffice',
        outOfOfficeProperties: {
          autoDeclineMode: 'declineAllConflictingInvitations',
          declineMessage: 'I am on vacation until Jan 19',
        },
      });

      expect(mockCalendarAPI.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'work-calendar',
          requestBody: expect.objectContaining({
            summary: 'Vacation',
            start: { dateTime: '2024-01-15T00:00:00Z' },
            end: { dateTime: '2024-01-19T00:00:00Z' },
            eventType: 'outOfOffice',
            transparency: 'opaque',
            outOfOfficeProperties: {
              autoDeclineMode: 'declineAllConflictingInvitations',
              declineMessage: 'I am on vacation until Jan 19',
            },
          }),
        }),
      );

      expect(JSON.parse(result.content[0].text)).toEqual(mockCreatedEvent);
    });

    it('should create a home office working location event', async () => {
      const mockCreatedEvent = {
        id: 'wl123',
        summary: 'Working Location',
        eventType: 'workingLocation',
        workingLocationProperties: { type: 'homeOffice', homeOffice: {} },
      };

      mockCalendarAPI.events.insert.mockResolvedValue({
        data: mockCreatedEvent,
      });

      const result = await calendarService.createEvent({
        start: { date: '2024-01-15' },
        end: { date: '2024-01-16' },
        eventType: 'workingLocation',
        workingLocationProperties: { type: 'homeOffice' },
      });

      expect(mockCalendarAPI.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'primary-calendar-id',
          requestBody: expect.objectContaining({
            summary: 'Working Location',
            start: { date: '2024-01-15' },
            end: { date: '2024-01-16' },
            eventType: 'workingLocation',
            visibility: 'public',
            transparency: 'transparent',
            workingLocationProperties: {
              type: 'homeOffice',
              homeOffice: {},
            },
          }),
        }),
      );

      expect(JSON.parse(result.content[0].text)).toEqual(mockCreatedEvent);
    });

    it('should create an office location working location event', async () => {
      const mockCreatedEvent = {
        id: 'wl123',
        summary: 'Working from NYC Office',
        eventType: 'workingLocation',
      };

      mockCalendarAPI.events.insert.mockResolvedValue({
        data: mockCreatedEvent,
      });

      const result = await calendarService.createEvent({
        calendarId: 'work-calendar',
        summary: 'Working from NYC Office',
        start: { date: '2024-01-15' },
        end: { date: '2024-01-16' },
        eventType: 'workingLocation',
        workingLocationProperties: {
          type: 'officeLocation',
          officeLocation: {
            buildingId: 'NYC-1',
            label: 'New York Office',
          },
        },
      });

      expect(mockCalendarAPI.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'work-calendar',
          requestBody: expect.objectContaining({
            summary: 'Working from NYC Office',
            start: { date: '2024-01-15' },
            end: { date: '2024-01-16' },
            eventType: 'workingLocation',
            visibility: 'public',
            transparency: 'transparent',
            workingLocationProperties: {
              type: 'officeLocation',
              officeLocation: {
                buildingId: 'NYC-1',
                label: 'New York Office',
              },
            },
          }),
        }),
      );

      expect(JSON.parse(result.content[0].text)).toEqual(mockCreatedEvent);
    });

    it('should create a custom location working location event', async () => {
      const mockCreatedEvent = {
        id: 'wl123',
        summary: 'Working from Coffee Shop',
        eventType: 'workingLocation',
      };

      mockCalendarAPI.events.insert.mockResolvedValue({
        data: mockCreatedEvent,
      });

      const result = await calendarService.createEvent({
        summary: 'Working from Coffee Shop',
        start: { dateTime: '2024-01-15T09:00:00Z' },
        end: { dateTime: '2024-01-15T17:00:00Z' },
        eventType: 'workingLocation',
        workingLocationProperties: {
          type: 'customLocation',
          customLocation: { label: 'Downtown Coffee' },
        },
      });

      expect(mockCalendarAPI.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'primary-calendar-id',
          requestBody: expect.objectContaining({
            summary: 'Working from Coffee Shop',
            start: { dateTime: '2024-01-15T09:00:00Z' },
            end: { dateTime: '2024-01-15T17:00:00Z' },
            eventType: 'workingLocation',
            visibility: 'public',
            transparency: 'transparent',
            workingLocationProperties: {
              type: 'customLocation',
              customLocation: { label: 'Downtown Coffee' },
            },
          }),
        }),
      );

      expect(JSON.parse(result.content[0].text)).toEqual(mockCreatedEvent);
    });

    it('should reject invalid datetime formats for event types', async () => {
      const result = await calendarService.createEvent({
        start: { dateTime: 'not-a-date' },
        end: { dateTime: '2024-01-15T12:00:00Z' },
        eventType: 'focusTime',
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.error).toBe('Invalid input format');
    });

    it('should not validate datetime for all-day events', async () => {
      const mockCreatedEvent = {
        id: 'wl123',
        eventType: 'workingLocation',
      };

      mockCalendarAPI.events.insert.mockResolvedValue({
        data: mockCreatedEvent,
      });

      const result = await calendarService.createEvent({
        start: { date: '2024-01-15' },
        end: { date: '2024-01-16' },
        eventType: 'workingLocation',
        workingLocationProperties: { type: 'homeOffice' },
      });

      // Should succeed — no datetime validation for date-only events
      expect(JSON.parse(result.content[0].text)).toEqual(mockCreatedEvent);
    });

    it('should create an all-day event with date fields', async () => {
      const mockCreatedEvent = {
        id: 'allday123',
        summary: 'Team Offsite',
        start: { date: '2024-01-15' },
        end: { date: '2024-01-17' },
      };

      mockCalendarAPI.events.insert.mockResolvedValue({
        data: mockCreatedEvent,
      });

      const result = await calendarService.createEvent({
        summary: 'Team Offsite',
        start: { date: '2024-01-15' },
        end: { date: '2024-01-17' },
      });

      expect(mockCalendarAPI.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'primary-calendar-id',
          requestBody: expect.objectContaining({
            summary: 'Team Offsite',
            start: { date: '2024-01-15' },
            end: { date: '2024-01-17' },
          }),
        }),
      );

      expect(JSON.parse(result.content[0].text)).toEqual(mockCreatedEvent);
    });

    it('should handle API errors gracefully for event types', async () => {
      const apiError = new Error('Calendar API failed');
      mockCalendarAPI.events.insert.mockRejectedValue(apiError);

      const result = await calendarService.createEvent({
        start: { dateTime: '2024-01-15T10:00:00Z' },
        end: { dateTime: '2024-01-15T12:00:00Z' },
        eventType: 'focusTime',
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'Calendar API failed',
      });
    });

    it('should reject empty start/end objects', async () => {
      const result = await calendarService.createEvent({
        summary: 'Bad Event',
        start: {},
        end: {},
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.error).toBe('Invalid input format');
    });

    it('should reject focusTime as all-day event', async () => {
      const result = await calendarService.createEvent({
        start: { date: '2024-01-15' },
        end: { date: '2024-01-16' },
        eventType: 'focusTime',
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.error).toBe('Invalid input format');
    });

    it('should reject outOfOffice as all-day event', async () => {
      const result = await calendarService.createEvent({
        start: { date: '2024-01-15' },
        end: { date: '2024-01-16' },
        eventType: 'outOfOffice',
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.error).toBe('Invalid input format');
    });

    it('should reject workingLocation without workingLocationProperties', async () => {
      const result = await calendarService.createEvent({
        start: { date: '2024-01-15' },
        end: { date: '2024-01-16' },
        eventType: 'workingLocation',
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.error).toBe('Invalid input format');
    });

    it('should reject all-day workingLocation events that span multiple days', async () => {
      const result = await calendarService.createEvent({
        start: { date: '2024-01-15' },
        end: { date: '2024-01-17' },
        eventType: 'workingLocation',
        workingLocationProperties: { type: 'homeOffice' },
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.error).toBe('Invalid input format');
      expect(parsedResult.details).toContain(
        'all-day workingLocation events must span exactly one day',
      );
    });

    it('should reject start with both dateTime and date', async () => {
      const result = await calendarService.createEvent({
        summary: 'Ambiguous Event',
        start: { dateTime: '2024-01-15T10:00:00Z', date: '2024-01-15' },
        end: { dateTime: '2024-01-15T12:00:00Z' },
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.error).toBe('Invalid input format');
    });

    it('should reject end with both dateTime and date', async () => {
      const result = await calendarService.createEvent({
        summary: 'Ambiguous Event',
        start: { dateTime: '2024-01-15T10:00:00Z' },
        end: { dateTime: '2024-01-15T12:00:00Z', date: '2024-01-15' },
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.error).toBe('Invalid input format');
    });

    it('should require summary for regular events', async () => {
      const result = await calendarService.createEvent({
        start: { dateTime: '2024-01-15T10:00:00Z' },
        end: { dateTime: '2024-01-15T12:00:00Z' },
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.error).toBe('Invalid input format');
    });

    it('should require summary for explicit default eventType', async () => {
      const result = await calendarService.createEvent({
        start: { dateTime: '2024-01-15T10:00:00Z' },
        end: { dateTime: '2024-01-15T12:00:00Z' },
        eventType: 'default',
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.error).toBe('Invalid input format');
    });

    it('should reject officeLocation type without officeLocation details', async () => {
      const result = await calendarService.createEvent({
        start: { date: '2024-01-15' },
        end: { date: '2024-01-16' },
        eventType: 'workingLocation',
        workingLocationProperties: { type: 'officeLocation' },
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.error).toBe('Invalid input format');
    });

    it('should reject customLocation type without customLocation details', async () => {
      const result = await calendarService.createEvent({
        start: { date: '2024-01-15' },
        end: { date: '2024-01-16' },
        eventType: 'workingLocation',
        workingLocationProperties: { type: 'customLocation' },
      });

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.error).toBe('Invalid input format');
    });
  });
});
