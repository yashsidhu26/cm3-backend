# Quick Start - Testing

## ⚡ Run Tests in 3 Steps

### 1. Start the Server
```bash
bun run dev
```

### 2. Run Tests (in a new terminal)
```bash
bun run test
```

### 3. View Results
```
🎉 All tests passed!
```

---

## 📊 What Gets Tested

✅ **25 Comprehensive Tests**

### Authentication (6 tests)
- Sign up new users
- Sign in with credentials
- Session management
- Profile CRUD operations

### Academics (5 tests)
- Course listing
- Moodle synchronization
- Resource management
- User enrollments

### Social (6 tests)
- Post creation/deletion
- Comments
- User feeds

### Security (3 tests)
- Protected routes
- Invalid credentials
- Input validation

### System (5 tests)
- Health checks
- Error handling
- Cleanup

---

## 🔍 Sample Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. AUTHENTICATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Sign Up (234ms)
✓ Sign In (189ms)
✓ Get Session (23ms)
✓ Get Profile (19ms)
✓ Update Profile (45ms)
✓ Auth Status (15ms)
```

---

## 🛠️ Troubleshooting

### Server Not Running?
```bash
# Terminal 1
bun run dev

# Terminal 2 (wait 2 seconds)
bun run test
```

### Database Issues?
```bash
bun run db:generate
bun run db:migrate
```

### Port Conflict?
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

---

## 📝 Test Individual Endpoints

### Using the Test Script
The script automatically tests endpoints in order:
1. Creates test user
2. Logs in (saves cookies)
3. Tests protected routes
4. Cleans up

### Manual Testing
```bash
# 1. Sign In
curl -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"test@example.com","password":"TestPassword123!"}'

# 2. Test Protected Route
curl http://localhost:3000/api/auth/profile -b cookies.txt

# 3. Test Moodle Sync
curl -X POST http://localhost:3000/api/academics/sync \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"moodleUsername":"2021A7PS0001","moodlePassword":"pass"}'
```

---

## 🎯 Expected Results

### All Passing (100%)
```
Total Tests:    25
✓ Passed:       25 (100.0%)
✗ Failed:       0 (0.0%)
⊘ Skipped:      0
⏱  Duration:     ~2000ms

🎉 All tests passed!
```

### Some Failures
```
Total Tests:    25
✓ Passed:       22 (88.0%)
✗ Failed:       3 (12.0%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FAILED TESTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✗ Moodle Sync
  Moodle authentication failed: Invalid credentials
```

---

## 🚀 Advanced Usage

### Watch Mode (Auto-rerun on changes)
```bash
bun run test:watch
```

### Test Specific Port
```bash
# Modify test-api.ts
const tester = new APITester('http://localhost:3001');
```

### Custom Test Server
```bash
# Edit test-api.ts line 10
constructor(baseUrl: string = 'https://your-server.com')
```

---

## 📚 Full Documentation

See `TESTING_GUIDE.md` for:
- Detailed test descriptions
- Manual testing with cURL
- CI/CD integration
- Performance testing
- Security testing

---

## ✨ Pro Tips

1. **Run tests after every change** to catch issues early
2. **Check server logs** if tests fail
3. **Use separate test database** for isolation
4. **Review failed test errors** carefully
5. **Keep tests fast** - current suite runs in ~2s

---

**Ready to test?** Run `bun run test` now! 🧪
