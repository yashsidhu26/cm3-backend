# Complete API Guide for Frontend Implementation

## Table of Contents
1. [Section Registration](#section-registration)
2. [Schedules/Timetables](#schedulestimetables)
3. [Schedule Items](#schedule-items)
4. [Helper Endpoints](#helper-endpoints)
5. [Gmail Sync](#gmail-sync)
6. [Skills & Interests](#skills--interests)
7. [Data Structures](#data-structures)
8. [Implementation Examples](#implementation-examples)

---

## Section Registration

### 1. Register for Section
```
POST /api/sections/register
```

**Request Body**:
```json
{
  "sectionId": "uuid"
}
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Successfully registered for section",
    "registration": {
      "id": "uuid",
      "userId": "uuid",
      "sectionId": "uuid",
      "registeredAt": "2026-02-08T10:00:00.000Z"
    },
    "note": "If you were registered for another section of the same type, you have been switched to this one"
  }
}
```

**Important Notes**:
- ⚠️ **One section per type per course**: You can only register for one Lecture, one Lab, and one Tutorial per course
- 🔄 **Auto-switch behavior**: If you're already registered for "Lecture 1" and try to register for "Lecture 2" of the same course, you'll be automatically switched to Lecture 2
- ✅ **No manual unregister needed**: The system handles switching automatically

---

### 2. Unregister from Section
```
DELETE /api/sections/register/:sectionId
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

### 3. Get User Registrations
```
GET /api/sections/registrations
```

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "registrationId": "uuid",
      "sectionId": "uuid",
      "courseId": "uuid",
      "courseCode": "CS F111",
      "courseName": "Computer Programming",
      "sectionType": "Lecture",
      "sectionNumber": 1,
      "instructors": ["Dr. John Doe", "Prof. Jane Smith"],
      "roomNumber": "C201",
      "schedule": [
        {
          "id": "uuid",
          "sectionId": "uuid",
          "dayOfWeek": "Monday",
          "startTime": "09:00",
          "endTime": "10:00",
          "createdAt": "2026-02-08T10:00:00.000Z"
        },
        {
          "id": "uuid",
          "sectionId": "uuid",
          "dayOfWeek": "Wednesday",
          "startTime": "09:00",
          "endTime": "10:00",
          "createdAt": "2026-02-08T10:00:00.000Z"
        }
      ],
      "registeredAt": "2026-02-08T10:00:00.000Z"
    }
  ]
}
```

---

### 4. Get Available Sections for Course
```
GET /api/sections/:courseId/available
```

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "courseId": "uuid",
      "sectionType": "Lecture",
      "sectionNumber": 1,
      "instructors": ["Dr. John Doe"],
      "roomNumber": "C201",
      "createdAt": "2026-02-08T10:00:00.000Z",
      "updatedAt": "2026-02-08T10:00:00.000Z",
      "schedule": [
        {
          "id": "uuid",
          "sectionId": "uuid",
          "dayOfWeek": "Monday",
          "startTime": "09:00",
          "endTime": "10:00"
        }
      ],
      "isRegistered": false
    },
    {
      "id": "another-uuid",
      "sectionType": "Tutorial",
      "sectionNumber": 2,
      "instructors": ["TA Name"],
      "roomNumber": "C202",
      "schedule": [...],
      "isRegistered": true
    }
  ]
}
```

---

## Schedules/Timetables

### 5. Get All Schedules
```
GET /api/student-profile/schedules
```

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "name": "Spring 2026",
      "description": "My current semester schedule",
      "isActive": true,
      "semester": "spring",
      "year": "2026",
      "createdAt": "2026-02-08T10:00:00.000Z",
      "updatedAt": "2026-02-08T10:00:00.000Z"
    },
    {
      "id": "another-uuid",
      "name": "Fall 2026 Draft",
      "isActive": false,
      "semester": "fall",
      "year": "2026",
      "createdAt": "2026-02-08T10:00:00.000Z",
      "updatedAt": "2026-02-08T10:00:00.000Z"
    }
  ]
}
```

---

### 6. Get Schedule with Items
```
GET /api/student-profile/schedules/:id
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Spring 2026",
    "description": "My current semester schedule",
    "isActive": true,
    "semester": "spring",
    "year": "2026",
    "items": [
      {
        "id": "uuid",
        "scheduleId": "uuid",
        "userId": "uuid",
        "title": "CS F111 - Lecture",
        "description": "Computer Programming (Lecture 1)",
        "type": "class",
        "linkedEntityId": "section-uuid",
        "linkedEntityType": "section",
        "startDateTime": "2026-02-10T09:00:00.000Z",
        "endDateTime": "2026-02-10T10:00:00.000Z",
        "isRecurring": true,
        "recurrencePattern": "weekly",
        "recurrenceEndDate": "2026-05-31T00:00:00.000Z",
        "dayOfWeek": "Monday",
        "location": "C201",
        "color": "#4ECDC4",
        "createdAt": "2026-02-08T10:00:00.000Z",
        "updatedAt": "2026-02-08T10:00:00.000Z"
      },
      {
        "id": "another-uuid",
        "title": "Lab 5 Submission",
        "type": "assignment",
        "linkedEntityId": "assignment-uuid",
        "linkedEntityType": "assignment",
        "startDateTime": "2026-02-15T23:59:00.000Z",
        "endDateTime": "2026-02-15T23:59:00.000Z",
        "isRecurring": false,
        "recurrencePattern": "none",
        "color": "#FF6B6B"
      }
    ]
  }
}
```

---

### 7. Create Schedule
```
POST /api/student-profile/schedules
```

**Request Body**:
```json
{
  "name": "Spring 2026",
  "description": "My current semester schedule",
  "isActive": true,
  "semester": "spring",
  "year": "2026"
}
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "name": "Spring 2026",
    "description": "My current semester schedule",
    "isActive": true,
    "semester": "spring",
    "year": "2026",
    "createdAt": "2026-02-08T10:00:00.000Z",
    "updatedAt": "2026-02-08T10:00:00.000Z"
  }
}
```

**Notes**:
- If `isActive: true`, all other schedules are automatically deactivated
- `semester` and `year` are optional

---

### 8. Update Schedule
```
PUT /api/student-profile/schedules/:id
```

**Request Body**: (All fields optional)
```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "isActive": false
}
```

---

### 9. Delete Schedule
```
DELETE /api/student-profile/schedules/:id
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

**Notes**: Cascades to all schedule items

---

### 10. Set Active Schedule
```
POST /api/student-profile/schedules/:id/set-active
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Spring 2026",
    "isActive": true,
    ...
  }
}
```

---

## Schedule Items

### 11. Get Schedule Items
```
GET /api/student-profile/schedules/:scheduleId/items
```

**Response**: Same as items array in Schedule with Items endpoint

---

### 12. Create Schedule Item
```
POST /api/student-profile/schedule-items
```

**Request Body**:
```json
{
  "scheduleId": "uuid",
  "title": "Study Session",
  "description": "Prepare for midterms",
  "type": "custom",
  "startDateTime": "2026-02-15T14:00:00.000Z",
  "endDateTime": "2026-02-15T16:00:00.000Z",
  "isRecurring": false,
  "recurrencePattern": "none",
  "location": "Library",
  "color": "#96CEB4"
}
```

**Item Types**:
- `class` - Linked to section
- `assignment` - Linked to assignment
- `evaluation` - Linked to evaluation
- `event` - Linked to campus event
- `custom` - User-created

**Recurrence Patterns**:
- `none` - One-time event
- `daily` - Repeats daily
- `weekly` - Repeats weekly
- `biweekly` - Repeats every 2 weeks
- `monthly` - Repeats monthly

**For Recurring Items**:
```json
{
  "scheduleId": "uuid",
  "title": "Weekly Team Meeting",
  "type": "custom",
  "startDateTime": "2026-02-10T15:00:00.000Z",
  "endDateTime": "2026-02-10T16:00:00.000Z",
  "isRecurring": true,
  "recurrencePattern": "weekly",
  "recurrenceEndDate": "2026-05-31T00:00:00.000Z",
  "dayOfWeek": "Friday",
  "location": "Room 301",
  "color": "#74B9FF"
}
```

---

### 13. Update Schedule Item
```
PUT /api/student-profile/schedule-items/:id
```

**Request Body**: (All fields optional except scheduleId cannot be changed)
```json
{
  "title": "Updated Title",
  "startDateTime": "2026-02-15T15:00:00.000Z",
  "color": "#FF6B6B"
}
```

---

### 14. Delete Schedule Item
```
DELETE /api/student-profile/schedule-items/:id
```

---

## Helper Endpoints

### 15. Generate from Registered Sections
```
POST /api/student-profile/schedules/:id/generate-from-sections
```

**Description**: Automatically creates schedule items from all registered course sections

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Generated 15 schedule items from registered sections",
    "itemsCreated": 15
  }
}
```

**Notes**:
- Creates one item per class timing
- Items are recurring (weekly)
- Skips if item already exists

---

### 16. Add Assignments to Schedule
```
POST /api/student-profile/schedules/:id/add-assignments
```

**Description**: Adds all upcoming assignments to schedule

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Added 8 assignments to schedule",
    "itemsCreated": 8
  }
}
```

---

### 17. Add Evaluations to Schedule
```
POST /api/student-profile/schedules/:id/add-evaluations
```

**Description**: Adds all upcoming evaluations (exams/quizzes) to schedule

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Added 3 evaluations to schedule",
    "itemsCreated": 3
  }
}
```

---

### 18. Add Events to Schedule
```
POST /api/student-profile/schedules/:id/add-events
```

**Description**: Adds enrolled/interested campus events to schedule

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Added 5 events to schedule",
    "itemsCreated": 5
  }
}
```

**Notes**: Only adds events where `isEnrolled` or `isInterested` is true

---

### 19. Mark Event as Interested
```
PATCH /api/student-profile/events/:id/mark-interested
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Smart India Hackathon",
    "isInterested": true,
    "isEnrolled": false,
    ...
  }
}
```

---

### 20. Mark Event as Enrolled
```
PATCH /api/student-profile/events/:id/mark-enrolled
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Smart India Hackathon",
    "isInterested": true,
    "isEnrolled": true,
    ...
  }
}
```

---

## Gmail Sync

### 21. Incremental Sync (Normal)
```
POST /api/student-profile/sync-gmail
```

**Description**: Syncs only new emails since last sync

**Request**: No body needed

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Gmail sync completed successfully",
    "result": {
      "emailsAnalyzed": 5,
      "assignmentsCreated": 2,
      "evaluationsCreated": 1,
      "errors": []
    }
  }
}
```

