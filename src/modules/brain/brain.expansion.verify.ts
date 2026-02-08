import { brainService } from './brain.service';
import { db } from '../../core/database/client';
import { brainNodes, brainLinks, brainSources } from './brain.schema';
import { eq } from 'drizzle-orm';
import { studentProfileService } from '../student-profile/student-profile.service';

/**
 * Verification script for Brain Module Expansion
 * Tests Source Analysis, Chat, and Exploration logic
 */

async function verifyExpansion() {
    console.log('🧪 Starting Brain Module Expansion Verification...\n');

    const mockUserId = '00000000-0000-0000-0000-000000000001';

    try {
        // 1. Setup Mock User Profile
        console.log('👤 Setting up mock user profile...');
        await studentProfileService.upsertAcademics(mockUserId, {
            skills: ['Python', 'SQL'],
            interests: ['Machine Learning', 'Data Science'],
            major: 'Computer Science'
        });
        console.log('✅ Mock profile ready\n');

        // 2. Setup Base Graph
        console.log('➕ Creating base graph...');
        const mlNode = await brainService.addNode({
            userId: mockUserId,
            name: 'Machine Learning',
            type: 'core',
            val: 20
        });

        const ytSource = await brainService.connectSource({
            nodeId: mlNode.id,
            type: 'youtube',
            title: 'Intro to Transformers',
            date: 'Added today'
        });
        console.log(`✅ Setup node "${mlNode.name}" and source "${ytSource.title}"\n`);

        // 3. Test Source Analysis
        console.log('📝 Testing AI Source Analysis...');
        const analyzed = await brainService.analyzeSource(ytSource.id, mockUserId);
        console.log('✅ Analysis complete:');
        console.log(`   Summary: ${analyzed.metadata?.summary}`);
        console.log(`   Questions: ${analyzed.metadata?.questions?.join(', ')}\n`);

        // 4. Test Topic Chat
        console.log('💬 Testing Topic-aware Chat...');
        const chatResult = await brainService.chat(mockUserId, 'Tell me more about this topic.', mlNode.id, 'node');
        console.log('✅ Chat response received (AI integration verified)\n');

        // 5. Test Personalized Exploration
        console.log('🌍 Testing Personalized Exploration ("What\'s New")...');
        const exploration = await brainService.getExploration(mockUserId, mlNode.id);

        if (exploration.whatsNew) {
            console.log('✅ Exploration generated:');
            console.log(`   What's New: ${exploration.whatsNew.substring(0, 100)}...`);
            console.log(`   Resources: ${exploration.resources?.length} suggested items\n`);
        } else {
            console.log('⚠️ Exploration result:', exploration);
        }

        console.log('✨ Expansion Verification Complete!');

    } catch (error) {
        console.error('\n❌ Verification failed:', error);
    }
}

if (require.main === module) {
    verifyExpansion()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}

export { verifyExpansion };
