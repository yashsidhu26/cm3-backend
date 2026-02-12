# Backend Changes Summary

## Overview
Added comprehensive schedule/timetable management system with section registration and event tracking.

---

## 1. Schema Changes

### New Tables

#### `schedules`
- Users can create multiple schedules (current semester, future planning, etc.)
- Fields: id, userId, name, description, isActive, semester, year
- Only one schedule can be active at a time

#### `schedule_items`
- Individual calendar items in a schedule
- Types: class, assignment, evaluation, event, custom
- Supports recurring items (daily, weekly, biweekly, monthly)
- Can be linked to existing entities (sections, assignments, evaluations, events)
- Fields: id, scheduleId, userId, title, description, type, linkedEntityId, linkedEntityType, startDateTime, endDateTime, isRecurring, recurrencePattern, recurrenceEndDate, dayOfWeek, location, color

#### Updated `campus_events`
- Added `isInterested` (boolean)
- Added `isEnrolled` (boolean)
- Allows users to mark events they're interested in or enrolled for

### New Enums
- `schedule_item_type`: class, assignment, evaluation, event, custom
- `recurrence_pattern`: daily, weekly, biweekly, monthly, none

---

## 2. New API Endpoints

### Section Registration (20 endpoints total)

#### `/api/sections/register` (POST)
- Register user for a course section

#### `/api/sections/register/:sectionId` (DELETE)
- Unregister from a section

#### `/api/sections/registrations` (GET)
- Get all user's section registrations with full details

#### `/api/sections/:courseId/available` (GET)
- Get available sections for a course with registration status

### Schedules (GET, POST, PUT, DELETE)

#### `/api/student-profile/schedules` (GET)
- Get all user schedules

#### `/api/student-profile/schedules/:id` (GET)
- Get schedule with all items

#### `/api/student-profile/schedules` (POST)
- Create new schedule

#### `/api/student-profile/schedules/:id` (PUT)
- Update schedule

#### `/api/student-profile/schedules/:id` (DELETE)
- Delete schedule (cascades to items)

#### `/api/student-profile/schedules/:id/set-active` (POST)
- Set as active schedule

### Schedule Items (CRUD)

#### `/api/student-profile/schedules/:scheduleId/items` (GET)
- Get all items in a schedule

#### `/api/student-profile/schedule-items` (POST)
- Create schedule item

#### `/api/student-profile/schedule-items/:id` (PUT)
- Update schedule item

#### `/api/student-profile/schedule-items/:id` (DELETE)
- Delete schedule item

### Helper Endpoints (Auto-populate)

#### `/api/student-profile/schedules/:id/generate-from-sections` (POST)
- Auto-generate schedule items from registered sections
- Creates recurring weekly items for each class

#### `/api/student-profile/schedules/:id/add-assignments` (POST)
- Add all upcoming assignments to schedule

#### `/api/student-profile/schedules/:id/add-evaluations` (POST)
- Add all upcoming evaluations to schedule

#### `/api/student-profile/schedules/:id/add-events` (POST)
- Add enrolled/interested campus events to schedule

### Event Tracking

#### `/api/student-profile/events/:id/mark-interested` (PATCH)
- Mark event as interested

#### `/api/student-profile/events/:id/mark-enrolled` (PATCH)
- Mark event as enrolled

---

## 3. Service Methods Added

### `sections.service.ts`
- `registerUserForSection(userId, sectionId)` - Register for section
- `unregisterUserFromSection(userId, sectionId)` - Unregister from section
- `getUserRegistrations(userId)` - Get all registrations with details
- `getAvailableSections(courseId, userId)` - Get sections with registration status

---

## 4. Key Features

### Multiple Schedules
- Users can create multiple schedules (current semester, next semester, draft schedules)
- Only one can be active at a time
- Each schedule can have unlimited items

### Smart Schedule Building
1. Register for course sections
2. Create a schedule
3. Auto-generate from sections (creates recurring class items)
4. Auto-add assignments (one-time items at due dates)
5. Auto-add evaluations (one-time items at exam dates)
6. Auto-add events (enrolled/interested events)
7. Add custom items (study sessions, meetings, etc.)

### Recurring Events
- Supports daily, weekly, biweekly, monthly recurrence
- Set recurrence end date
- Specify day of week for weekly/biweekly

### Linked Entities
- Schedule items can link to:
  - Sections (classes)
  - Assignments (submissions)
  - Evaluations (exams/quizzes)
  - Campus Events (competitions, workshops, etc.)
- When linked entity changes, can update schedule item

