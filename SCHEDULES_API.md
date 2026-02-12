# Schedules & Timetables API - Frontend Integration Guide

Complete API reference for implementing schedule/timetable features in the frontend.

## Table of Contents
1. [Overview](#overview)
2. [Section Registration](#section-registration)
3. [Schedule Management](#schedule-management)
4. [Schedule Items](#schedule-items)
5. [Auto-Populate Features](#auto-populate-features)
6. [Common Use Cases](#common-use-cases)
7. [Error Handling](#error-handling)

---

## Overview

The schedules system allows users to:
- Register for course sections (lectures, labs, tutorials)
- Create and manage multiple schedules
- Add various types of schedule items (classes, assignments, evaluations, events, custom)
- Auto-populate schedules from registered sections, assignments, evaluations, and events
- View formatted weekly timetables

**Base URL:** `/api`

---

## Section Registration

### 1. Get Available Sections for Course
```http
GET /sections/:courseId/available
```

Returns all sections for a course with user's registration status.

**Response** (200):
```json
{
  "success": true,
  "data": {
    "sections": [
      {
        "id": "section-uuid",
        "courseId": "course-uuid",
        "sectionType": "Lecture",
        "sectionNumber": 1,
        "instructors": ["Dr. John Doe"],
        "roomNumber": "C201",
        "maxCapacity": 60,
        "schedule": [
          {
            "id": "schedule-uuid",
            "dayOfWeek": "Monday",
            "startTime": "09:00",
            "endTime": "10:00"
          }
        ],
        "isRegistered": false
      }
    ]
  }
}
```

---

### 2. Register for Section
```http
POST /sections/register
```

**Request Body:**
```json
{
  "sectionId": "section-uuid"
}
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Successfully registered for section",
    "registration": {
      "id": "registration-uuid",
      "userId": "user-uuid",
      "sectionId": "section-uuid",
      "registeredAt": "2026-02-08T10:00:00.000Z"
    },
    "note": "If you were registered for another section of the same type, you have been switched to this one"
  }
}
```

**Important:**
- You can only register for ONE section per type (lecture/lab/tutorial) per course
- Registering for a new section of the same type automatically unregisters from the old one

---

### 3. Unregister from Section
```http
DELETE /sections/register/:sectionId
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Successfully unregistered from section"
  }
}
```

---

### 4. Get User's Registrations
```http
GET /sections/registrations
```

Returns all sections user is registered for with full details.

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "registrationId": "registration-uuid",
      "sectionId": "section-uuid",
      "courseId": "course-uuid",
      "courseCode": "CS F111",
      "courseName": "Computer Programming",
      "sectionType": "Lecture",
      "sectionNumber": 1,
      "instructors": ["Dr. John Doe"],
      "roomNumber": "C201",
      "schedule": [
        {
          "id": "schedule-uuid",
          "dayOfWeek": "Monday",
          "startTime": "09:00",
          "endTime": "10:00"
        }
      ]
    }
  ]
}
```

---

### 5. Get User's Class Schedule
```http
GET /sections/schedule/me
```

Returns user's complete timetable from registered sections.

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "courseCode": "CS F111",
      "courseName": "Computer Programming",
      "sectionType": "Lecture",
      "sectionNumber": 1,
      "instructors": ["Dr. John Doe"],
      "roomNumber": "C201",
      "schedule": [
        {
          "dayOfWeek": "Monday",
          "startTime": "09:00",
          "endTime": "10:00"
        }
      ]
    }
  ]
}
```

---

### 6. Get Formatted Schedule
```http
GET /sections/schedule/formatted
```

Returns schedule organized by day of week.

**Response** (200):
```json
{
  "success": true,
  "data": {
    "schedule": {
      "Monday": [
        {
          "courseCode": "CS F111",
          "courseName": "Computer Programming",
          "sectionType": "Lecture",
          "sectionNumber": 1,
          "instructors": ["Dr. John Doe"],
          "roomNumber": "C201",
          "startTime": "09:00",
          "endTime": "10:00"
        }
      ],
      "Tuesday": [],
      "Wednesday": [],
      "Thursday": [],
      "Friday": [],
      "Saturday": [],
      "Sunday": []
    }
  }
}
```

---

## Schedule Management

### 1. Get All User Schedules
```http
GET /student-profile/schedules
```

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "schedule-uuid",
      "userId": "user-uuid",
      "name": "Spring 2026 Schedule",
      "description": "My main academic schedule",
      "isActive": true,
      "semester": "spring",
      "year": "2026",
      "createdAt": "2026-02-01T10:00:00.000Z",
      "updatedAt": "2026-02-08T10:00:00.000Z"
    }
  ]
}
```

---

### 2. Get Schedule by ID
```http
GET /student-profile/schedules/:id
```

Returns schedule with all items.

**Response** (200):
```json
{
  "success": true,
  "data": {
    "schedule": {
      "id": "schedule-uuid",
      "name": "Spring 2026 Schedule",
      "isActive": true,
      "semester": "spring",
      "year": "2026"
    },
    "items": [
      {
        "id": "item-uuid",
        "type": "class",
        "title": "CS F111 Lecture",
        "dayOfWeek": "Monday",
        "startTime": "09:00",
        "endTime": "10:00",
        "location": "C201",
        "isRecurring": true,
        "recurrencePattern": "weekly",
        "linkedEntityType": "section",
        "linkedEntityId": "section-uuid"
      }
    ]
  }
}
```

---

### 3. Create Schedule
```http
POST /student-profile/schedules
```

**Request Body:**
```json
{
  "name": "Spring 2026 Schedule",
  "description": "My main academic schedule",
  "semester": "spring",
  "year": "2026",
  "isActive": true
}
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "id": "schedule-uuid",
    "name": "Spring 2026 Schedule",
    "isActive": true,
    "semester": "spring",
    "year": "2026",
    "createdAt": "2026-02-08T10:00:00.000Z"
  }
}
```

---

### 4. Update Schedule
```http
PUT /student-profile/schedules/:id
```

**Request Body:** Same as Create (all fields optional)

---

### 5. Delete Schedule
```http
DELETE /student-profile/schedules/:id
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Schedule deleted successfully"
  }
}
```

---

### 6. Set Active Schedule
```http
POST /student-profile/schedules/:id/set-active
```

Makes this schedule the active one (sets all others to inactive).

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Schedule set as active"
  }
}
```

