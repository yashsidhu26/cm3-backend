# Frontend Integration Guide: Brain Module

This guide explains how to connect your React/Tailwind frontend to the Brain Module backend.

## API Endpoints

All endpoints are prefixed with `/api/brain` and require authentication.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/graph` | Fetches all nodes and links for the current user. |
| `GET` | `/nodes/:id` | Fetches detailed info and sources for a specific node. |
| `POST` | `/nodes` | Adds a new interest node. |
| `POST` | `/links` | Connects two nodes. |
| `POST` | `/suggest` | Triggers AI generation for new "Allied Explorations". |
| `POST` | `/sources` | Connects a media source (YouTube, PDF) to a node. |
| `POST` | `/sources/:id/analyze` | Triggers summary & question generation for a source. |
| `POST` | `/sources/:id/ingest` | **[NEW]** Vector ingestion & Serendipity check. |
| `POST` | `/chat` | Interactive topic-aware chat. |
| `GET` | `/nodes/:id/explore` | Personalized "What's New" exploration. |

## Integrating with `react-force-graph-2d`

### 1. Fetching Graph Data
Map the backend response to the structure required by the graph library.

```typescript
const fetchGraphData = async () => {
  const response = await fetch('/api/brain/graph');
  const data = await response.json();
  
  // Backend returns { nodes: [...], links: [...] }
  // We need to map sourceId/targetId to source/target for the graph library
  return {
    nodes: data.nodes.map(node => ({
        ...node,
        id: node.id,
        name: node.name,
        val: node.val
    })),
    links: data.links.map(link => ({
        ...link,
        source: link.sourceId,
        target: link.targetId
    }))
  };
};
```

### 2. Styling Nodes based on Type
Use the `type` field from the backend (`core`, `niche`, `suggestion`) to style nodes as requested.

```tsx
<ForceGraph2D
  graphData={data}
  nodeCanvasObject={(node, ctx, globalScale) => {
    const label = node.name;
    const fontSize = 12/globalScale;
    ctx.font = `${fontSize}px Inter`;
    
    // Solid for core, semi-transparent for suggestion
    ctx.globalAlpha = node.type === 'suggestion' ? 0.5 : 1;
    
    // Draw sphere (circle)
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.val, 0, 2 * Math.PI, false);
    ctx.fillStyle = node.type === 'suggestion' ? '#71717a' : '#fafafa'; // Zinc-400 vs Zinc-50
    ctx.fill();
    
    // Label
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(label, node.x, node.y + node.val + fontSize);
  }}
  linkDash={link => link.dashed ? [2, 2] : null} // Dashed lines for suggestions
/>
```

## Implementing the Node Drawer

When a node is clicked, fetch its details and sources.

```typescript
const handleNodeClick = async (node) => {
  const response = await fetch(`/api/brain/nodes/${node.id}`);
  const details = await response.json();
  
  // Set these details to your Shadcn Drawer state
  setSelectedNodeDetails(details);
  setDrawerOpen(true);
};
```

### Source Icons (Lucide React)
Distinguish sources in the `Connected Sources` list using the `type` field:

- `youtube`: `<Youtube className="text-red-500" />`
- `drive`: `<FileText className="text-blue-500" />`
- `pinterest`: `<LayoutGrid className="text-pink-500" />`
- `link`: `<ExternalLink className="text-zinc-400" />`

## Triggering AI Suggestions

Use the FAB "Discover" button to trigger the suggestion engine.

```typescript
const handleDiscover = async () => {
  setLoading(true);
  const response = await fetch('/api/brain/suggest', { method: 'POST' });
  const newNodes = await response.json();
  
// Refresh graph data to see pulsing nodes appear
  refreshGraph();
  setLoading(false);
};
```

## Integrating Advanced Features

### 1. Source Analysis (One-tap Deep Dive)
When a user clicks a source in the list, trigger the analysis to get a summary and chat starters.

```typescript
const analyzeSource = async (sourceId) => {
  const response = await fetch(`/api/brain/sources/${sourceId}/analyze`, { method: 'POST' });
  const updatedSource = await response.json();
  
  // Use updatedSource.metadata.summary and updatedSource.metadata.questions
  setAnalysis(updatedSource.metadata);
};
```

### 2. Topic Chat
Use the pre-made questions as prompts for the chat option.

```typescript
const sendMessage = async (message, contextId, type) => {
  const response = await fetch('/api/brain/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, contextId, type }) // type can be 'node' or 'source'
  });
  const data = await response.json();
  // Display data.response in your chat window
};
```

### 3. "What's New to Explore"
Render this section at the bottom of the node detail drawer.

```typescript
const fetchExploration = async (nodeId) => {
  const response = await fetch(`/api/brain/nodes/${nodeId}/explore`);
  const data = await response.json();
  
  // data contains: whatsNew, recommendation, resources[]
  setExplorationData(data);
};
```

### 4. Universal Connector (Serendipity)
After connecting a source, call the ingest endpoint to find hidden connections.

```typescript
const ingestAndCheckSerendipity = async (sourceId) => {
  const response = await fetch(`/api/brain/sources/${sourceId}/ingest`, { method: 'POST' });
  const result = await response.json();
  
  if (result.serendipity) {
    // Show the "Serendipity" notification to the user
    toast.success(result.serendipity.notification, {
      description: result.serendipity.message,
      duration: 10000,
    });
  }
};
```
