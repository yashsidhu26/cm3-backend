# API Quick Reference - Schedules & Timetables

## Gmail Sync
```
POST /api/student-profile/sync-gmail              Incremental sync (new emails only)
POST /api/student-profile/force-sync-gmail        Force resync (last 90 days)
```

## Section Registration
```
POST   /api/sections/register                    Register for section
DELETE /api/sections/register/:sectionId         Unregister
GET    /api/sections/registrations               Get my registrations
GET    /api/sections/:courseId/available         Get available sections
```

## Schedules
```
GET    /api/student-profile/schedules            List all schedules
GET    /api/student-profile/schedules/:id        Get schedule with items
POST   /api/student-profile/schedules            Create schedule
PUT    /api/student-profile/schedules/:id        Update schedule
DELETE /api/student-profile/schedules/:id        Delete schedule
POST   /api/student-profile/schedules/:id/set-active   Set as active
```

## Schedule Items
```
GET    /api/student-profile/schedules/:scheduleId/items   Get items
POST   /api/student-profile/schedule-items                Create item
PUT    /api/student-profile/schedule-items/:id            Update item
DELETE /api/student-profile/schedule-items/:id            Delete item
```

## Auto-populate Schedule
```
POST /api/student-profile/schedules/:id/generate-from-sections
POST /api/student-profile/schedules/:id/add-assignments
POST /api/student-profile/schedules/:id/add-evaluations
POST /api/student-profile/schedules/:id/add-events
```

## Event Tracking
```
PATCH /api/student-profile/events/:id/mark-interested
PATCH /api/student-profile/events/:id/mark-enrolled
```

---

## Item Types
- `class` - Linked to course section
- `assignment` - Linked to assignment
- `evaluation` - Linked to exam/quiz
- `event` - Linked to campus event
- `custom` - User-created

## Recurrence Patterns
- `none` - One-time
- `daily` - Every day
- `weekly` - Every week (same day)
- `biweekly` - Every 2 weeks
- `monthly` - Every month

## Default Colors
- Class: `#4ECDC4` (Teal)
- Assignment: `#FF6B6B` (Red)
- Evaluation: `#45B7D1` (Blue)
- Event: `#FFEAA7` (Yellow)
- Custom: `#96CEB4` (Green)

---

## Complete Workflow

1. **Register for Sections**
   ```
   POST /api/sections/register
   { "sectionId": "uuid" }
   ```

2. **Create Schedule**
   ```
   POST /api/student-profile/schedules
   { "name": "Spring 2026", "isActive": true }
   ```

3. **Auto-populate**
   ```
   POST /api/student-profile/schedules/{id}/generate-from-sections
   POST /api/student-profile/schedules/{id}/add-assignments
   POST /api/student-profile/schedules/{id}/add-evaluations
   POST /api/student-profile/schedules/{id}/add-events
   ```

4. **View Schedule**
   ```
   GET /api/student-profile/schedules/{id}
   ```

---

## Sample Item Types

### Class Item (Recurring)
```json
{
  "scheduleId": "uuid",
  "title": "CS F111 - Lecture",
  "type": "class",
  "linkedEntityId": "section-uuid",
  "linkedEntityType": "section",
  "startDateTime": "2026-02-10T09:00:00Z",
  "endDateTime": "2026-02-10T10:00:00Z",
  "isRecurring": true,
  "recurrencePattern": "weekly",
  "dayOfWeek": "Monday",
  "location": "C201",
  "color": "#4ECDC4"
}
```

### Assignment Item (One-time)
```json
{
  "scheduleId": "uuid",
  "title": "Lab 5 Submission",
  "type": "assignment",
  "linkedEntityId": "assignment-uuid",
  "linkedEntityType": "assignment",
  "startDateTime": "2026-02-15T23:59:00Z",
  "endDateTime": "2026-02-15T23:59:00Z",
  "isRecurring": false,
  "color": "#FF6B6B"
}
```

### Custom Item (Recurring)
```json
{
  "scheduleId": "uuid",
  "title": "Weekly Study Group",
  "type": "custom",
  "startDateTime": "2026-02-12T18:00:00Z",
  "endDateTime": "2026-02-12T20:00:00Z",
  "isRecurring": true,
  "recurrencePattern": "weekly",
  "recurrenceEndDate": "2026-05-31T00:00:00Z",
  "dayOfWeek": "Wednesday",
  "location": "Library",
  "color": "#96CEB4"
}
```

---

See `FRONTEND_API_GUIDE.md` for complete documentation.