**Notes**:
- Only processes emails received since last sync
- Fast and efficient for regular syncs
- Emails are deduplicated (not sent to AI if already processed)
- Use this for automatic background syncs

---

### 22. Force Sync (Full Resync)
```
POST /api/student-profile/force-sync-gmail
```

**Description**: Forces full resync of last 90 days of emails, ignoring last sync timestamp

**Request**: No body needed

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Gmail force sync completed successfully",
    "result": {
      "emailsAnalyzed": 5,
      "emailsSkipped": 45,
      "assignmentsCreated": 2,
      "evaluationsCreated": 1,
      "eventsCreated": 2,
      "errors": []
    }
  }
}
```

**When to use**:
- ✅ First time syncing Gmail
- ✅ User wants to resync old emails
- ✅ Fixing sync issues
- ✅ After deleting items and wanting to re-import
- ✅ Manual "Refresh All" button in UI

**Important Notes**:
- Fetches emails from last **90 days**
- Still deduplicates to avoid creating duplicates
- Takes longer than incremental sync (may take 30-60 seconds)
- Show loading indicator to user
- Extracts assignments, evaluations, AND campus events

**Error Response** (500):
```json
{
  "success": false,
  "error": "Force sync failed: [error message]"
}
```

---

## Data Structures

### Schedule Object
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

### Schedule Item Object
```typescript
interface ScheduleItem {
  id: string;
  scheduleId: string;
  userId: string;
  title: string;
  description?: string;
  type: 'class' | 'assignment' | 'evaluation' | 'event' | 'custom';
  linkedEntityId?: string;
  linkedEntityType?: 'section' | 'assignment' | 'evaluation' | 'event';
  startDateTime: string;
  endDateTime: string;
  isRecurring: boolean;
  recurrencePattern: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'none';
  recurrenceEndDate?: string;
  dayOfWeek?: string;
  location?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}
