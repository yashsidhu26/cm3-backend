# Skills & Interests API - Frontend Integration Guide

Complete API reference for implementing skills/interests tracking features in the frontend.

## Table of Contents
1. [Overview](#overview)
2. [Skills Catalog](#skills-catalog)
3. [User Skills Management](#user-skills-management)
4. [Learning Resources](#learning-resources)
5. [Skill Relationships](#skill-relationships)
6. [Recommendations](#recommendations)
7. [Common Use Cases](#common-use-cases)
8. [Error Handling](#error-handling)

---

## Overview

The skills & interests system allows users to:
- Browse a catalog of skills across multiple categories
- Track skills they're learning or interested in
- Monitor progress with percentage completion
- Discover learning resources for each skill
- Get personalized recommendations based on completed skills
- Explore skill relationships (prerequisites, related skills)

**Base URL:** `/api/skills-interests`

---

## Skills Catalog

### 1. Get All Skills
```http
GET /api/skills-interests
```

**Query Parameters:**
- `category` (optional): Filter by category
- `difficulty` (optional): Filter by difficulty level
- `search` (optional): Search by name, description, or tags

**Categories:** programming, design, business, languages, personal, academic, creative, technical, other

**Difficulty Levels:** beginner, intermediate, advanced, expert

**Example:**
```http
GET /api/skills-interests?category=programming&difficulty=beginner
```

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "skill-uuid",
      "name": "Python Programming",
      "category": "programming",
      "description": "Learn Python fundamentals and advanced concepts",
      "difficulty": "beginner",
      "estimatedHours": 80,
      "tags": ["python", "programming", "backend"],
      "icon": "🐍",
      "createdAt": "2026-02-01T10:00:00.000Z",
      "updatedAt": "2026-02-08T10:00:00.000Z"
    },
    {
      "id": "skill-uuid-2",
      "name": "JavaScript",
      "category": "programming",
      "description": "Master JavaScript for web development",
      "difficulty": "beginner",
      "estimatedHours": 60,
      "tags": ["javascript", "web", "frontend"],
      "icon": "⚡",
      "createdAt": "2026-02-01T10:00:00.000Z",
      "updatedAt": "2026-02-08T10:00:00.000Z"
    }
  ]
}
```

---

### 2. Get Skill by ID
```http
GET /api/skills-interests/:id
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "id": "skill-uuid",
    "name": "Machine Learning",
    "category": "programming",
    "description": "Learn ML algorithms, neural networks, and deep learning",
    "difficulty": "advanced",
    "estimatedHours": 120,
    "tags": ["ml", "ai", "data-science", "python"],
    "icon": "🤖",
    "createdAt": "2026-02-01T10:00:00.000Z",
    "updatedAt": "2026-02-08T10:00:00.000Z"
  }
}
```

---

### 3. Create Skill
```http
POST /api/skills-interests
```

**Request Body:**
```json
{
  "name": "React.js",
  "category": "programming",
  "description": "Build modern web applications with React",
  "difficulty": "intermediate",
  "estimatedHours": 50,
  "tags": ["react", "javascript", "frontend", "web"],
  "icon": "⚛️"
}
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "id": "skill-uuid",
    "name": "React.js",
    "category": "programming",
    "description": "Build modern web applications with React",
    "difficulty": "intermediate",
    "estimatedHours": 50,
    "tags": ["react", "javascript", "frontend", "web"],
    "icon": "⚛️",
    "createdAt": "2026-02-08T10:00:00.000Z",
    "updatedAt": "2026-02-08T10:00:00.000Z"
  }
}
```

---

### 4. Update Skill
```http
PUT /api/skills-interests/:id
```

**Request Body:** Same as Create (all fields optional)

---

### 5. Delete Skill
```http
DELETE /api/skills-interests/:id
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Skill deleted successfully"
  }
}
```

---

## User Skills Management

### 1. Get User's Skills
```http
GET /api/skills-interests/my-skills
```

**Query Parameters:**
- `status` (optional): Filter by learning status (interested, learning, completed, paused)

**Example:**
```http
GET /api/skills-interests/my-skills?status=learning
```

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "user-skill-uuid",
      "userId": "user-uuid",
      "skillInterestId": "skill-uuid",
      "status": "learning",
      "progress": 65,
      "notes": "Completed modules 1-4, working on project",
      "startedAt": "2026-01-15T10:00:00.000Z",
      "completedAt": null,
      "createdAt": "2026-01-15T10:00:00.000Z",
      "updatedAt": "2026-02-08T10:00:00.000Z",
      "skill": {
        "id": "skill-uuid",
        "name": "Python Programming",
        "category": "programming",
        "description": "Learn Python fundamentals",
        "difficulty": "beginner",
        "estimatedHours": 80,
        "tags": ["python", "programming"],
        "icon": "🐍"
      }
    }
  ]
}
```

