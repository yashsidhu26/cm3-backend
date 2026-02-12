# StudyDeck Integration - Complete Guide

Complete integration of StudyDeck API into your AI system for accessing lecture slides, past papers (PYQs), and study notes.

---

## 📦 What Was Added

### 1. **StudyDeck Service** (`src/modules/studydeck/studydeck.service.ts`)
TypeScript service that wraps all StudyDeck API calls:
- `getCourseFolders()` - Get folders for a course
- `getFolderDocuments()` - Get documents from a folder
- `searchResources()` - Search for slides/papers/notes by course code
- Token management with encryption

### 2. **REST API Endpoints** (`src/modules/studydeck/studydeck.routes.ts`)
- `POST /api/studydeck/token` - Save StudyDeck JWT token
- `GET /api/studydeck/folders/:courseStaticId` - Get course folders
- `GET /api/studydeck/documents/:folderStaticId` - Get folder documents
- `POST /api/studydeck/search` - Search resources by course code
- `GET /api/studydeck/status` - Check if StudyDeck is connected

### 3. **AI Tools** (Added to agent)
- `search_studydeck_resources` - AI can search for slides/papers/notes
- `get_studydeck_folder_documents` - AI can get documents from folders

### 4. **Database Schema**
Uses existing `studydeck_token` table from `academics/studydeck-auth.schema.ts`
- Stores encrypted StudyDeck JWT tokens per user
- Auto-cascades on user deletion

---

## 🚀 Setup Instructions

### Step 1: Run Database Migration

The `studydeck_token` table should already exist from earlier migrations. If not:

```bash
bun run db:generate
bun run db:migrate
```

### Step 2: Get Your StudyDeck JWT Token

1. Login to StudyDeck at https://studydeck.bits-sutechteam.org
2. Open Browser DevTools (F12) → Network tab
3. Make any request on StudyDeck
4. Find the request headers
5. Copy the JWT token from the `Cookie` header:
   ```
   Cookie: jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
6. Save just the token value (everything after `jwt=`)

### Step 3: Save Token via API

```bash
curl -X POST http://localhost:3000/api/studydeck/token \
  -H "Content-Type: application/json" \
  -H "Cookie: super-app.session_token=YOUR_SESSION_TOKEN" \
  -d '{"jwtToken": "YOUR_STUDYDECK_JWT_TOKEN"}'
```

---

## 📚 API Usage Examples

### Check StudyDeck Connection Status

```bash
curl http://localhost:3000/api/studydeck/status \
  -H "Cookie: super-app.session_token=YOUR_SESSION_TOKEN"
```

Response:
```json
{
  "success": true,
  "data": {
    "connected": true,
    "message": "StudyDeck is connected"
  }
}
```

### Search for Lecture Slides

```bash
curl -X POST http://localhost:3000/api/studydeck/search \
  -H "Content-Type: application/json" \
  -H "Cookie: super-app.session_token=YOUR_SESSION_TOKEN" \
  -d '{
    "courseCode": "CS F111",
    "resourceType": "slides",
    "limit": 10
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "courseCode": "CS F111",
    "resourceType": "slides",
    "folders": [
      {
        "folderId": "3f309da6-...",
        "name": "Lecture Slides - Week 1",
        "uploadedBy": "JOHN DOE",
        "types": "Slide"
      }
    ],
    "documents": [
      {
        "name": "Lecture_1_Introduction.pdf",
        "downloadUrl": "https://blr1.digitaloceanspaces.com/...",
        "uploadedAt": "15/03/2024",
        "docType": "Slide"
      }
    ]
  }
}
```

### Search for Past Papers (PYQs)

```bash
curl -X POST http://localhost:3000/api/studydeck/search \
  -H "Content-Type: application/json" \
  -H "Cookie: super-app.session_token=YOUR_SESSION_TOKEN" \
  -d '{
    "courseCode": "MATH F112",
    "resourceType": "papers"
  }'
```

---

## 🤖 AI Integration

The AI can now automatically access StudyDeck resources!

### Example Conversations:

**User:** "Show me lecture slides for CS F111"

**AI Response:**
```
I found 5 folders with lecture slides for CS F111:

1. **Lecture Slides - Introduction** (uploaded by Dr. Smith)
   - Lecture_1_Intro.pdf - Download: [link]
   - Lecture_2_Variables.pdf - Download: [link]

2. **Lecture Slides - Data Structures** (uploaded by Prof. Kumar)
   - Lecture_5_Arrays.pdf - Download: [link]

[Direct download links provided for all PDFs]
```

---

**User:** "Do you have past papers for BIO F111?"

**AI Response:**
```
Yes! I found 12 past papers (PYQs) for BIO F111:

📄 **2023 Papers:**
- Mid-Term 1 (2023) - Download: [link]
- Mid-Term 2 (2023) - Download: [link]
- Final Exam (2023) - Download: [link]

📄 **2022 Papers:**
- Mid-Term 1 (2022) - Download: [link]
...

All papers are ready to download!
```

---

**User:** "I need notes for MATH F112"

**AI Response:**
```
I found 3 note sets for MATH F112:

📝 **Calculus Notes** (by Ravi Sharma)
   - Chapter_1_Limits.pdf - Download: [link]
   - Chapter_2_Derivatives.pdf - Download: [link]