```

### Section Registration Object
```typescript
interface SectionRegistration {
  registrationId: string;
  sectionId: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  sectionType: string;
  sectionNumber: number;
  instructors: string[];
  roomNumber?: string;
  schedule: ClassTiming[];
  registeredAt: string;
}

interface ClassTiming {
  id: string;
  sectionId: string;
  dayOfWeek: string;
  startTime: string; // HH:MM format
  endTime: string;   // HH:MM format
  createdAt: string;
}
```

---

## Implementation Examples

### Example 1: Building a Timetable

```typescript
// Step 1: Create a schedule
const schedule = await createSchedule({
  name: "Spring 2026",
  isActive: true,
  semester: "spring",
  year: "2026"
});

// Step 2: Generate from registered sections
await generateFromSections(schedule.id);

// Step 3: Add assignments, evaluations, and events
await Promise.all([
  addAssignments(schedule.id),
  addEvaluations(schedule.id),
  addEvents(schedule.id)
]);

// Step 4: Fetch complete schedule
const fullSchedule = await getScheduleWithItems(schedule.id);
```

---

### Example 2: Section Registration Flow

```typescript
// Step 1: Get available sections for a course
const sections = await getAvailableSections(courseId);

// Step 2: Show sections to user (filter by registered status)
const unregisteredSections = sections.filter(s => !s.isRegistered);