---

### 2. Get Learning Statistics
```http
GET /api/skills-interests/my-skills/stats
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "total": 12,
    "interested": 4,
    "learning": 6,
    "completed": 2,
    "paused": 0,
    "totalProgress": 540,
    "avgProgress": 45
  }
}
```

---

### 3. Add Skill to Learning List
```http
POST /api/skills-interests/my-skills
```

**Request Body:**
```json
{
  "skillInterestId": "skill-uuid",
  "status": "interested"
}
```

**Status Options:** interested, learning, completed, paused (defaults to "interested")

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Skill added to your list",
    "userSkill": {
      "id": "user-skill-uuid",
      "userId": "user-uuid",
      "skillInterestId": "skill-uuid",
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

---

### 4. Update Skill Progress
```http
PATCH /api/skills-interests/my-skills/:skillInterestId
```

**Request Body** (all optional):
```json
{
  "status": "learning",
  "progress": 75,
  "notes": "Completed modules 1-6. Starting final project next week."
}
```

**Important Behaviors:**
- Setting status to "learning" automatically sets `startedAt` if not already set
- Setting status to "completed" automatically sets `completedAt` and progress to 100
- Progress must be 0-100

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Skill updated successfully",
    "userSkill": {
      "id": "user-skill-uuid",
      "status": "learning",
      "progress": 75,
      "notes": "Completed modules 1-6. Starting final project next week.",
      "updatedAt": "2026-02-08T10:00:00.000Z"
    }
  }
}
```

---

### 5. Remove Skill from List
```http
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

## Learning Resources

