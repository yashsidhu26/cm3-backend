import { brainService } from './brain.service';
import { db } from '../../core/database/client';
import { brainNodes, brainLinks, brainSources } from './brain.schema';
import { eq } from 'drizzle-orm';

/**
 * Verification script for Brain Service
 * This script populates mock data and tests service methods
 */

async function verifyBrainService() {
    console.log('🧪 Starting Brain Service Verification...\n');

    // Use a mock user ID for testing (replace with a real one if needed)
    const mockUserId = '00000000-0000-0000-0000-000000000001';

    try {
        // 1. Cleanup existing mock data
        console.log('🧹 Cleaning up mock data...');
        await db.delete(brainNodes).where(eq(brainNodes.userId, mockUserId));
        console.log('✅ Cleanup complete\n');

        // 2. Add Core Nodes
        console.log('➕ Adding core nodes...');
        const mlNode = await brainService.addNode({
            userId: mockUserId,
            name: 'Machine Learning',
            type: 'core',
            val: 20,
            metadata: { summary: 'Computational statistics and pattern recognition' }
        });
        console.log(`✅ Added: ${mlNode.name}`);

        const philoNode = await brainService.addNode({
            userId: mockUserId,
            name: 'Philosophy',
            type: 'core',
            val: 20,
            metadata: { summary: 'Study of fundamental nature of knowledge and reality' }
        });
        console.log(`✅ Added: ${philoNode.name}`);

        // 3. Add Niche Nodes
        console.log('\n➕ Adding niche nodes...');
        const causalNode = await brainService.addNode({
            userId: mockUserId,
            name: 'Causal Inference',
            type: 'niche',
            val: 10,
        });
        console.log(`✅ Added: ${causalNode.name}`);

        // 4. Add Links
        console.log('\n🔗 Adding links...');
        await brainService.addLink({
            userId: mockUserId,
            sourceId: mlNode.id,
            targetId: causalNode.id,
        });
        console.log(`✅ Linked: ${mlNode.name} -> ${causalNode.name}`);

        // 5. Connect Sources
        console.log('\n📱 Connecting sources...');
        const ytSource = await brainService.connectSource({
            nodeId: mlNode.id,
            type: 'youtube',
            title: 'Neural Networks from Scratch',
            date: 'Watched 2 days ago',
            metadata: { viewCount: '1.2M' }
        });
        console.log(`✅ Connected: ${ytSource.title} to ${mlNode.name}`);

        // 6. Test Graph Retrieval
        console.log('\n📊 Testing graph data retrieval...');
        const graphData = await brainService.getGraphData(mockUserId);
        console.log(`✅ Retrieved ${graphData.nodes.length} nodes and ${graphData.links.length} links`);

        // 7. Test Node Details
        console.log('\n📝 Testing node details retrieval...');
        const details = await brainService.getNodeDetails(mlNode.id);
        console.log(`✅ Node: ${details.name}, Sources: ${details.sources.length}`);

        // 8. Test AI Suggestions (Mocking context)
        console.log('\n🤖 Testing AI suggestion generation...');
        console.log('(This requires GROQ_API_KEY or GEMINI_API_KEY in .env)');
        const suggestions = await brainService.generateSuggestions(mockUserId);

        if (Array.isArray(suggestions)) {
            console.log(`✅ Generated ${suggestions.length} suggestions:`);
            suggestions.forEach(s => console.log(`   - ${s.name} (${s.type})`));
        } else {
            console.log('⚠️ AI Suggestion result:', suggestions);
        }

        console.log('\n✨ Brain Service Verification Complete!');

    } catch (error) {
        console.error('\n❌ Verification failed:', error);
    }
}

// Run the verification if this script is executed directly
if (require.main === module) {
    verifyBrainService()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}

export { verifyBrainService };
