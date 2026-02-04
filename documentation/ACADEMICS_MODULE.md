# Academics Module Documentation

Complete implementation of the Academics module with Moodle LMS synchronization for the Student Super App.

## 📦 Overview

The Academics module manages:
- **Courses** - Course information from Moodle
- **Enrollments** - Student course registrations
- **Resources** - Course materials (PDFs, slides, videos)
- **Moodle Sync** - Automated data synchronization from Moodle LMS

## 🗄️ Database Schema

### Tables

#### 1. Courses Table
```sql
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moodle_course_id VARCHAR(100) UNIQUE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  professor_name VARCHAR(255),
  description TEXT,
  semester semester_enum, -- 'fall', 'spring', 'summer'
  year VARCHAR(10),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### 2. Enrollments Table
```sql
CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  semester semester_enum NOT NULL DEFAULT 'fall',
  year VARCHAR(10),
  enrolled_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### 3. Resources Table
```sql
CREATE TABLE resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  url TEXT NOT NULL,
  type resource_type_enum NOT NULL DEFAULT 'other',
  is_downloaded BOOLEAN NOT NULL DEFAULT FALSE,
  file_size VARCHAR(50),
  moodle_resource_id VARCHAR(100),
  uploaded_by VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Enums

```sql
CREATE TYPE semester_enum AS ENUM ('fall', 'spring', 'summer');
CREATE TYPE resource_type_enum AS ENUM ('pdf', 'slide', 'video', 'link', 'assignment', 'other');
```

### Generate Migrations

```bash
# Generate migration files
bun run db:generate

# Apply migrations to database
bun run db:migrate