### 1. Get Resources for Skill
```http
GET /api/skills-interests/:skillId/resources
```

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "resource-uuid",
      "skillInterestId": "skill-uuid",
      "userId": "user-uuid",
      "title": "Python Crash Course",
      "url": "https://example.com/python-course",
      "type": "course",
      "description": "Comprehensive Python programming course for beginners",
      "difficulty": "beginner",
      "estimatedHours": 40,
      "isCompleted": 0,
      "createdAt": "2026-02-01T10:00:00.000Z",
      "updatedAt": "2026-02-08T10:00:00.000Z"
    },
    {
      "id": "resource-uuid-2",
      "skillInterestId": "skill-uuid",
      "userId": "user-uuid",
      "title": "Automate the Boring Stuff",
      "url": "https://automatetheboringstuff.com",
      "type": "book",
      "description": "Practical Python for total beginners",
      "difficulty": "beginner",
      "estimatedHours": 30,
      "isCompleted": 1,
      "createdAt": "2026-02-01T10:00:00.000Z",
      "updatedAt": "2026-02-08T10:00:00.000Z"
    }
  ]
}
```

**Resource Types:** article, video, course, book, tutorial, documentation, project, other

---

### 2. Add Resource to Skill
```http
POST /api/skills-interests/resources
```

**Request Body:**
```json
{
  "skillInterestId": "skill-uuid",
  "title": "Python for Data Science",
  "url": "https://example.com/python-data-science",
  "type": "course",
  "description": "Learn Python for data analysis and visualization",
  "difficulty": "intermediate",
  "estimatedHours": 60
}
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Resource added successfully",
    "resource": {
      "id": "resource-uuid",
      "skillInterestId": "skill-uuid",
      "userId": "user-uuid",
      "title": "Python for Data Science",
      "url": "https://example.com/python-data-science",
      "type": "course",
      "description": "Learn Python for data analysis and visualization",
      "difficulty": "intermediate",
      "estimatedHours": 60,
      "isCompleted": 0,
      "createdAt": "2026-02-08T10:00:00.000Z",
      "updatedAt": "2026-02-08T10:00:00.000Z"
    }
  }
}
```

---

### 3. Update Resource
```http
PUT /api/skills-interests/resources/:id
```

**Request Body:** Same as Add (all fields optional except skillInterestId)

---

### 4. Delete Resource
```http
DELETE /api/skills-interests/resources/:id
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Resource deleted successfully"
  }
}
```

---

## Skill Relationships

### 1. Get Related Skills
```http
GET /api/skills-interests/:skillId/related
```

Returns skills related to the given skill with relationship context.

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "skill-uuid-2",
      "name": "Machine Learning",
      "category": "programming",
      "description": "Learn ML algorithms and techniques",
      "difficulty": "advanced",
      "estimatedHours": 120,
      "tags": ["ml", "ai", "python"],
      "icon": "🤖",
      "relationshipType": "builds_on",
      "relationshipDescription": "Machine Learning builds upon Python fundamentals",
      "direction": "outgoing"
    },
    {
      "id": "skill-uuid-3",
      "name": "JavaScript",
      "category": "programming",
      "description": "Master JavaScript programming",
      "difficulty": "beginner",
      "estimatedHours": 60,
      "tags": ["javascript", "web"],
      "icon": "⚡",
      "relationshipType": "alternative",
      "relationshipDescription": "Alternative beginner programming language",
      "direction": "outgoing"
    }
  ]
}
```

**Relationship Types:**
- `prerequisite` - Required before learning another skill
- `related` - Complementary or related skills
- `builds_on` - Advanced skill building on basics
- `alternative` - Alternative approaches to similar goals

**Direction:**
- `outgoing` - Relationship points FROM this skill TO another
- `incoming` - Relationship points FROM another skill TO this one

---

### 2. Create Skill Relationship
```http
POST /api/skills-interests/relationships
```

**Request Body:**
```json
{
  "fromSkillId": "python-skill-uuid",
  "toSkillId": "ml-skill-uuid",
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
      "id": "relationship-uuid",
      "fromSkillId": "python-skill-uuid",
      "toSkillId": "ml-skill-uuid",
      "relationshipType": "prerequisite",
      "description": "Python is foundational for machine learning",
      "createdAt": "2026-02-08T10:00:00.000Z"
    }
  }
}
```

---

### 3. Delete Skill Relationship
```http
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

## Recommendations

### Get Personalized Recommendations
```http
GET /api/skills-interests/recommendations
```

Returns skill recommendations based on user's completed and learning skills.

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "skill-uuid",
      "name": "Machine Learning",
      "category": "programming",
      "description": "Learn ML algorithms, neural networks, and deep learning",
      "difficulty": "advanced",
      "estimatedHours": 120,
      "tags": ["ml", "ai", "data-science", "python"],
      "icon": "🤖",
      "recommendationReasons": [
        {
          "relationType": "builds_on",
          "description": "Builds upon your Python skills"
        }
      ]
    },
    {
      "id": "skill-uuid-2",
      "name": "Data Visualization",
      "category": "programming",
      "description": "Create compelling data visualizations",
      "difficulty": "intermediate",
      "estimatedHours": 40,
      "tags": ["visualization", "python", "data"],
      "icon": "📊",
      "recommendationReasons": [
        {
          "relationType": "related",
          "description": "Related to your data science interests"
        }
      ]
    }
  ]
}
```

