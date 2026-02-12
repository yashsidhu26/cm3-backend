import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../core/database/client';
import { brainNodes, brainLinks, brainSources, type BrainNode, type BrainLink, type BrainSource, type NewBrainNode, type NewBrainLink, type NewBrainSource } from './brain.schema';
import { aiIntegrationService } from '../ai-integration/ai-integration.service';
import { studentProfileService } from '../student-profile/student-profile.service';
import { vectorDbService } from './vector-db.service';
import { skillsInterestsService } from '../skills-interests/skills-interests.service';
import { academicsService } from '../academics/academics.service';
import { studentAcademics, studentExperiences, campusEvents } from '../student-profile/student-profile.schema';

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

    /**
     * Sync Skills and Interests from skills-interests module
     */
    async syncSkillsAndInterests(userId: string) {
        const userSkills = await skillsInterestsService.getUserSkills(userId);

        let nodesCreated = 0;
        let sourcesCreated = 0;
        const nodeIds: string[] = [];

        for (const userSkill of userSkills) {
            // Check if node already exists
            const existing = await db.query.brainNodes.findFirst({
                where: and(
                    eq(brainNodes.userId, userId),
                    eq(brainNodes.metadata, { sourceModule: 'skills-interests', sourceEntityId: userSkill.id } as any)
                )
            });

            if (existing) {
                nodeIds.push(existing.id);
                continue;
            }

            // Determine node type based on status
            let nodeType: 'core' | 'niche' | 'suggestion' = 'niche';
            if (userSkill.status === 'learning' || userSkill.status === 'completed') {
                nodeType = 'core';
            }

            // Create brain node
            const node = await this.addNode({
                userId,
                name: userSkill.skillInterest.name,
                type: nodeType,
                val: userSkill.progress ? Math.max(10, Math.floor(userSkill.progress / 5)) : 10,
                metadata: {
                    summary: userSkill.skillInterest.description || undefined,
                    sourceModule: 'skills-interests',
                    sourceEntityId: userSkill.id,
                }
            });

            nodesCreated++;
            nodeIds.push(node.id);

            // Fetch and attach resources
            const resources = await skillsInterestsService.getSkillResources(userSkill.skillInterestId);

            for (const resource of resources) {
                await this.connectSource({
                    nodeId: node.id,
                    type: this.mapResourceType(resource.type),
                    title: resource.title,
                    url: resource.url || undefined,
                    metadata: {
                        description: resource.description || undefined,
                        sourceModule: 'skills-interests',
                        sourceEntityId: resource.id,
                    }
                });
                sourcesCreated++;
            }
        }

        return { nodesCreated, sourcesCreated, nodeIds };
    }

    /**
     * Sync Courses from academics module
     */
    async syncCourses(userId: string) {
        const userCourses = await academicsService.getUserCoursesWithFullDetails(userId);

        let nodesCreated = 0;
        let sourcesCreated = 0;
        const nodeIds: string[] = [];

        for (const enrollment of userCourses) {
            const course = enrollment as any; // The method returns courses directly with enrollment nested

            // Check if node already exists
            const existing = await db.query.brainNodes.findFirst({
                where: and(
                    eq(brainNodes.userId, userId),
                    eq(brainNodes.metadata, { sourceModule: 'academics', sourceEntityId: course.id } as any)
                )
            });

            if (existing) {
                nodeIds.push(existing.id);
                continue;
            }

            // Create brain node for course
            const node = await this.addNode({
                userId,
                name: `${course.code}: ${course.name}`,
                type: 'core',
                val: 15,
                metadata: {
                    summary: course.description || `${course.name} taught by ${course.professorName || 'TBA'}`,
                    sourceModule: 'academics',
                    sourceEntityId: course.id,
                }
            });

            nodesCreated++;
            nodeIds.push(node.id);

            // Fetch and attach course resources
            const resources = await academicsService.getCourseResources(course.id);

            for (const resource of resources) {
                await this.connectSource({
                    nodeId: node.id,
                    type: resource.type === 'pdf' ? 'drive' : resource.type === 'video' ? 'youtube' : 'link',
                    title: resource.title,
                    url: resource.url,
                    metadata: {
                        description: `Course material: ${resource.type}`,
                        sourceModule: 'academics',
                        sourceEntityId: resource.id,
                    }
                });
                sourcesCreated++;
            }
        }

        return { nodesCreated, sourcesCreated, nodeIds };
    }

    /**
     * Sync Experiences from student-profile module
     */
    async syncExperiences(userId: string) {
        const experiences = await db.query.studentExperiences.findMany({
            where: eq(studentExperiences.userId, userId)
        });

        let nodesCreated = 0;
        let linksCreated = 0;
        const nodeIds: string[] = [];

        for (const experience of experiences) {
            // Check if node already exists
            const existing = await db.query.brainNodes.findFirst({
                where: and(
                    eq(brainNodes.userId, userId),
                    eq(brainNodes.metadata, { sourceModule: 'student-profile', sourceEntityId: experience.id } as any)
                )
            });

            if (existing) {
                nodeIds.push(existing.id);
                continue;
            }

            // Create brain node for experience
            const node = await this.addNode({
                userId,
                name: experience.title,
                type: 'niche',
                val: 12,
                metadata: {
                    summary: `${experience.role || 'Experience'} at ${experience.organization || 'Organization'}: ${experience.description || ''}`,
                    sourceModule: 'student-profile',
                    sourceEntityId: experience.id,
                }
            });

            nodesCreated++;
            nodeIds.push(node.id);

            // Create links to skill nodes if skills were used
            if (experience.skillsUsed && experience.skillsUsed.length > 0) {
                const skillNodes = await db.query.brainNodes.findMany({
                    where: and(
                        eq(brainNodes.userId, userId),
                        eq(brainNodes.metadata, { sourceModule: 'skills-interests' } as any)
                    )
                });

                for (const skillName of experience.skillsUsed) {
                    const matchingSkillNode = skillNodes.find(sn =>
                        sn.name.toLowerCase().includes(skillName.toLowerCase())
                    );

                    if (matchingSkillNode) {
                        await this.addLink({
                            userId,
                            sourceId: node.id,
                            targetId: matchingSkillNode.id,
                            dashed: false,
                        });
                        linksCreated++;
                    }
                }
            }
        }

        return { nodesCreated, linksCreated, nodeIds };
    }

    /**
     * Sync Campus Events from student-profile module
     */
    async syncCampusEvents(userId: string) {
        const events = await db.query.campusEvents.findMany({
            where: and(
                eq(campusEvents.userId, userId),
                eq(campusEvents.isInterested, true)
            )
        });

        let nodesCreated = 0;
        const nodeIds: string[] = [];

        for (const event of events) {
            // Check if node already exists
            const existing = await db.query.brainNodes.findFirst({
                where: and(
                    eq(brainNodes.userId, userId),
                    eq(brainNodes.metadata, { sourceModule: 'student-profile', sourceEntityId: event.id } as any)
                )
            });

            if (existing) {
                nodeIds.push(existing.id);
                continue;
            }

            // Create suggestion node for event
            const node = await this.addNode({
                userId,
                name: event.title,
                type: 'suggestion',
                val: 8,
                metadata: {
                    summary: `${event.type} event: ${event.description || 'Campus event'}`,
                    sourceModule: 'student-profile',
                    sourceEntityId: event.id,
                }
            });

            nodesCreated++;
            nodeIds.push(node.id);
        }

        return { nodesCreated, nodeIds };
    }

    /**
     * Sync all module data at once
     */
    async syncAll(userId: string) {
        const results = {
            skills: await this.syncSkillsAndInterests(userId),
            courses: await this.syncCourses(userId),
            experiences: await this.syncExperiences(userId),
            events: await this.syncCampusEvents(userId),
        };

        // Detect cross-module connections
        const connections = await this.detectCrossModuleConnections(userId);

        return {
            ...results,
            connections,
            totalNodesCreated:
                results.skills.nodesCreated +
                results.courses.nodesCreated +
                results.experiences.nodesCreated +
                results.events.nodesCreated,
            totalSourcesCreated:
                results.skills.sourcesCreated +
                results.courses.sourcesCreated,
        };
    }

    /**
     * Detect and create cross-module connections
     */
    async detectCrossModuleConnections(userId: string) {
        let linksCreated = 0;

        // Get all user nodes
        const allNodes = await db.query.brainNodes.findMany({
            where: eq(brainNodes.userId, userId)
        });

        // Get user's academic data for skill matching
        const academicData = await db.query.studentAcademics.findFirst({
            where: eq(studentAcademics.userId, userId)
        });

        if (!academicData) return { linksCreated };

        // Match courses to skills based on course description/name
        const courseNodes = allNodes.filter(n => n.metadata?.sourceModule === 'academics');
        const skillNodes = allNodes.filter(n => n.metadata?.sourceModule === 'skills-interests');

        for (const course of courseNodes) {
            for (const skill of skillNodes) {
                // Simple keyword matching
                const courseName = course.name.toLowerCase();
                const skillName = skill.name.toLowerCase();

                if (courseName.includes(skillName) || skillName.includes(courseName)) {
                    // Check if link already exists
                    const existingLink = await db.query.brainLinks.findFirst({
                        where: and(
                            eq(brainLinks.userId, userId),
                            eq(brainLinks.sourceId, course.id),
                            eq(brainLinks.targetId, skill.id)
                        )
                    });

                    if (!existingLink) {
                        await this.addLink({
                            userId,
                            sourceId: course.id,
                            targetId: skill.id,
                            dashed: false,
                        });
                        linksCreated++;
                    }
                }
            }
        }

        // Match interests to courses
        if (academicData.interests) {
            for (const interest of academicData.interests) {
                const interestLower = interest.toLowerCase();

                for (const course of courseNodes) {
                    const courseName = course.name.toLowerCase();

                    if (courseName.includes(interestLower)) {
                        // Find or create interest node
                        let interestNode = allNodes.find(n =>
                            n.name.toLowerCase() === interestLower &&
                            n.metadata?.sourceModule !== 'academics'
                        );

                        if (!interestNode) {
                            interestNode = await this.addNode({
                                userId,
                                name: interest,
                                type: 'niche',
                                val: 10,
                                metadata: {
                                    summary: 'User interest',
                                }
                            });
                        }

                        // Check if link already exists
                        const existingLink = await db.query.brainLinks.findFirst({
                            where: and(
                                eq(brainLinks.userId, userId),
                                eq(brainLinks.sourceId, interestNode.id),
                                eq(brainLinks.targetId, course.id)
                            )
                        });

                        if (!existingLink) {
                            await this.addLink({
                                userId,
                                sourceId: interestNode.id,
                                targetId: course.id,
                                dashed: true,
                            });
                            linksCreated++;
                        }
                    }
                }
            }
        }

        return { linksCreated };
    }

    /**
     * Helper: Map resource type from skills-interests to brain source type
     */
    private mapResourceType(type: string): 'youtube' | 'drive' | 'pinterest' | 'goodreads' | 'link' {
        const mapping: Record<string, 'youtube' | 'drive' | 'pinterest' | 'goodreads' | 'link'> = {
            'video': 'youtube',
            'course': 'link',
            'book': 'goodreads',
            'article': 'link',
            'tutorial': 'youtube',
            'documentation': 'link',
            'project': 'link',
            'other': 'link',
        };
        return mapping[type] || 'link';
    }
}

export const brainService = new BrainService();