### Color Coding
- Each item can have a custom color (hex code)
- Default colors by type:
  - Class: #4ECDC4 (Teal)
  - Assignment: #FF6B6B (Red)
  - Evaluation: #45B7D1 (Blue)
  - Event: #FFEAA7 (Yellow)
  - Custom: #96CEB4 (Green)

---

## 5. Database Migration Required

```bash
bun run db:generate
bun run db:migrate
```

**Creates**:
- `schedules` table
- `schedule_items` table
- `schedule_item_type` enum
- `recurrence_pattern` enum
- Adds `isInterested`, `isEnrolled` columns to `campus_events`

---

## 6. Use Cases

### Use Case 1: Student builds their timetable
1. Student registers for course sections (Lecture 1, Tutorial 2, Lab 1)
2. Creates "Spring 2026" schedule
3. Clicks "Generate from Sections" - all classes automatically added
4. Clicks "Add Assignments" - upcoming assignments added
5. Clicks "Add Evaluations" - exams/quizzes added
6. Marks some campus events as "interested"
7. Clicks "Add Events" - those events added to schedule
8. Views complete weekly timetable

### Use Case 2: Student plans next semester
1. Creates "Fall 2026 Draft" schedule
2. Manually adds custom items for planned courses (before registration opens)
3. Adds study sessions, club meetings, personal commitments
4. When registration opens, registers for sections
5. Updates draft schedule with actual sections

### Use Case 3: Student manages multiple schedules
1. Has "Spring 2026" (active) - current semester
2. Has "Fall 2026 Plan" - planning next semester
3. Has "Exam Week" - special schedule for finals
4. Can switch active schedule anytime
5. Can copy items between schedules (manually)

---

## 7. Frontend Implementation Priority

### High Priority
1. Section Registration UI
   - View available sections for course
   - Register/unregister buttons
   - My registered sections page

2. Basic Schedule View
   - Create schedule
   - Weekly calendar view
   - Daily list view

3. Auto-populate Buttons
   - Generate from sections
   - Add assignments
   - Add evaluations
   - Add events

### Medium Priority
1. Schedule Item CRUD
   - Add custom items
   - Edit items
   - Delete items

2. Recurring Events
   - Set recurrence pattern
   - Set end date

3. Color Customization
   - Pick colors for items
   - Color-coded calendar

### Low Priority
1. Multiple Schedules Management
   - Switch active schedule
   - Compare schedules
   - Archive old schedules

2. Advanced Views
   - Monthly calendar
   - Agenda view
   - Timeline view

---

## 8. Sample Workflow (For Testing)

```bash
# 1. Register for sections
POST /api/sections/register
{ "sectionId": "..." }

# 2. Create schedule
POST /api/student-profile/schedules
{ "name": "Spring 2026", "isActive": true }

# 3. Generate from sections
POST /api/student-profile/schedules/{id}/generate-from-sections

# 4. Add assignments
POST /api/student-profile/schedules/{id}/add-assignments

# 5. Add evaluations
POST /api/student-profile/schedules/{id}/add-evaluations

# 6. Mark events as interested
PATCH /api/student-profile/events/{eventId}/mark-interested

# 7. Add events to schedule
POST /api/student-profile/schedules/{id}/add-events

# 8. View complete schedule
GET /api/student-profile/schedules/{id}
```

---

## 9. Important Notes

### Deduplication
- Helper endpoints (generate-from-sections, add-assignments, etc.) check for existing items
- Won't create duplicates if called multiple times

### Active Schedule
- Only one schedule can be active at a time
- Setting one as active automatically deactivates others
- Frontend can use active schedule as default view

### Cascading Deletes
- Deleting a schedule deletes all its items
- Deleting a section registration doesn't delete schedule items (they become unlinked)

### Linked Entities
- Schedule items can link to existing data
- `linkedEntityType` specifies what it's linked to
- `linkedEntityId` is the UUID of that entity
- Unlinked items (custom) have null values

---

## 10. Testing Checklist

### Section Registration
- [ ] Register for multiple sections
- [ ] Unregister from section
- [ ] View registrations with full details
- [ ] Check registration status in available sections

### Schedule CRUD
- [ ] Create schedule
- [ ] Update schedule details
- [ ] Delete schedule
- [ ] Set active schedule
- [ ] Verify only one is active

### Schedule Items
- [ ] Generate from sections
- [ ] Add assignments
- [ ] Add evaluations
- [ ] Add events
- [ ] Create custom item
- [ ] Create recurring item
- [ ] Update item
- [ ] Delete item

### Event Tracking
- [ ] Mark event as interested
- [ ] Mark event as enrolled
- [ ] Add interested/enrolled events to schedule

---

All done! 🎉