---

## Common Use Cases

### Use Case 1: Browse and Add Skills
```javascript
// 1. Browse programming skills for beginners
const response = await fetch('/api/skills-interests?category=programming&difficulty=beginner');
const { data: skills } = await response.json();

// 2. Add a skill to learning list
await fetch('/api/skills-interests/my-skills', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    skillInterestId: skills[0].id,
    status: 'interested'
  })
});

// 3. Get updated skills list
const mySkillsRes = await fetch('/api/skills-interests/my-skills');
const { data: mySkills } = await mySkillsRes.json();
```

---

### Use Case 2: Track Learning Progress
```javascript
// 1. Start learning a skill
await fetch(`/api/skills-interests/my-skills/${skillId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    status: 'learning',
    progress: 10,
    notes: 'Started with basics'
  })
});

// 2. Update progress periodically
await fetch(`/api/skills-interests/my-skills/${skillId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    progress: 50,
    notes: 'Halfway through the course'
  })
});

// 3. Mark as completed
await fetch(`/api/skills-interests/my-skills/${skillId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    status: 'completed',
    notes: 'Finished all modules and built a project!'
  })
});
// Note: completedAt is automatically set and progress is set to 100
```

---

### Use Case 3: Discover Learning Path
```javascript
// 1. Get skill details
const skillRes = await fetch(`/api/skills-interests/${skillId}`);
const { data: skill } = await skillRes.json();

// 2. Get related skills (prerequisites, next steps)
const relatedRes = await fetch(`/api/skills-interests/${skillId}/related`);
const { data: relatedSkills } = await relatedRes.json();

// 3. Filter prerequisites
const prerequisites = relatedSkills.filter(
  s => s.relationshipType === 'prerequisite' && s.direction === 'incoming'
);

// 4. Filter what to learn next
const nextSteps = relatedSkills.filter(
  s => s.relationshipType === 'builds_on' && s.direction === 'outgoing'
);
```

---

### Use Case 4: Manage Learning Resources
```javascript
// 1. Get resources for a skill
const resourcesRes = await fetch(`/api/skills-interests/${skillId}/resources`);
const { data: resources } = await resourcesRes.json();

// 2. Add a new resource
await fetch('/api/skills-interests/resources', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    skillInterestId: skillId,
    title: 'Python Documentation',
    url: 'https://docs.python.org',
    type: 'documentation',
    description: 'Official Python documentation',
    difficulty: 'intermediate'
  })
});