// Step 3: Register for selected section
await registerForSection(selectedSectionId);

// Step 4: Refresh user registrations
const myRegistrations = await getUserRegistrations();
```

---

### Example 3: Weekly Timetable View

```typescript
// Fetch active schedule with items
const activeSchedule = await getActiveSchedule();
const items = activeSchedule.items;

// Group by day of week
const byDay = {
  Monday: [],
  Tuesday: [],
  Wednesday: [],
  Thursday: [],
  Friday: [],
  Saturday: [],
  Sunday: []
};

items.forEach(item => {
  if (item.isRecurring && item.dayOfWeek) {
    byDay[item.dayOfWeek].push(item);
  } else {
    // For non-recurring, calculate day from startDateTime
    const day = new Date(item.startDateTime).toLocaleDateString('en-US', { weekday: 'long' });
    byDay[day].push(item);
  }
});

// Sort each day by start time
Object.keys(byDay).forEach(day => {
  byDay[day].sort((a, b) =>
    new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
  );
});
```

---

### Example 4: Color-Coded Calendar

```typescript
const itemTypeColors = {
  class: '#4ECDC4',      // Teal
  assignment: '#FF6B6B', // Red
  evaluation: '#45B7D1', // Blue
  event: '#FFEAA7',      // Yellow
  custom: '#96CEB4'      // Green
};