---

## Schedule Items

### 1. Add Schedule Item
```http
POST /student-profile/schedule-items
```

**Request Body:**
```json
{
  "scheduleId": "schedule-uuid",
  "type": "class",
  "title": "CS F111 Lecture",
  "description": "Computer Programming lecture",
  "dayOfWeek": "Monday",
  "startTime": "09:00",
  "endTime": "10:00",
  "startDate": "2026-02-10",
  "endDate": "2026-05-10",
  "location": "C201",
  "isRecurring": true,
  "recurrencePattern": "weekly",
  "linkedEntityType": "section",
  "linkedEntityId": "section-uuid",
  "color": "#3B82F6",
  "notes": "Bring laptop"
}
```

**Item Types:** class, assignment, evaluation, event, custom

**Recurrence Patterns:** none, daily, weekly, biweekly, monthly

**Linked Entity Types:** section, assignment, evaluation, event, null

**Response** (200):
```json
{
  "success": true,
  "data": {
    "id": "item-uuid",
    "scheduleId": "schedule-uuid",
    "type": "class",
    "title": "CS F111 Lecture",
    "dayOfWeek": "Monday",
    "startTime": "09:00",
    "endTime": "10:00",
    "isRecurring": true,
    "recurrencePattern": "weekly",
    "createdAt": "2026-02-08T10:00:00.000Z"
  }
}
```

---

### 2. Update Schedule Item
```http
PUT /student-profile/schedule-items/:id
```

**Request Body:** Same as Add (all fields optional)

---

### 3. Delete Schedule Item
```http
DELETE /student-profile/schedule-items/:id
```

---

### 4. Get Schedule Items by Day
```http
GET /student-profile/schedules/:scheduleId/items/by-day?day=Monday
```

**Query Parameters:**
- `day` (required): Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "item-uuid",
      "type": "class",
      "title": "CS F111 Lecture",
      "startTime": "09:00",
      "endTime": "10:00",
      "location": "C201"
    }
  ]
}
```

---

### 5. Get Schedule Items by Date Range
```http
GET /student-profile/schedules/:scheduleId/items/by-date?start=2026-02-10&end=2026-02-17
```

**Query Parameters:**
- `start` (required): Start date (YYYY-MM-DD)
- `end` (required): End date (YYYY-MM-DD)

Returns all items falling within the date range, accounting for recurring items.

---

## Auto-Populate Features

### 1. Generate from Sections
```http
POST /student-profile/schedules/:scheduleId/generate-from-sections
```

Automatically creates schedule items from user's registered course sections.

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Schedule populated from sections",
    "itemsCreated": 15
  }
}
```

---

### 2. Add Assignments to Schedule
```http
POST /student-profile/schedules/:scheduleId/add-assignments
```

Adds all pending assignments as schedule items.

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Assignments added to schedule",
    "itemsCreated": 5
  }
}
```

---

### 3. Add Evaluations to Schedule
```http
POST /student-profile/schedules/:scheduleId/add-evaluations
```

Adds all upcoming evaluations (exams, quizzes) as schedule items.

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Evaluations added to schedule",
    "itemsCreated": 3
  }
}
```

---

### 4. Add Events to Schedule
```http
POST /student-profile/schedules/:scheduleId/add-events
```

Adds campus events user is interested in or enrolled for.

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Events added to schedule",
    "itemsCreated": 7
  }
}
```

---

## Common Use Cases

### Use Case 1: Section Registration Flow
```javascript
// 1. Get available sections for a course
const sectionsRes = await fetch('/api/sections/{courseId}/available');
const { data: { sections } } = await sectionsRes.json();

