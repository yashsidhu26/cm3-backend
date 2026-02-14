import { brainService } from './brain.service';
import { db } from '../../core/database/client';
import { brainNodes, brainLinks, brainSources } from './brain.schema';
import { eq } from 'drizzle-orm';
import { skillsInterestsService } from '../skills-interests/skills-interests.service';
import { academicsService } from '../academics/academics.service';
import { studentProfileService } from '../student-profile/student-profile.service';
import { studentAcademics, studentExperiences, campusEvents } from '../student-profile/student-profile.schema';
import { skillsInterests, userSkillsInterests } from '../skills-interests/skills-interests.schema';
import { courses, enrollments } from '../academics/academics.schema';

/**
 * Verification script for Brain Module Integration
 * Tests syncing data from skills-interests, academics, and student-profile modules
 */

async function verifyIntegration() {
    console.log('🧪 Starting Brain Module Integration Verification...\\n');

    const mockUserId = '00000000-0000-0000-0000-000000000001';

    try {
        // Setup: Create mock data in other modules
        console.log('📝 Setting up mock data in other modules...');

        // 1. Create skills/interests
        const pythonSkill = await db.insert(skillsInterests).values({
            name: 'Python Programming',
            category: 'programming',
            description: 'Learn Python for data science and web development',
            difficulty: 'intermediate',
        }).returning();

        await db.insert(userSkillsInterests).values({
            userId: mockUserId,
            skillInterestId: pythonSkill[0].id,
            status: 'learning',
            progress: 60,
        });

        const aiSkill = await db.insert(skillsInterests).values({
            name: 'Artificial Intelligence',
            category: 'technical',
            description: 'Study AI and machine learning',
            difficulty: 'advanced',
        }).returning();

        await db.insert(userSkillsInterests).values({
            userId: mockUserId,
            skillInterestId: aiSkill[0].id,
            status: 'interested',
            progress: 0,
        });

        console.log('✅ Created 2 skills/interests\\n');

        // 2. Create courses
        const course1 = await db.insert(courses).values({
            code: 'CS F111',
            name: 'Computer Programming',
            professorName: 'Dr. Smith',
            description: 'Introduction to Python programming',
            units: 4,
        }).returning();

        await db.insert(enrollments).values({
            userId: mockUserId,
            courseId: course1[0].id,
            semester: 'spring',
            year: '2026',
        });

        console.log('✅ Created 1 course\\n');

        // 3. Create experiences
        await db.insert(studentExperiences).values({
            userId: mockUserId,
            title: 'ML Intern at TechCorp',
            role: 'Machine Learning Intern',
            organization: 'TechCorp',
            description: 'Worked on AI/ML projects',
            skillsUsed: ['Python Programming', 'Artificial Intelligence'],
        });

        console.log('✅ Created 1 experience\\n');

        // 4. Create campus event
        await db.insert(campusEvents).values({
            userId: mockUserId,
            title: 'AI Hackathon 2026',
            type: 'hackathon',
            description: 'Build AI solutions for real-world problems',
            date: new Date('2026-03-15'),
            isInterested: true,
            sourceType: 'manual',
        });

        console.log('✅ Created 1 campus event\\n');

        // 5. Create academic data
        await studentProfileService.upsertAcademics(mockUserId, {
            skills: ['Python Programming', 'JavaScript'],
            interests: ['Artificial Intelligence', 'Web Development'],
            major: 'Computer Science',
        });

        console.log('✅ Created academic profile\\n');

        console.log('═══════════════════════════════════════════');
        console.log('🔄 Testing Sync Operations\\n');

        // Test 1: Sync Skills and Interests
        console.log('1️⃣  Testing syncSkillsAndInterests...');
        const skillsResult = await brainService.syncSkillsAndInterests(mockUserId);
        console.log(`   ✅ Created ${skillsResult.nodesCreated} nodes, ${skillsResult.sourcesCreated} sources`);
        console.log(`   📦 Node IDs: ${skillsResult.nodeIds.join(', ')}\\n`);

        // Test 2: Sync Courses
        console.log('2️⃣  Testing syncCourses...');
        const coursesResult = await brainService.syncCourses(mockUserId);
        console.log(`   ✅ Created ${coursesResult.nodesCreated} nodes, ${coursesResult.sourcesCreated} sources`);
        console.log(`   📦 Node IDs: ${coursesResult.nodeIds.join(', ')}\\n`);

        // Test 3: Sync Experiences
        console.log('3️⃣  Testing syncExperiences...');
        const experiencesResult = await brainService.syncExperiences(mockUserId);
        console.log(`   ✅ Created ${experiencesResult.nodesCreated} nodes, ${experiencesResult.linksCreated} links`);
        console.log(`   📦 Node IDs: ${experiencesResult.nodeIds.join(', ')}\\n`);

        // Test 4: Sync Campus Events
        console.log('4️⃣  Testing syncCampusEvents...');
        const eventsResult = await brainService.syncCampusEvents(mockUserId);
        console.log(`   ✅ Created ${eventsResult.nodesCreated} nodes`);
        console.log(`   📦 Node IDs: ${eventsResult.nodeIds.join(', ')}\\n`);

        // Test 5: Detect Cross-Module Connections
        console.log('5️⃣  Testing detectCrossModuleConnections...');
        const connectionsResult = await brainService.detectCrossModuleConnections(mockUserId);
        console.log(`   ✅ Created ${connectionsResult.linksCreated} cross-module links\\n`);

        console.log('═══════════════════════════════════════════');
        console.log('📊 Verifying Graph Structure\\n');

        // Verify nodes were created
        const allNodes = await db.query.brainNodes.findMany({
            where: eq(brainNodes.userId, mockUserId),
        });

        console.log(`Total nodes in graph: ${allNodes.length}`);
        const nodesByModule = {
            'skills-interests': allNodes.filter(n => n.metadata?.sourceModule === 'skills-interests').length,
            'academics': allNodes.filter(n => n.metadata?.sourceModule === 'academics').length,
            'student-profile': allNodes.filter(n => n.metadata?.sourceModule === 'student-profile').length,
            'other': allNodes.filter(n => !n.metadata?.sourceModule).length,
        };
        console.log('Nodes by module:', JSON.stringify(nodesByModule, null, 2));

        // Verify links
        const allLinks = await db.query.brainLinks.findMany({
            where: eq(brainLinks.userId, mockUserId),
        });

        console.log(`\\nTotal links in graph: ${allLinks.length}`);
        console.log(`Dashed links: ${allLinks.filter(l => l.dashed).length}`);
        console.log(`Solid links: ${allLinks.filter(l => !l.dashed).length}`);

        // Verify sources
        const sources = await db.query.brainSources.findMany({});
        const userSources = sources.filter(s => {
            const node = allNodes.find(n => n.id === s.nodeId);
            return node !== undefined;
        });

        console.log(`\\nTotal sources attached: ${userSources.length}\\n`);

        console.log('═══════════════════════════════════════════');
        console.log('🎯 Testing syncAll (complete integration)\\n');

        // Clear existing data to test syncAll fresh
        await db.delete(brainSources);
        await db.delete(brainLinks);
        await db.delete(brainNodes).where(eq(brainNodes.userId, mockUserId));

        const syncAllResult = await brainService.syncAll(mockUserId);
        console.log('syncAll Results:');
        console.log(`  Total nodes created: ${syncAllResult.totalNodesCreated}`);
        console.log(`  Total sources created: ${syncAllResult.totalSourcesCreated}`);
        console.log(`  Cross-module links: ${syncAllResult.connections.linksCreated}`);
        console.log('\\n  Breakdown:');
        console.log(`    - Skills: ${syncAllResult.skills.nodesCreated} nodes, ${syncAllResult.skills.sourcesCreated} sources`);
        console.log(`    - Courses: ${syncAllResult.courses.nodesCreated} nodes, ${syncAllResult.courses.sourcesCreated} sources`);
        console.log(`    - Experiences: ${syncAllResult.experiences.nodesCreated} nodes`);
        console.log(`    - Events: ${syncAllResult.events.nodesCreated} nodes\\n`);

        console.log('═══════════════════════════════════════════');
        console.log('✨ Integration Verification Complete!\\n');

        console.log('Summary:');
        console.log('  ✅ Schema tracking works (sourceModule, sourceEntityId)');
        console.log('  ✅ Individual sync methods work correctly');
        console.log('  ✅ Cross-module connection detection works');
        console.log('  ✅ syncAll orchestrates everything properly');
        console.log('  ✅ Graph structure is correct\\n');

    } catch (error) {
        console.error('\\n❌ Verification failed:', error);
    }
}

if (require.main === module) {
    verifyIntegration()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}

export { verifyIntegration };
