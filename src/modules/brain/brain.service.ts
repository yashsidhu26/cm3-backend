import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../core/database/client';
import { brainNodes, brainLinks, brainSources, type BrainNode, type BrainLink, type BrainSource, type NewBrainNode, type NewBrainLink, type NewBrainSource } from './brain.schema';
import { aiIntegrationService } from '../ai-integration/ai-integration.service';
import { studentProfileService } from '../student-profile/student-profile.service';
import { vectorDbService } from './vector-db.service';

export class BrainService {
    /**
     * Fetch complete graph data for a user
     */
    async getGraphData(userId: string) {
        const [nodes, links] = await Promise.all([
            db.query.brainNodes.findMany({
                where: eq(brainNodes.userId, userId),
            }),
            db.query.brainLinks.findMany({
                where: eq(brainLinks.userId, userId),
            }),
        ]);

        return { nodes, links };
    }

    /**
     * Fetch detailed node information including connected sources
     */
    async getNodeDetails(nodeId: string) {
        const node = await db.query.brainNodes.findFirst({
            where: eq(brainNodes.id, nodeId),
            with: {
                sources: true,
            },
        });

        if (!node) throw new Error('Node not found');
        return node;
    }

    /**
     * Add a new node to the brain
     */
    async addNode(data: NewBrainNode) {
        const [node] = await db.insert(brainNodes).values(data).returning();
        return node;
    }

    /**
     * Add a connection between two nodes
     */
    async addLink(data: NewBrainLink) {
        const [link] = await db.insert(brainLinks).values(data).returning();
        return link;
    }

    /**
     * Connect a source/file to a node
     */
    async connectSource(data: NewBrainSource) {
        const [source] = await db.insert(brainSources).values(data).returning();
        return source;
    }

    /**
     * Generate AI-driven "Allied Explorations"
     * Analyzes existing core nodes and suggests new niches
     */
    async generateSuggestions(userId: string) {
        // 1. Fetch existing core nodes to understand context
        const existingNodes = await db.query.brainNodes.findMany({
            where: and(
                eq(brainNodes.userId, userId),
                eq(brainNodes.type, 'core')
            ),
        });

        if (existingNodes.length === 0) {
            return { message: 'Add some core interests first' };
        }

        const context = existingNodes.map(n => n.name).join(', ');
        const prompt = `Based on my core interests in ${context}, suggest 3 "Allied Explorations". 
    For each exploration, provide:
    1. Name (a specific niche or concept)
    2. Summary (why it's relevant to my current interests)
    3. Connection (which of my core interests it connects most closely to)
    Format as JSON array: [{ name, summary, connectedToNodeName }]`;

        const aiResponse = await aiIntegrationService.processQuery(userId, prompt, [], 'fast', 'json');

        let suggestions;
        try {
            // Parse the response - AIIntegrationService might return different structures depending on the model
            const content = typeof aiResponse.response === 'string' ? JSON.parse(aiResponse.response) : aiResponse.response;
            suggestions = content.suggestions || content;
        } catch (e) {
            console.error('Failed to parse AI suggestions:', e);
            return { error: 'Failed to generate suggestions' };
        }

        // 2. Map and save suggestions as new nodes with dashed links
        const suggestionResults = [];

        for (const sug of suggestions) {
            // Create suggestion node
            const [newNode] = await db.insert(brainNodes).values({
                userId,
                name: sug.name,
                type: 'suggestion',
                val: 8,
                metadata: {
                    summary: sug.summary,
                }
            }).returning();

            // Find the parent node to create a link
            const parentNode = existingNodes.find(n => n.name.toLowerCase().includes(sug.connectedToNodeName.toLowerCase()));

            if (parentNode) {
                await db.insert(brainLinks).values({
                    userId,
                    sourceId: parentNode.id,
                    targetId: newNode.id,
                    dashed: true,
                });
            }

            suggestionResults.push(newNode);
        }

        return suggestionResults;
    }