// 3. Mark resource as completed
await fetch(`/api/skills-interests/resources/${resourceId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    isCompleted: 1
  })
});
```

---

### Use Case 5: Get Personalized Recommendations
```javascript
// 1. Get user's stats
const statsRes = await fetch('/api/skills-interests/my-skills/stats');
const { data: stats } = await statsRes.json();

// 2. Get recommendations
const recsRes = await fetch('/api/skills-interests/recommendations');
const { data: recommendations } = await recsRes.json();

// 3. Show recommendations with reasons
recommendations.forEach(skill => {
  console.log(`Recommended: ${skill.name}`);
  skill.recommendationReasons.forEach(reason => {
    console.log(`  - ${reason.description}`);
  });
});
```

---

## Error Handling

### Common Error Responses

**400 Bad Request - Skill Already Added:**
```json
{
  "success": false,
  "message": "Skill already added to your list",
  "code": "DUPLICATE_ENTRY"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "message": "Skill not found",
  "code": "NOT_FOUND"
}
```

**500 Internal Server Error:**
```json
{
  "success": false,
  "message": "Failed to update skill",
  "code": "INTERNAL_ERROR"
}
```

---

## Implementation Tips

### 1. Skills Catalog Page
- Use grid layout with skill cards
- Show icon, name, category, difficulty
- Filter dropdowns for category and difficulty
- Search bar with debounced input
- "Add to My List" button on hover
- Click card to see full details

### 2. My Skills Dashboard
```javascript
// Group skills by status
const groupedSkills = {
  learning: mySkills.filter(s => s.status === 'learning'),
  interested: mySkills.filter(s => s.status === 'interested'),
  completed: mySkills.filter(s => s.status === 'completed'),
  paused: mySkills.filter(s => s.status === 'paused')
};

// Show stats at top
<StatsCard>
  <Stat label="Total" value={stats.total} />
  <Stat label="Learning" value={stats.learning} />
  <Stat label="Completed" value={stats.completed} />
  <Stat label="Avg Progress" value={`${stats.avgProgress}%`} />
</StatsCard>

// Show skills by status
<SkillsSection title="Currently Learning">
  {groupedSkills.learning.map(skill => (
    <SkillCard key={skill.id}>
      <ProgressBar value={skill.progress} />
      <StatusSelector value={skill.status} onChange={updateStatus} />
    </SkillCard>
  ))}
</SkillsSection>
```

### 3. Skill Detail Page
- Show complete skill information
- Display progress tracker (if user is learning it)
- List all resources with links
- Show related skills graph/tree
- "Add to My List" or "Update Progress" button
- Notes textarea for personal observations

### 4. Learning Path Visualization
```javascript
// Build a skill graph
const buildSkillGraph = (skillId, relatedSkills) => {
  const nodes = [{ id: skillId, type: 'current' }];
  const edges = [];

  relatedSkills.forEach(skill => {
    nodes.push({ id: skill.id, name: skill.name, type: skill.relationshipType });

    if (skill.direction === 'outgoing') {
      edges.push({ from: skillId, to: skill.id, type: skill.relationshipType });
    } else {
      edges.push({ from: skill.id, to: skillId, type: skill.relationshipType });
    }
  });

  return { nodes, edges };
};

// Render with a graph library (e.g., react-flow, cytoscape)
```

### 5. Progress Tracking
- Use slider for progress (0-100)
- Auto-save on blur or after 1 second of no changes
- Show celebration animation on completion
- Display estimated time remaining based on progress and estimatedHours
- Show recent progress history (if tracking over time)

### 6. Resource Management
- Group resources by type (courses, books, videos, etc.)
- Show external link icon for URLs
- Mark completed resources with checkmark
- Filter/sort by difficulty, type, completion status
- Quick add form with URL, type, and description

---

## Data Models Reference

### Skill
```typescript
interface Skill {
  id: string;
  name: string;
  category: 'programming' | 'design' | 'business' | 'languages' | 'personal' | 'academic' | 'creative' | 'technical' | 'other';
  description?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  estimatedHours?: number;
  tags?: string[];
  icon?: string;
  createdAt: string;
  updatedAt: string;
}
```

### User Skill
```typescript
interface UserSkill {
  id: string;
  userId: string;
  skillInterestId: string;
  status: 'interested' | 'learning' | 'completed' | 'paused';
  progress: number; // 0-100
  notes?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  skill: Skill; // Populated in response
}
```

### Skill Resource
```typescript
interface SkillResource {
  id: string;
  skillInterestId: string;
  userId?: string;
  title: string;
  url?: string;
  type: 'article' | 'video' | 'course' | 'book' | 'tutorial' | 'documentation' | 'project' | 'other';
  description?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  estimatedHours?: number;
  isCompleted: 0 | 1;
  createdAt: string;
  updatedAt: string;
}
```

### Skill Relationship
```typescript
interface SkillRelationship {
  id: string;
  fromSkillId: string;
  toSkillId: string;
  relationshipType: 'prerequisite' | 'related' | 'builds_on' | 'alternative';
  description?: string;
  createdAt: string;
}
```

---

**Need Help?** Check the main API guide or contact the backend team.
