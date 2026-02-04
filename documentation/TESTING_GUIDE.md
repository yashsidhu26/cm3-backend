# Testing Guide

Complete testing documentation for the Super App API.

## 🧪 Automated Testing Script

### Overview

The `test-api.ts` script comprehensively tests all API endpoints and functionality.

### Features

✅ Tests all authentication endpoints  
✅ Tests academics module (Moodle sync, courses, resources)  
✅ Tests social module (posts, comments)  
✅ Tests error handling and validation  
✅ Tests protected route authorization  
✅ Provides detailed test reports  
✅ Automatic cleanup after tests  

### Running Tests

#### Prerequisites

1. **Start the server:**
```bash
bun run dev
```

2. **Ensure database is set up:**
```bash
bun run db:generate
bun run db:migrate
```

#### Run All Tests

```bash
bun run test
```

#### Expected Output

```
🧪 Starting API Tests...

Testing: http://localhost:3000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. BASIC ENDPOINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Health Check (45ms)
✓ Root Endpoint (12ms)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. AUTHENTICATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Sign Up (234ms)
✓ Sign In (189ms)
✓ Get Session (23ms)
✓ Get Profile (19ms)
✓ Update Profile (45ms)
✓ Auth Status (15ms)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. ACADEMICS MODULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Get All Courses (28ms)
✓ Moodle Sync (567ms)
✓ Get My Courses (34ms)
✓ Get Course by ID (21ms)
✓ Get Course Resources (29ms)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. SOCIAL MODULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Get All Posts (31ms)
✓ Create Post (67ms)
✓ Get Post by ID (18ms)
✓ Create Comment (54ms)
✓ Get Post Comments (22ms)
✓ Delete Post (43ms)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. ERROR HANDLING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Protected Route Without Auth (15ms)
✓ Invalid Credentials (123ms)
✓ Validation Error (34ms)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6. CLEANUP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Sign Out (28ms)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEST SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total Tests:    25
✓ Passed:       25 (100.0%)
✗ Failed:       0 (0.0%)
⊘ Skipped:      0
⏱  Duration:     1756ms

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎉 All tests passed!
```

## 📋 Test Coverage

### 1. Basic Endpoints
- `GET /` - Root endpoint
- `GET /health` - Health check

### 2. Authentication Module (`/api/auth`)
- `POST /sign-up/email` - User registration
- `POST /sign-in/email` - User login
- `POST /sign-out` - User logout
- `GET /session` - Get current session
- `GET /profile` - Get user profile (protected)
- `PATCH /profile` - Update profile (protected)
- `GET /status` - Check authentication status

### 3. Academics Module (`/api/academics`)
- `GET /courses` - Get all courses (public)
- `GET /courses/:id` - Get course by ID (public)
- `POST /sync` - Sync Moodle data (protected)
- `GET /my-courses` - Get user's courses (protected)
- `GET /courses/:id/resources` - Get course resources (protected)

### 4. Social Module (`/api/social`)
- `GET /posts` - Get all posts (public)
- `GET /posts/:id` - Get post by ID (public)
- `POST /posts` - Create post (protected)
- `DELETE /posts/:id` - Delete post (protected)
- `GET /posts/:id/comments` - Get post comments (public)
- `POST /comments` - Create comment (protected)

### 5. Error Handling
- Protected routes without authentication (401)
- Invalid credentials (401)
- Validation errors (400)
- Not found errors (404)

## 🔧 Manual Testing

### Using cURL

#### 1. Health Check
```bash
curl http://localhost:3000/health
```

#### 2. Sign Up
```bash
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!",
    "name": "Test User"
  }'
```

#### 3. Sign In
```bash
curl -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!"
  }'
```

#### 4. Get Profile
```bash
curl http://localhost:3000/api/auth/profile \
  -b cookies.txt
```

#### 5. Sync Moodle
```bash
curl -X POST http://localhost:3000/api/academics/sync \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "moodleUsername": "2021A7PS0001",
    "moodlePassword": "your_password"
  }'
```

#### 6. Get My Courses
```bash
curl http://localhost:3000/api/academics/my-courses \
  -b cookies.txt
```

#### 7. Create Post
```bash
curl -X POST http://localhost:3000/api/social/posts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "userId": "user-uuid",
    "title": "My First Post",
    "content": "Hello World!"
  }'
```

### Using Postman/Insomnia