📝 **Integration Notes** (by Priya Singh)
   - Integration_Basics.pdf - Download: [link]

[All documents available for download]
```

---

## 🔧 AI Tool Details

### Tool 1: `search_studydeck_resources`

**When AI Uses It:**
- User asks for "lecture slides", "slides", "presentations"
- User asks for "past papers", "PYQs", "previous year questions"
- User asks for "notes", "study notes", "class notes"

**Parameters:**
- `courseCode` (required): e.g., "CS F111"
- `resourceType` (optional): "slides" | "papers" | "notes" | "all"

**Returns:**
- List of folders with metadata
- List of documents with direct download links
- All dates in DD/MM/YYYY format

---

### Tool 2: `get_studydeck_folder_documents`

**When AI Uses It:**
- User asks to "see what's in a specific folder"
- AI needs to explore folder contents after getting folder list

**Parameters:**
- `folderStaticId` (required): UUID of the folder

**Returns:**
- Complete list of documents in that folder
- Direct download URLs for each document

---

## 📊 Resource Types

| Resource Type | Description | Examples |
|---------------|-------------|----------|
| `slides` | Lecture slides, presentations | PPT, PDF slides |
| `papers` | Past papers, PYQs, quizzes | Mid-term papers, finals |
| `notes` | Study notes, summaries | Handwritten notes, typed notes |
| `all` | All resource types | Everything |

---

## 🔒 Security

**Token Encryption:**
- All StudyDeck JWT tokens are encrypted before storage
- Uses the same encryption as Moodle tokens (`ENCRYPTION_KEY` from .env)
- Tokens are decrypted only when making API calls

**Token Per User:**
- Each user has their own StudyDeck token
- Tokens are tied to user ID with cascade deletion

---

## 🎯 Use Cases

### 1. **Pre-Exam Preparation**
Student: "I have a CS F111 exam tomorrow. Show me all past papers and lecture slides for revision."

AI fetches:
- All past papers (PYQs) for CS F111
- Latest lecture slides
- Provides direct download links for quick access

---

### 2. **Topic-Specific Study**
Student: "I'm weak in calculus. Do we have any notes on integration?"

AI searches:
- Notes for MATH F112 (or relevant course)
- Filters for integration-related documents
- Provides targeted study materials

---

### 3. **Quick Resource Lookup**
Student: "Where can I find the BIO F111 lecture from last week?"

AI:
- Searches BIO F111 lecture slides
- Shows recent uploads
- Provides download link

---

## ⚠️ Important Notes

### Course Code to StudyDeck ID Mapping

Currently, the service has a placeholder for mapping course codes to StudyDeck course static IDs:

```typescript
// In studydeck.service.ts
private async getCourseStaticId(courseCode: string): Promise<string | null> {
  // TODO: Implement mapping
  return null;
}
```

**You need to implement this mapping by either:**

1. **Option A: Database Mapping Table**
   ```sql
   CREATE TABLE course_studydeck_mapping (
     course_code VARCHAR(20) PRIMARY KEY,
     studydeck_static_id UUID NOT NULL
   );
   ```

2. **Option B: Fetch from StudyDeck API**
   - Call StudyDeck's course search/list endpoint
   - Match by course name or code
   - Cache the results

3. **Option C: Hardcoded Mapping**
   ```typescript
   const mapping: Record<string, string> = {
     'CS F111': '3f309da6-...',
     'BIO F111': '26bee5b1-...',
     // etc.
   };
   ```

---

## 🧪 Testing

### Test 1: Basic Connection
```bash
# Check status
curl http://localhost:3000/api/studydeck/status \
  -H "Cookie: super-app.session_token=YOUR_TOKEN"

# Expected: {"success": true, "data": {"connected": true}}
```

### Test 2: Search Resources
```bash
curl -X POST http://localhost:3000/api/studydeck/search \
  -H "Content-Type: application/json" \
  -H "Cookie: super-app.session_token=YOUR_TOKEN" \
  -d '{"courseCode": "CS F111", "resourceType": "all"}'
```

### Test 3: AI Integration
Ask the AI: "Show me lecture slides for CS F111"

**Expected behavior:**
- AI calls `search_studydeck_resources` tool
- Returns formatted list with download links
- Dates in DD/MM/YYYY format

---

## 📈 Future Enhancements

1. **Automatic Course Mapping**
   - Sync with enrolled courses
   - Auto-map course codes to StudyDeck IDs

2. **Caching**
   - Cache folder and document listings
   - Reduce API calls

3. **Bookmarking**
   - Let users bookmark favorite resources
   - AI can suggest bookmarked materials

4. **Resource Recommendations**
   - AI suggests relevant materials based on upcoming exams
   - Smart recommendations based on weak topics

---

## Summary

✅ **Complete StudyDeck Integration**
✅ **AI Can Access Slides, PYQs, Notes**
✅ **REST API Endpoints Available**
✅ **Secure Token Storage**
✅ **Direct Download Links**
✅ **DD/MM/YYYY Date Format**

**Next Step:** Implement course code to StudyDeck ID mapping and test with real queries!

---

**Last Updated:** 2026-02-07
**Status:** ✅ Ready for Testing (needs course ID mapping implementation)
