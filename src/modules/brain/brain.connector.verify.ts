import { brainService } from './brain.service';
import { studentProfileService } from '../student-profile/student-profile.service';

/**
 * Verification script for Universal Connector & Serendipity
 */

async function verifyUniversalConnector() {
    console.log('🚀 Starting Universal Connector & Serendipity Verification...\n');

    const mockUserId = '00000000-0000-0000-0000-000000000001';

    try {
        // 1. Setup Node
        console.log('➕ Creating "Architecture" node...');
        const archNode = await brainService.addNode({
            userId: mockUserId,
            name: 'Architecture',
            type: 'core',
            val: 20
        });

        // 2. Connect Bauhaus Design (Existing)
        console.log('📝 Adding existing resource: "Bauhaus Design History"...');
        const bauhausSource = await brainService.connectSource({
            nodeId: archNode.id,
            type: 'google_drive',
            title: 'Bauhaus Design History',
            date: '3 years ago'
        });

        console.log('🧠 Ingesting Bauhaus into Vector DB...');
        await brainService.ingestSource(bauhausSource.id, mockUserId);
        console.log('✅ Bauhaus ingested\n');

        // 3. Connect Minimalist Architecture (New)
        console.log('📌 Adding new resource: "Minimalist Architecture Principles"...');
        const minimalistSource = await brainService.connectSource({
            nodeId: archNode.id,
            type: 'pinterest',
            title: 'Minimalist Architecture Principles',
            date: 'Just now'
        });

        console.log('🔍 Running Serendipity check for Minimalist Architecture...');
        const result = await brainService.ingestSource(minimalistSource.id, mockUserId);

        if (result.serendipity) {
            console.log('✨ SERENDIPITY FOUND!');
            console.log(`   Message: ${result.serendipity.message}`);
            console.log(`   Notification: ${result.serendipity.notification}\n`);
        } else {
            console.log('⚠️ No serendipity found. (Check if vectors are too different or similarity threshold is too high)\n');
        }

        console.log('✅ Universal Connector Verification Complete!');

    } catch (error) {
        console.error('\n❌ Verification failed:', error);
    }
}

if (require.main === module) {
    verifyUniversalConnector()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}