// When creating custom items, use these default colors
// Or let users pick their own
```

---

## Frontend Implementation Checklist

### Section Registration
- [ ] Course sections page showing available sections
- [ ] Register/Unregister buttons
- [ ] Visual indicator for registered sections
- [ ] Show current registration badge (e.g., "Currently in Lecture 1")
- [ ] "Switch to this section" UI when clicking another section of same type
- [ ] Confirmation dialog: "Switch from Lecture 1 to Lecture 2?"
- [ ] My Sections page showing all registrations (one per type)

### Schedule Management
- [ ] Schedules list page
- [ ] Create new schedule form
- [ ] Set active schedule toggle
- [ ] Delete schedule confirmation

### Timetable View
- [ ] Weekly calendar view
- [ ] Daily list view
- [ ] Monthly calendar view
- [ ] Color-coded by item type
- [ ] Click item to view details/edit

### Schedule Building
- [ ] "Generate from Sections" button
- [ ] "Add Assignments" button
- [ ] "Add Evaluations" button
- [ ] "Add Events" button
- [ ] Success/count feedback

### Custom Items
- [ ] Add custom event form
- [ ] Recurring event options
- [ ] Color picker
- [ ] Edit/delete custom items

### Event Management
- [ ] "Mark as Interested" button on event cards
- [ ] "Mark as Enrolled" button on event cards
- [ ] Filter events by enrolled/interested
- [ ] Add to schedule button

### Gmail Sync
- [ ] Automatic background sync (call `/sync-gmail` every 1-6 hours)
- [ ] Manual "Sync Now" button (incremental sync)
- [ ] "Force Resync" or "Refresh All" button
  - Show confirmation dialog: "This will resync last 90 days of emails. Continue?"
  - Show loading indicator with progress text
  - Display results after completion
- [ ] Last sync timestamp display
- [ ] Sync status indicators (syncing, success, error)
- [ ] Error message display if sync fails

---

## Skills & Interests

The Skills & Interests module allows users to track skills they want to learn, manage learning resources, and monitor their progress. It works similarly to the courses system with a catalog and user enrollments.

### 1. Get All Skills (Catalog)
```
GET /api/skills-interests
```

**Query Parameters** (all optional):
- `category`: Filter by category (programming, design, business, languages, personal, academic, creative, technical, other)
- `difficulty`: Filter by difficulty (beginner, intermediate, advanced, expert)
- `search`: Search by name, description, or tags

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Machine Learning",
      "category": "programming",
      "description": "Learn ML algorithms and techniques",
      "difficulty": "advanced",
      "estimatedHours": 120,
      "tags": ["python", "ai", "data-science"],
      "icon": "🤖",
      "createdAt": "2026-02-08T10:00:00.000Z",
      "updatedAt": "2026-02-08T10:00:00.000Z"
    }
  ]
}
```

---

### 2. Get Skill by ID
```
GET /api/skills-interests/:id
```

**Response** (200): Returns single skill object

---

### 3. Create New Skill
```
POST /api/skills-interests
```

**Request Body**:
```json
{
  "name": "Web Development",
  "category": "programming",
  "description": "Build modern web applications",
  "difficulty": "intermediate",
  "estimatedHours": 100,
  "tags": ["javascript", "react", "node"],
  "icon": "💻"
}
```

**Response** (200): Returns created skill object

---

### 4. Update Skill
```
PUT /api/skills-interests/:id
```

**Request Body**: Same as Create (all fields optional)

---

### 5. Delete Skill
```
DELETE /api/skills-interests/:id
```

---

### 6. Get User's Skills
```
GET /api/skills-interests/my-skills
```

