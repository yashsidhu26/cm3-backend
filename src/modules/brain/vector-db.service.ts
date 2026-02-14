import { geminiClient } from '../ai-integration/gemini-client';
import { db } from '../../core/database/client';
import { brainSources, brainNodes } from './brain.schema';
import { eq, and, ne } from 'drizzle-orm';

export class VectorDbService {
    /**
     * Calculate Cosine Similarity between two vectors
     */
    cosineSimilarity(vecA: number[], vecB: number[]): number {
        if (vecA.length !== vecB.length) return 0;

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }

        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Find similar sources for a user given a target vector
     */
    async findSimilarSources(userId: string, targetVector: number[], excludeSourceId?: string, threshold = 0.8) {
        const allSources = await db.query.brainSources.findMany({
            with: {
                node: true,
            }
        });

        const results = allSources
            .filter(s => s.vector && s.node.userId === userId && s.id !== excludeSourceId)
            .map(s => ({
                source: s,
                similarity: this.cosineSimilarity(targetVector, s.vector as number[])
            }))
            .filter(r => r.similarity >= threshold)
            .sort((a, b) => b.similarity - a.similarity);

        return results;
    }

    /**
     * Generate embedding for a source
     */
    async generateSourceEmbedding(sourceId: string) {
        const source = await db.query.brainSources.findFirst({
            where: eq(brainSources.id, sourceId),
            with: { node: true }
        });

        if (!source) throw new Error('Source not found');

        const textToEmbed = `${source.title} ${source.metadata?.summary || ''} ${source.node.name}`;
        const vector = await geminiClient.embedText(textToEmbed);

        await db.update(brainSources)
            .set({ vector })
            .where(eq(brainSources.id, sourceId));

        return vector;
    }
}

export const vectorDbService = new VectorDbService();