1. **Import the following as a collection:**

```json
{
  "name": "Super App API",
  "baseUrl": "http://localhost:3000",
  "endpoints": [
    {
      "name": "Sign Up",
      "method": "POST",
      "path": "/api/auth/sign-up/email",
      "body": {
        "email": "{{email}}",
        "password": "{{password}}",
        "name": "{{name}}"
      }
    },
    {
      "name": "Sign In",
      "method": "POST",
      "path": "/api/auth/sign-in/email",
      "body": {
        "email": "{{email}}",
        "password": "{{password}}"
      }
    }
  ]
}
```

2. **Set environment variables:**
   - `email`: test@example.com
   - `password`: TestPassword123!
   - `name`: Test User

## 🐛 Debugging Failed Tests

### Common Issues

#### 1. Server Not Running
```
Error: Server is not running!
```

**Solution:**
```bash
bun run dev
```

#### 2. Database Not Migrated
```
Error: relation "user" does not exist
```

**Solution:**
```bash
bun run db:generate
bun run db:migrate
```

#### 3. Port Already in Use
```
Error: EADDRINUSE: address already in use :::3000
```

**Solution:**
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or use a different port
PORT=3001 bun run dev
```

#### 4. Test Failures

If specific tests fail, check:

1. **Database state:** Tests create data that might conflict
2. **Server logs:** Check console for errors
3. **Network issues:** Ensure localhost is accessible
4. **Authentication:** Cookie handling might vary

### Verbose Testing

For more detailed output, modify the test script:

```typescript
// In test-api.ts
private async request(...) {
  console.log(`${method} ${path}`); // Add this line
  const response = await fetch(url, options);
  console.log(`Status: ${response.status}`); // Add this line
  return response;
}
```

## 📊 Test Database

### Using Separate Test Database

For isolated testing, create a test database:

```bash
# Create test database
createdb super_app_test

# Update .env.test
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/super_app_test

# Run migrations
bun run db:migrate

# Run tests with test env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/super_app_test bun run test
```

### Cleanup Test Data

```sql
-- Clean all test data
TRUNCATE TABLE posts, comments, resources, enrollments, courses, 
                session, account, verification, "user" CASCADE;
```

## 🎯 CI/CD Integration

### GitHub Actions Example

```yaml
name: API Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: super_app_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
      
      - name: Install dependencies
        run: bun install
      
      - name: Run migrations
        run: bun run db:migrate
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/super_app_test
      
      - name: Start server
        run: bun run dev &
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/super_app_test
      
      - name: Wait for server
        run: sleep 5
      
      - name: Run tests
        run: bun run test
```

## 📈 Performance Testing

### Load Testing with Artillery

Install Artillery:
```bash
bun add -d artillery
```

Create `artillery.yml`:
```yaml
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10
  
scenarios:
  - name: "Health Check"
    flow:
      - get:
          url: "/health"
  
  - name: "Get Courses"
    flow:
      - get:
          url: "/api/academics/courses"
```

Run load test:
```bash
artillery run artillery.yml
```

## 🔒 Security Testing

### Test Authentication

```bash
# Try accessing protected route without auth
curl http://localhost:3000/api/auth/profile
# Should return 401

# Try with invalid token
curl http://localhost:3000/api/auth/profile \
  -H "Cookie: invalid-cookie"
# Should return 401

# Try accessing admin route as student
curl http://localhost:3000/api/auth/users \
  -b student-cookies.txt
# Should return 403
```

### Test Input Validation

```bash
# SQL injection attempt
curl -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com OR 1=1","password":"test"}'
# Should be safely handled

# XSS attempt
curl -X POST http://localhost:3000/api/social/posts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"title":"<script>alert(1)</script>","content":"test"}'
# Should be safely stored
```

## 📝 Test Checklist

Before deploying to production:

- [ ] All automated tests pass
- [ ] Manual testing on all endpoints
- [ ] Authentication works correctly
- [ ] Authorization enforces role restrictions
- [ ] Validation prevents invalid data
- [ ] Error messages are appropriate
- [ ] Performance is acceptable under load
- [ ] Database migrations work
- [ ] Environment variables are set
- [ ] Logs don't contain sensitive data

---

**Testing Status:** ✅ Comprehensive test suite ready  
**Coverage:** All major endpoints and error cases  
**Runtime:** ~2-3 seconds for full suite