// 2. Register for a section
await fetch('/api/sections/register', {
  method: 'POST',
  body: JSON.stringify({ sectionId: sections[0].id })
});

// 3. Get updated registrations
const registrationsRes = await fetch('/api/sections/registrations');
const { data: registrations } = await registrationsRes.json();
```

---

### Use Case 2: Creating and Populating a Schedule
```javascript
// 1. Create a new schedule
const createRes = await fetch('/api/student-profile/schedules', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Spring 2026 Schedule',
    semester: 'spring',
    year: '2026',
    isActive: true
  })
});
const { data: schedule } = await createRes.json();

// 2. Auto-populate from sections
await fetch(`/api/student-profile/schedules/${schedule.id}/generate-from-sections`, {
  method: 'POST'
});

// 3. Add assignments
await fetch(`/api/student-profile/schedules/${schedule.id}/add-assignments`, {
  method: 'POST'
});

// 4. Add evaluations
await fetch(`/api/student-profile/schedules/${schedule.id}/add-evaluations`, {
  method: 'POST'
});

// 5. Get complete schedule
const scheduleRes = await fetch(`/api/student-profile/schedules/${schedule.id}`);
const { data: { schedule: fullSchedule, items } } = await scheduleRes.json();
```

---

### Use Case 3: Weekly Timetable View
```javascript
// Get formatted schedule grouped by day
const res = await fetch('/api/sections/schedule/formatted');
const { data: { schedule } } = await res.json();

// schedule.Monday = [...classes on Monday]
// schedule.Tuesday = [...classes on Tuesday]
// etc.

// Render in a weekly calendar view
Object.keys(schedule).forEach(day => {
  const classes = schedule[day];
  // Sort by start time
  classes.sort((a, b) => a.startTime.localeCompare(b.startTime));
  // Render classes for this day
});
```

---

### Use Case 4: Adding Custom Events
```javascript
// Add a custom study session
await fetch('/api/student-profile/schedule-items', {
  method: 'POST',
  body: JSON.stringify({
    scheduleId: 'schedule-uuid',
    type: 'custom',
    title: 'Study Group - Linear Algebra',
    dayOfWeek: 'Wednesday',
    startTime: '18:00',
    endTime: '20:00',
    location: 'Library Room 3',
    isRecurring: true,
    recurrencePattern: 'weekly',
    startDate: '2026-02-10',
    endDate: '2026-05-10',
    color: '#10B981',
    notes: 'Bring practice problems'
  })
});
```

---

## Error Handling

### Common Error Responses

**400 Bad Request:**
```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "sectionId",
      "message": "Invalid UUID"
    }
  ]
}
```

**404 Not Found:**
```json
{
  "success": false,
  "message": "Schedule not found",
  "code": "NOT_FOUND"
}
```

**500 Internal Server Error:**
```json
{
  "success": false,
  "message": "Failed to create schedule",
  "code": "INTERNAL_ERROR"
}
```

---

## Implementation Tips

### 1. Section Registration UI
- Show sections grouped by type (Lectures, Labs, Tutorials)
- Highlight currently registered section
- Show conflict warnings if new section overlaps with existing schedule
- Use radio buttons per section type (only one can be selected)

### 2. Schedule Calendar View
- Use a weekly grid layout (7 columns for days)
- Color-code by item type (classes, assignments, evaluations, events, custom)
- Show recurring items with a repeat icon
- Allow drag-and-drop for custom items
- Implement zoom levels (week view, month view)

### 3. Auto-Populate Features
- Show buttons: "Generate from Sections", "Add Assignments", "Add Evaluations", "Add Events"
- Display count of items that will be added
- Confirm before adding (avoid duplicates)
- Show success toast with count after adding

### 4. Performance Optimization
- Cache formatted schedule for quick access
- Lazy load schedule items by date range
- Debounce schedule item updates
- Use optimistic UI updates for better UX

---

## Data Models Reference

### Schedule
```typescript
interface Schedule {
  id: string;
  userId: string;
  name: string;
  description?: string;
  isActive: boolean;
  semester?: 'fall' | 'spring' | 'summer';
  year?: string;
  createdAt: string;
  updatedAt: string;
}
```

### Schedule Item
```typescript
interface ScheduleItem {
  id: string;
  scheduleId: string;
  type: 'class' | 'assignment' | 'evaluation' | 'event' | 'custom';
  title: string;
  description?: string;
  dayOfWeek?: string;
  startTime?: string; // HH:MM
  endTime?: string;   // HH:MM
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  location?: string;
  isRecurring: boolean;
  recurrencePattern?: 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';
  linkedEntityType?: 'section' | 'assignment' | 'evaluation' | 'event';
  linkedEntityId?: string;
  color?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
```

---

**Need Help?** Check the main API guide or contact the backend team.