**Query Parameters**:
- `status`: Filter by status (interested, learning, completed, paused)

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "skillInterestId": "uuid",
      "status": "learning",
      "progress": 45,
      "notes": "Working through online course",
      "startedAt": "2026-01-15T10:00:00.000Z",
      "completedAt": null,
      "createdAt": "2026-01-15T10:00:00.000Z",
      "updatedAt": "2026-02-08T10:00:00.000Z",
      "skill": {
        "id": "uuid",
        "name": "Machine Learning",
        "category": "programming",
        "description": "Learn ML algorithms",
        "difficulty": "advanced",
        "estimatedHours": 120,
        "tags": ["python", "ai"],
        "icon": "🤖"
      }
    }
  ]
}
```

---

### 7. Get User's Learning Stats
```
GET /api/skills-interests/my-skills/stats
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "total": 10,
    "interested": 3,
    "learning": 5,
    "completed": 2,
    "paused": 0,
    "totalProgress": 450,
    "avgProgress": 45
  }
}
```

---

### 8. Add Skill to User's List
```
POST /api/skills-interests/my-skills
```

**Request Body**:
```json
{
  "skillInterestId": "uuid",
  "status": "interested"  // optional, defaults to "interested"
}
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Skill added to your list",
    "userSkill": {
      "id": "uuid",
      "userId": "uuid",
      "skillInterestId": "uuid",
      "status": "interested",
      "progress": 0,
      "notes": null,
      "startedAt": null,
      "completedAt": null,
      "createdAt": "2026-02-08T10:00:00.000Z",
      "updatedAt": "2026-02-08T10:00:00.000Z"
    }
  }
}
```

**Error**: Returns 500 if skill already added to user's list

---

### 9. Update User Skill Progress
```
PATCH /api/skills-interests/my-skills/:skillInterestId
```

**Request Body** (all optional):
```json
{
  "status": "learning",
  "progress": 75,
  "notes": "Completed modules 1-5"
}
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Skill updated successfully",
    "userSkill": { /* updated skill */ }
  }
}
```

**Notes**:
- Setting status to "learning" automatically sets `startedAt` if not already set
- Setting status to "completed" automatically sets `completedAt` and progress to 100
- Progress must be 0-100

---

### 10. Remove Skill from User's List
```
DELETE /api/skills-interests/my-skills/:skillInterestId
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Skill removed from your list"
  }
}
```

---

### 11. Get Resources for a Skill
```
GET /api/skills-interests/:skillId/resources
```

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "skillInterestId": "uuid",
      "userId": "uuid",
      "title": "Complete Python Course",
      "url": "https://example.com/course",
      "type": "course",
      "description": "Comprehensive Python tutorial",
      "difficulty": "beginner",
      "estimatedHours": 40,
      "isCompleted": 0,
      "createdAt": "2026-02-08T10:00:00.000Z",
      "updatedAt": "2026-02-08T10:00:00.000Z"
    }
  ]
}
```

---

### 12. Add Resource to Skill
```
POST /api/skills-interests/resources
```

**Request Body**:
```json
{
  "skillInterestId": "uuid",
  "title": "Python Tutorial",
  "url": "https://example.com",
  "type": "tutorial",
  "description": "Learn Python basics",
  "difficulty": "beginner",
  "estimatedHours": 10
}
```

**Resource Types**: article, video, course, book, tutorial, documentation, project, other

---

### 13. Update Resource
```
PUT /api/skills-interests/resources/:id
```

**Request Body**: Same as Add Resource (all fields optional except `skillInterestId` which cannot be changed)

---

### 14. Delete Resource
```
DELETE /api/skills-interests/resources/:id
```

---