    /**
     * AI-generated summary and pre-made questions for a specific source
     */
    async analyzeSource(sourceId: string, userId: string) {
        const source = await db.query.brainSources.findFirst({
            where: eq(brainSources.id, sourceId),
        });

        if (!source) throw new Error('Source not found');

        // Return cached analysis if available
        if (source.metadata?.summary && source.metadata?.questions) {
            return source;
        }

        const prompt = `Analyze this resource: "${source.title}" (${source.type}).
    Provide:
    1. A 3-sentence summary of what this is likely about.
    2. 3 thought-provoking questions that I can ask you to understand this better.
    Format as JSON: { "summary": "...", "questions": ["...", "...", "..."] }`;

        const aiResponse = await aiIntegrationService.processQuery(userId, prompt, [], 'fast', 'json');

        try {
            const content = typeof aiResponse.response === 'string' ? JSON.parse(aiResponse.response) : aiResponse.response;
            const analysis = content;

            // Update source metadata
            const [updated] = await db.update(brainSources)
                .set({
                    metadata: {
                        ...source.metadata,
                        summary: analysis.summary,
                        questions: analysis.questions,
                    },
                    updatedAt: new Date()
                })
                .where(eq(brainSources.id, sourceId))
                .returning();

            return updated;
        } catch (e) {
            console.error('Failed to parse source analysis:', e);
            return source;
        }
    }

    /**
     * Topic-aware chat with AI about a specific interest or source
     */
    async chat(userId: string, message: string, contextId: string, type: 'node' | 'source') {
        let contextStr = '';

        if (type === 'node') {
            const node = await db.query.brainNodes.findFirst({ where: eq(brainNodes.id, contextId) });
            contextStr = node ? `Topic: ${node.name}. Summary: ${node.metadata?.summary || 'N/A'}` : '';
        } else {
            const source = await db.query.brainSources.findFirst({ where: eq(brainSources.id, contextId) });
            contextStr = source ? `Source: ${source.title}. Summary: ${source.metadata?.summary || 'N/A'}` : '';
        }

        const prompt = `You are a helpful co-thinker for my Second Brain.
    Current context: ${contextStr}
    
    User Query: ${message}`;

        // Get chat history from AIIntegrationService
        const history = await aiIntegrationService.getConversationHistory(userId, 5);

        return await aiIntegrationService.processQuery(userId, prompt, history, 'auto');
    }

    /**
     * "What's New to Explore" - Personalized recommendations based on user profile and topic
     */
    async getExploration(userId: string, nodeId: string) {
        const [node, dashboard] = await Promise.all([
            db.query.brainNodes.findFirst({ where: eq(brainNodes.id, nodeId) }),
            studentProfileService.getDashboardData(userId)
        ]);

        if (!node) throw new Error('Node not found');

        const profileContext = `My skills: ${dashboard.academics?.skills?.join(', ') || 'N/A'}. 
    Experience Level: ${dashboard.academics?.major || 'Student'}.
    Interests: ${dashboard.academics?.interests?.join(', ') || 'N/A'}.`;

        const prompt = `Based on my current interest in "${node.name}" and my profile:
    ${profileContext}
    
    Please provide:
    1. "What's New to Explore": Latest trends, news, or updates in this specific sector.
    2. Recommendations: Why this is relevant to my current level and interests.
    3. Suggested Resources: A list of 3 resources (books, papers, videos, or tools) to explore with a brief description for each.
    
    Format as JSON: {
      "whatsNew": "...",
      "recommendation": "...",
      "resources": [{ "title": "...", "description": "...", "url": "..." }]
    }`;

        const aiResponse = await aiIntegrationService.processQuery(userId, prompt, [], 'fast', 'json');

        try {
            return typeof aiResponse.response === 'string' ? JSON.parse(aiResponse.response) : aiResponse.response;
        } catch (e) {
            console.error('Failed to parse exploration response:', e);
            return { error: 'Failed to generate exploration' };
        }
    }

    /**
     * Universal Connector Ingestion: Generates vector and checks for serendipity
     */
    async ingestSource(sourceId: string, userId: string) {
        const vector = await vectorDbService.generateSourceEmbedding(sourceId);
        return await this.checkSerendipity(userId, sourceId, vector);
    }

    /**
     * Serendipity Engine: Finds highly related items (>90% similarity)
     */
    async checkSerendipity(userId: string, sourceId: string, vector: number[]) {
        const potentialConnections = await vectorDbService.findSimilarSources(userId, vector, sourceId, 0.9);

        if (potentialConnections.length === 0) return { serendipity: null };

        const topMatch = potentialConnections[0];
        const percentage = Math.round(topMatch.similarity * 100);

        const message = `Serendipity Found! Your new resource is ${percentage}% related to your other resource "${topMatch.source.title}" in "${topMatch.source.node.name}".`;

        return {
            serendipity: {
                match: topMatch.source,
                percentage,
                message,
                notification: `You just saved something about '${topMatch.source.node.name}.' Did you know you have a related resource about '${topMatch.source.title}'? They are ${percentage}% related.`
            }
        };
    }
}

export const brainService = new BrainService();
