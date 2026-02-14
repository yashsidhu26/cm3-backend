# Brain Module API Integration Guide

This guide details the API endpoints and data schemas for integrating with the Brain Module backend.

## Base Configuration

**Base URL**: `/api/brain`
**Authentication**: All endpoints require a Bearer token in the Authorization header.

## API Endpoints Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/graph` | Fetches the full knowledge graph (nodes + links). |
| `GET` | `/nodes/:id` | Fetches detailed info and sources for a specific node. |
| `POST` | `/nodes` | Adds a new manual interest node. |
| `POST` | `/links` | Connects two nodes manually. |
| `POST` | `/suggest` | Triggers AI generation for new "Allied Explorations". |
| `POST` | `/sources` | Connects a media source (YouTube, PDF, Link) to a node. |
| `POST` | `/sources/:id/analyze` | Triggers summary & question generation for a specific source. |
| `POST` | `/sources/:id/ingest` | Triggers vector ingestion & Serendipity check. |
| `POST` | `/chat` | Interactive topic-aware chat with node context. |
| `GET` | `/nodes/:id/explore` | Personalized "What's New" exploration data. |
| `POST` | `/sync/all` | **[NEW]** Syncs data from Skills, Academics, and Profile modules. |
| `POST` | `/sync/connections` | **[NEW]** Detects hidden cross-module connections. |

---

## Data Schemas & Examples

### 1. Brain Node Schema

Represents a single concept, skill, course, or event in the knowledge graph.

```json
{
  "id": "uuid-string",
  "userId": "uuid-string",
  "name": "Python Programming",
  "type": "core", // Options: "core", "niche", "suggestion"
  "val": 15, // Visual weight/size
  "metadata": {
    "summary": "Intermediate level Python skills",
    "sourceModule": "skills-interests", // Origin module
    "sourceEntityId": "original-skill-id"
  },
  "createdAt": "2024-02-08T12:00:00Z"
}
```

### 2. Brain Link Schema

Represents a connection between two nodes.

```json
{
  "id": "uuid-string",
  "sourceId": "node-uuid-1", // ID of the source node
  "targetId": "node-uuid-2", // ID of the target node
  "dashed": false, // true = suggested/weak link, false = solid/strong link
  "userId": "uuid-string"
}
```

### 3. Brain Source Schema

Represents an attached resource (PDF, Video, Link).

```json
{
  "id": "uuid-string",
  "nodeId": "node-uuid", // Parent node ID
  "type": "youtube", // Options: "youtube", "drive", "link", "pinterest", "goodreads"
  "title": "Introduction to Python",
  "url": "https://youtube.com/watch?v=...",
  "metadata": {
    "description": "Video tutorial",
    "summary": "Generated summary of the content...",
    "questions": ["What is a list comprehension?", "How do decorators work?"],
    "sourceModule": "academics"
  }
}
```

---

## Example API Responses

### GET `/graph`

Returns the complete graph structure for visualization.

```json
{
  "nodes": [
    {
      "id": "123",
      "name": "Machine Learning",
      "type": "core",
      "val": 20,
      "metadata": { "sourceModule": "academics" }
    },
    {
      "id": "456",
      "name": "Data Science",
      "type": "niche",
      "val": 10,
      "metadata": { "sourceModule": "skills-interests" }
    }
  ],
  "links": [
    {
      "id": "789",
      "sourceId": "123",
      "targetId": "456",
      "dashed": false
    }
  ]
}
```

### POST `/sync/all`

Triggers a full synchronization from external modules.

```json
{
  "totalNodesCreated": 5,
  "totalSourcesCreated": 12,
  "connections": {
    "linksCreated": 3
  },
  "skills": { "nodesCreated": 2, "sourcesCreated": 5 },
  "courses": { "nodesCreated": 3, "sourcesCreated": 7 },
  "experiences": { "nodesCreated": 0 },
  "events": { "nodesCreated": 0 }
}
```

### GET `/nodes/:id/explore`

Returns personalized suggestions and resources.

```json
{
  "whatsNew": "Recent developments in this field include...",
  "recommendation": "Based on your interest in X, you should check out Y.",
  "resources": [
    {
      "title": "Advanced Tutorial",
      "url": "https://example.com/tutorial",
      "description": "Deep dive into the subject."
    }
  ]
}
```