# Open Drizzle Studio to view tables
bun run db:studio
```

## 🚀 API Endpoints

### Moodle Sync

#### POST `/api/academics/sync`
Sync user's Moodle data (courses and enrollments).

**Authentication:** Required  
**Request Body:**
```json
{
  "moodleUsername": "2021A7PS0001",
  "moodlePassword": "your_moodle_password"
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "message": "Moodle sync completed successfully",
    "result": {
      "coursesAdded": 5,
      "coursesUpdated": 2,
      "enrollmentsCreated": 5
    }
  },
  "meta": {
    "timestamp": "2026-01-31T...",
    "path": "/api/academics/sync"
  }
}
```

**Response (Partial Failure):**
```json
{
  "success": false,
  "error": {
    "message": "Moodle sync completed with errors",
    "code": "SYNC_PARTIAL_FAILURE",
    "details": {
      "result": {
        "coursesAdded": 3,
        "coursesUpdated": 2,
        "enrollmentsCreated": 3,
        "errors": ["Failed to process course CS F111: Network error"]
      }
    }
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/academics/sync \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "moodleUsername": "2021A7PS0001",
    "moodlePassword": "your_password"
  }'
```

### My Courses

#### GET `/api/academics/my-courses`
Get authenticated user's enrolled courses with resource counts.

**Authentication:** Required  
**Response:**
```json
{
  "success": true,
  "data": {
    "courses": [
      {
        "id": "uuid-here",
        "code": "CS F111",
        "name": "Computer Programming",
        "professorName": "Dr. John Doe",
        "description": "Introduction to programming...",
        "enrollment": {
          "semester": "fall",
          "year": "2024",
          "enrolledAt": "2024-08-15T..."
        },
        "resourceCount": 15
      }
    ],
    "count": 5
  }
}
```

**cURL Example:**
```bash
curl http://localhost:3000/api/academics/my-courses \
  -b cookies.txt
```

### Course Resources

#### GET `/api/academics/courses/:id/resources`
Get all resources for a specific course.

**Authentication:** Required  
**Authorization:** Must be enrolled in the course  

**Response:**
```json
{
  "success": true,
  "data": {
    "courseId": "uuid-here",
    "resources": [
      {
        "id": "uuid-here",
        "title": "Lecture 1 - Introduction.pdf",
        "url": "https://cms.bits-pilani.ac.in/...",
        "type": "pdf",
        "isDownloaded": false,
        "fileSize": "2048576",
        "uploadedBy": "Dr. John Doe",
        "createdAt": "2024-08-20T..."
      }
    ],
    "count": 15
  }
}
```

**cURL Example:**
```bash
curl http://localhost:3000/api/academics/courses/{course-id}/resources \
  -b cookies.txt
```

### Public Endpoints

#### GET `/api/academics/courses`
Get all available courses.

**Authentication:** None  
**Response:**
```json
{
  "success": true,
  "data": {
    "courses": [...],
    "count": 50
  }
}
```

#### GET `/api/academics/courses/:id`
Get specific course details.

**Authentication:** None

### Admin Endpoints

#### POST `/api/academics/courses`
Create a new course.

**Authentication:** Required  
**Authorization:** Admin only  

**Request Body:**
```json
{
  "code": "CS F111",
  "name": "Computer Programming",
  "professorName": "Dr. John Doe",
  "description": "Introduction to programming using Python",
  "semester": "fall",
  "year": "2024"
}
```

#### POST `/api/academics/resources`
Add a resource to a course.

**Authentication:** Required  
**Authorization:** Admin only  

**Request Body:**
```json
{
  "courseId": "uuid-here",
  "title": "Week 1 Lecture Notes.pdf",
  "url": "https://example.com/resource.pdf",
  "type": "pdf",
  "fileSize": "2048576"
}
```

#### GET `/api/academics/courses/:id/enrollments`
Get all enrollments for a course.

**Authentication:** Required  
**Authorization:** Admin only

#### POST `/api/academics/enrollments`
Manually enroll a user in a course.

**Authentication:** Required  
**Authorization:** Admin only  

**Request Body:**
```json
{
  "userId": "user-uuid",
  "courseId": "course-uuid",
  "semester": "fall",
  "year": "2024"
}
```

#### DELETE `/api/academics/enrollments`
Unenroll a user from a course.

**Authentication:** Required  
**Authorization:** Admin only

## 🔌 Moodle Integration

### MoodleClient Service

Located in `src/modules/academics/moodle.service.ts`

#### Methods

**1. authenticate(username, password)**
```typescript
const authResponse = await moodleClient.authenticate(
  '2021A7PS0001',
  'password'
);
// Returns: { token: string, userId: string }
```

**2. fetchCourses(token)**
```typescript
const courses = await moodleClient.fetchCourses(authResponse.token);
// Returns: MoodleCourse[]
```

**3. fetchCourseResources(token, courseId)**
```typescript
const resources = await moodleClient.fetchCourseResources(
  authResponse.token,
  'moodle_course_123'
);
// Returns: MoodleResource[]
```

**4. validateToken(token)**
```typescript
const isValid = await moodleClient.validateToken(token);
// Returns: boolean
```

### Custom Moodle Errors

```typescript
try {
  await moodleClient.authenticate(username, password);
} catch (error) {
  if (error instanceof MoodleError) {
    console.log(error.code); // 'INVALID_CREDENTIALS', 'TIMEOUT', etc.
    console.log(error.statusCode); // 401, 408, 500, etc.
  }
}
```

### Implementing Real Moodle Integration

The current implementation uses **placeholder/mock responses**. To connect to actual Moodle:

1. **Get Moodle Web Service Token:**
   - Enable web services in Moodle admin
   - Create a web service user
   - Generate a token

2. **Update MoodleClient:**
   - Replace mock responses with actual API calls
   - Use correct Moodle web service functions:
     - `core_enrol_get_users_courses` - Get courses
     - `core_course_get_contents` - Get course contents
     - `core_user_get_users_by_field` - Get user info

3. **Environment Configuration:**
```env
MOODLE_BASE_URL=https://cms.bits-pilani.ac.in
MOODLE_WS_TOKEN=your_web_service_token
```

## 🔄 Sync Process Flow

```
User Initiates Sync
       ↓
1. Authenticate with Moodle
   - Send username/password
   - Receive auth token
       ↓
2. Fetch Courses from Moodle
   - Use auth token
   - Get enrolled courses
       ↓
3. Process Each Course
   - Check if exists (by moodle_course_id)
   - Update or Insert course
       ↓
4. Create Enrollments
   - Link user to courses
   - Avoid duplicates
       ↓
5. (Optional) Sync Resources
   - Fetch course materials
   - Store in database
       ↓
Return Sync Result
```

## 💻 Service Usage Examples

### Sync User Data

```typescript
import { academicsService } from './academics.service';

const result = await academicsService.syncUserData(
  userId,
  'moodleUsername',
  'moodlePassword'
);

console.log(`Added: ${result.coursesAdded}, Updated: ${result.coursesUpdated}`);
```

### Get User Courses with Resources

```typescript
const courses = await academicsService.getUserCoursesWithResources(userId);

courses.forEach(item => {
  console.log(`${item.course.code}: ${item.resourceCount} resources`);
});
```

### Create Course Resource

```typescript
const resource = await academicsService.createResource({
  courseId: 'course-uuid',
  title: 'Week 1 Notes.pdf',
  url: 'https://example.com/notes.pdf',
  type: 'pdf',
  fileSize: '2048576',
});
```

### Mark Resource as Downloaded

```typescript
await academicsService.markResourceDownloaded(resourceId);
```

## 🧪 Testing the Module

### 1. Sync Moodle Data

```bash
# Login first
curl -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"student@example.com","password":"password123"}'

