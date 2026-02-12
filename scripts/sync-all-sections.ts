/**
 * Bulk Section Synchronization Script
 * Iterates through all courses in the database and syncs their sections from StudyDeck
 * 
 * Usage: bun run scripts/sync-all-sections.ts
 */

import { db } from '../src/core/database/client';
import { courses } from '../src/modules/academics/academics.schema';
import { sectionsService } from '../src/modules/academics/sections.service';
import { isNotNull } from 'drizzle-orm';

async function syncAllSections() {
    console.log('🚀 Starting bulk section synchronization...\n');

    try {
        // 1. Fetch all courses that have a staticId
        const coursesToSync = await db
            .select()
            .from(courses)
            .where(isNotNull(courses.staticId));

        console.log(`📊 Found ${coursesToSync.length} courses to sync.\n`);

        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;

        // 2. Iterate and sync
        for (let i = 0; i < coursesToSync.length; i++) {
            const course = coursesToSync[i];
            const progress = `[${i + 1}/${coursesToSync.length}]`;

            try {
                process.stdout.write(`${progress} Syncing: ${course.code} (${course.name})... `);

                const syncedCount = await sectionsService.syncCourseSections(course.id, course.staticId!);

                if (syncedCount > 0) {
                    process.stdout.write(`✅ Done (${syncedCount} sections)\n`);
                    successCount++;
                } else {
                    process.stdout.write(`⚠️ No sections found\n`);
                    skippedCount++;
                }
            } catch (error: any) {
                process.stdout.write(`❌ Error: ${error.message}\n`);
                errorCount++;
            }

            // Optional: Small delay to be polite to the API
            // await new Promise(resolve => setTimeout(resolve, 100));
        }

        // 3. Summary
        console.log('\n' + '='.repeat(50));
        console.log('📊 Synchronization Summary:');
        console.log('='.repeat(50));
        console.log(`✅ Successfully synced: ${successCount} courses`);
        console.log(`⚠️ Skipped (no data):  ${skippedCount} courses`);
        console.log(`❌ Failed:            ${errorCount} courses`);
        console.log(`📚 Total attempted:    ${coursesToSync.length} courses`);
        console.log('='.repeat(50) + '\n');

    } catch (error: any) {
        console.error('\n❌ Fatal error during synchronization:', error.message);
        process.exit(1);
    }
}

// Run the script
syncAllSections()
    .then(() => {
        console.log('🎉 Bulk synchronization completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
