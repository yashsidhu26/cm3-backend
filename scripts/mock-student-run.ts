import { db } from '../src/core/database/client';
import { user } from '../src/core/database/schema';
import { studentProfileService } from '../src/modules/student-profile/student-profile.service';
import { activityLogs } from '../src/modules/student-profile/student-profile.schema';
import { randomUUID } from 'crypto';

/**
 * Mock Student Run Script
 * Simulates a student's journey through the Smart features
 */

async function runMockStudentSimulation() {
    console.log('\n🚀 Starting Mock Student Simulation...\n');

    const testUserId = randomUUID();
    const studentName = 'Alex "The Coder" Smith';
    const email = `alex_${Date.now()}@example.com`;

    try {
        // 1. Create User
        console.log(`[1/5] Creating user: ${studentName}`);
        await db.insert(user).values({
            id: testUserId,
            name: studentName,
            email: email,
            emailVerified: true
        });

        // 2. Setup Profile & Academics
        console.log('[2/5] Setting up profile & academic data...');
        await studentProfileService.upsertProfile(testUserId, {
            userId: testUserId,
            learningStyle: 'hybrid',
            bio: 'Aspiring Web Developer interested in Blockchain.'
        });

        await studentProfileService.upsertAcademics(testUserId, {
            userId: testUserId,
            major: 'Information Technology',
            skills: ['HTML', 'CSS', 'JavaScript'],
            interests: ['Solidity', 'Rust', 'React']
        });

        // 3. Simulate Activity (The "Night Owl" behavior)
        console.log('[3/5] Logging activities to simulate behavior (Night Owl)...');

        const nightTime = new Date();
        nightTime.setHours(22, 0, 0); // 10 PM

        await db.insert(activityLogs).values([
            { userId: testUserId, status: 'completed', completionTime: nightTime, priority: 'high' },
            { userId: testUserId, status: 'completed', completionTime: new Date(nightTime.getTime() + 3600000), priority: 'medium' }, // 11 PM
            { userId: testUserId, status: 'skipped', priority: 'low' }
        ]);

        // 4. Run Analysis & Dashboard
        console.log('[4/5] Running Gap Analysis and fetching Dashboard...');
        const dashboard = await studentProfileService.getDashboardData(testUserId);

        console.log('\n📊 --- INSIGHTS ---');
        console.log(`Completion Rate: ${dashboard.insights.behavior.completionRate}%`);
        console.log(`Productivity Window: ${dashboard.insights.behavior.peakProductivityWindow}`);
        console.log(`Skill Gaps Identified: ${dashboard.insights.suggestions.length}`);
        dashboard.insights.suggestions.forEach((s: any) => {
            if (s.type === 'course_recommendation') {
                console.log(`   - 📔 ${s.message}`);
            }
        });

        // 5. Generate Smart Study Plan
        console.log('\n[5/5] Generating Personalized Smart Study Plan...');
        const smartPlan = await studentProfileService.getSmartStudyPlan(testUserId);

        console.log('\n📅 --- SMART STUDY PLAN ---');
        console.log(`Engine: ${smartPlan.source}`);
        smartPlan.plan.forEach((p: any) => {
            console.log(`[${p.personalizedTime}] ${p.subject}: ${p.task} (Originally ${p.originalTime})`);
            console.log(`   Reason: ${p.reason}`);
        });

        console.log('\n✨ Simulation completed successfully!');

    } catch (error) {
        console.error('\n❌ Simulation failed:', error);
    } finally {
        // Optional: Keep the user for inspection, or cleanup
        // For now, we'll leave it in the DB so you can see it in Studio
        console.log(`\nUser ID for verification: ${testUserId}`);
        // process.exit(0);
    }
}

runMockStudentSimulation();