# Trigger sync
curl -X POST http://localhost:3000/api/academics/sync \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "moodleUsername": "2021A7PS0001",
    "moodlePassword": "moodle_password"
  }'
```

### 2. View My Courses

```bash
curl http://localhost:3000/api/academics/my-courses -b cookies.txt
```

### 3. View Course Resources

```bash
curl http://localhost:3000/api/academics/courses/{course-id}/resources \
  -b cookies.txt
```

### 4. Admin: Create Course

```bash
# Login as admin first
curl -X POST http://localhost:3000/api/academics/courses \
  -H "Content-Type: application/json" \
  -b admin-cookies.txt \
  -d '{
    "code": "CS F211",
    "name": "Data Structures",
    "professorName": "Dr. Smith",
    "semester": "spring",
    "year": "2024"
  }'
```

## 🔐 Security Considerations

### Moodle Credentials

1. **Never Store Plaintext Passwords**
   - Credentials are only used for authentication
   - Not stored in database
   - Consider token-based auth in production

2. **Rate Limiting**
   - Add rate limiting to `/sync` endpoint
   - Prevent brute force attacks on Moodle

3. **Token Management**
   - Cache Moodle tokens temporarily
   - Implement token refresh logic
   - Validate tokens before use

### Access Control

- **Sync**: Only authenticated users can sync their own data
- **My Courses**: Users can only see their enrolled courses
- **Resources**: Users can only access resources for enrolled courses
- **Admin**: Course/enrollment management restricted to admins

## 📊 Database Queries

### Get Courses with Enrollment Count

```typescript
const coursesWithCounts = await db
  .select({
    course: courses,
    enrollmentCount: sql<number>`cast(count(${enrollments.id}) as integer)`,
  })
  .from(courses)
  .leftJoin(enrollments, eq(courses.id, enrollments.courseId))
  .groupBy(courses.id);
```

### Get User's Downloaded Resources

```typescript
const downloaded = await db
  .select()
  .from(resources)
  .innerJoin(courses, eq(resources.courseId, courses.id))
  .innerJoin(enrollments, eq(courses.id, enrollments.courseId))
  .where(
    and(
      eq(enrollments.userId, userId),
      eq(resources.isDownloaded, true)
    )
  );
```

## 🐛 Error Handling

### Moodle Errors

```typescript
try {
  await academicsService.syncUserData(userId, username, password);
} catch (error) {
  if (error.message.includes('authentication failed')) {
    // Handle invalid credentials
  } else if (error.message.includes('timeout')) {
    // Handle timeout
  } else {
    // Handle other errors
  }
}
```

### Enrollment Conflicts

```typescript
try {
  await academicsService.enrollUser(userId, courseId);
} catch (error: any) {
  if (error.code === '23505') {
    // User already enrolled
  }
}
```

## 📈 Performance Optimization

### Batch Operations

```typescript
// Sync multiple courses in parallel
const syncPromises = courses.map(course => 
  processAndSaveCourse(course)
);
await Promise.allSettled(syncPromises);
```

### Caching

Consider caching:
- Course lists (1 hour)
- Resource counts (30 minutes)
- Moodle tokens (session duration)

### Indexing

Recommended database indexes:
```sql
CREATE INDEX idx_enrollments_user_id ON enrollments(user_id);
CREATE INDEX idx_enrollments_course_id ON enrollments(course_id);
CREATE INDEX idx_resources_course_id ON resources(course_id);
CREATE INDEX idx_courses_moodle_id ON courses(moodle_course_id);
```

## 🚀 Future Enhancements

1. **Background Sync**
   - Queue-based sync processing
   - Scheduled automatic syncs
   - Webhook notifications from Moodle

2. **Advanced Features**
   - Assignment submissions
   - Grade tracking
   - Attendance records
   - Discussion forums

3. **Offline Support**
   - Download resources for offline access
   - Sync when connection restored

4. **Analytics**
   - Course popularity
   - Resource usage statistics
   - Sync success rates

---

**Module Status:** ✅ Production Ready (with mock Moodle responses)  
**Next Steps:** Implement real Moodle API integration