### 15. Get Related Skills
```
GET /api/skills-interests/:skillId/related
```

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Machine Learning",
      "category": "programming",
      "description": "Learn ML algorithms",
      "difficulty": "advanced",
      "estimatedHours": 120,
      "tags": ["python", "ai"],
      "icon": "🤖",
      "relationshipType": "builds_on",
      "relationshipDescription": "Builds upon Python fundamentals",
      "direction": "outgoing"
    }
  ]
}
```

**Relationship Types**:
- `prerequisite` - Skill A is required before Skill B
- `related` - Skills are related/complementary
- `builds_on` - Skill B builds upon Skill A
- `alternative` - Alternative approaches to similar goals

**Direction**:
- `outgoing` - Relationship points FROM this skill TO another
- `incoming` - Relationship points FROM another skill TO this one

---

### 16. Add Skill Relationship
```
POST /api/skills-interests/relationships
```

**Request Body**:
```json
{
  "fromSkillId": "uuid",
  "toSkillId": "uuid",
  "relationshipType": "prerequisite",
  "description": "Python is foundational for machine learning"
}
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Skill relationship created successfully",
    "relationship": {
      "id": "uuid",
      "fromSkillId": "uuid",
      "toSkillId": "uuid",
      "relationshipType": "prerequisite",
      "description": "Python is foundational for machine learning",
      "createdAt": "2026-02-08T10:00:00.000Z"
    }
  }
}
```

---

### 17. Delete Skill Relationship
```
DELETE /api/skills-interests/relationships/:fromSkillId/:toSkillId
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Relationship deleted successfully"
  }
}
```

---

### 18. Get Skill Recommendations
```
GET /api/skills-interests/recommendations
```

Get personalized skill recommendations based on user's completed and learning skills. Uses skill relationships to suggest logical next steps.

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Machine Learning",
      "category": "programming",
      "description": "Learn ML algorithms",
      "difficulty": "advanced",
      "estimatedHours": 120,
      "tags": ["python", "ai"],
      "icon": "🤖",
      "recommendationReasons": [
        {
          "relationType": "builds_on",
          "description": "Builds upon your Python skills"
        }
      ]
    }
  ]
}
```

---

### Skills & Interests Implementation Checklist

#### Skills Catalog Page
- [ ] Grid/list view of all skills
- [ ] Category filter dropdown
- [ ] Difficulty filter dropdown
- [ ] Search bar for skills
- [ ] "Add to My List" button on each skill card
- [ ] Skill details modal showing description, tags, resources

#### My Skills Page
- [ ] Display user's skills grouped by status
- [ ] Progress bars for each skill
- [ ] Filter by status (interested, learning, completed, paused)
- [ ] Stats dashboard (total, learning, completed, avg progress)
- [ ] Quick actions: Start Learning, Mark Complete, Pause, Remove
- [ ] Update progress slider/input
- [ ] Personal notes textarea

#### Skill Detail Page
- [ ] Skill information and description
- [ ] Add/remove from my list button
- [ ] Status selector
- [ ] Progress tracker
- [ ] Resources section with add/edit/delete
- [ ] Resource cards with title, type, URL, difficulty
- [ ] Mark resource as completed checkbox
- [ ] Related skills section (prerequisites, builds-on, related, alternatives)
- [ ] Visual skill graph/tree showing relationships
- [ ] Add relationship button (for admins/power users)

#### Recommendations Page
- [ ] Personalized skill recommendations based on user's current skills
- [ ] Recommendation cards with reasoning ("Because you learned Python...")
- [ ] Filter by category/difficulty
- [ ] Quick add to learning list button

#### Resource Management
- [ ] Add resource form with all fields
- [ ] Edit resource modal
- [ ] Delete confirmation dialog
- [ ] Resource type icons/badges
- [ ] External link handling (open in new tab)
- [ ] Filter resources by type/difficulty

---

## Database Migration

Run these commands:
```bash
bun run db:generate
bun run db:migrate
```

This creates:
1. `schedules` table
2. `schedule_items` table
3. `skills_interests` table (catalog)
4. `user_skills_interests` table (user enrollments)
5. `skill_resources` table (learning resources)
6. `skill_relationships` table (links between skills)
7. Required enums (schedule_item_type, recurrence_pattern, skill_category, difficulty_level, learning_status, resource_type, skill_relationship_type)
8. Updates `campus_events` with `isInterested` and `isEnrolled` fields

---

That's everything! 🚀
