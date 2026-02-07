/**
 * Fix Course Matching Script
 * Re-links existing Moodle courses with BITS catalog data
 * to populate staticId, handoutLink, units, courseType, etc.
 */

import { db } from '../src/core/database/client';
import { courses } from '../src/modules/academics/academics.schema';
import { eq, isNotNull, isNull, and } from 'drizzle-orm';
import {
  extractCourseCodeFromMoodle,
  normalizeCourseCode,
  findBestMatch,
} from '../src/modules/academics/course-matcher';

async function fixCourseMatching() {
  console.log('🔄 Starting course matching fix...\n');

  // Step 1: Get all Moodle courses without BITS catalog data
  const moodleCoursesWithoutMatch = await db
    .select()
    .from(courses)
    .where(
      and(
        isNotNull(courses.moodleCourseId),
        isNull(courses.staticId)
      )
    );

  console.log(`Found ${moodleCoursesWithoutMatch.length} Moodle courses without BITS catalog link\n`);

  if (moodleCoursesWithoutMatch.length === 0) {
    console.log('✅ All Moodle courses are already properly matched!');
    return;
  }

  // Step 2: Get all BITS catalog courses (with staticId)
  const bitsCatalogCourses = await db
    .select()
    .from(courses)
    .where(isNotNull(courses.staticId));

  console.log(`BITS catalog has ${bitsCatalogCourses.length} courses\n`);

  let fixed = 0;
  let failed = 0;

  // Step 3: Try to match and merge each Moodle course
  for (const moodleCourse of moodleCoursesWithoutMatch) {
    // Extract course code from Moodle format
    const extractedCode = extractCourseCodeFromMoodle(moodleCourse.code) ||
                         extractCourseCodeFromMoodle(moodleCourse.name || '');

    if (!extractedCode) {
      console.log(`❌ Could not extract code from: ${moodleCourse.code}`);
      failed++;
      continue;
    }

    console.log(`Processing: ${moodleCourse.code}`);
    console.log(`  Extracted: ${extractedCode}`);

    // Try exact normalized match first
    const normalizedExtracted = normalizeCourseCode(extractedCode);
    let matchedCatalogCourse = bitsCatalogCourses.find(c =>
      c.code && normalizeCourseCode(c.code) === normalizedExtracted
    );

    // If no exact match, try fuzzy matching
    if (!matchedCatalogCourse) {
      const match = findBestMatch(
        extractedCode,
        bitsCatalogCourses.map(c => ({ code: c.code, name: c.name })),
        0.8
      );

      if (match) {
        matchedCatalogCourse = bitsCatalogCourses.find(c => c.code === match.course.code);
        console.log(`  Fuzzy match: ${match.course.code} (score: ${match.score.toFixed(2)})`);
      }
    } else {
      console.log(`  Exact match: ${matchedCatalogCourse.code}`);
    }

    if (matchedCatalogCourse) {
      // Strategy: Update BITS catalog course with Moodle data, then delete duplicate

      // Re-fetch to get latest data (in case it was updated)
      const latestCatalogCourse = await db
        .select()
        .from(courses)
        .where(eq(courses.id, matchedCatalogCourse.id))
        .limit(1);

      const catalogCourse = latestCatalogCourse[0];

      // Check if BITS catalog course already has a different moodleCourseId
      if (catalogCourse.moodleCourseId && catalogCourse.moodleCourseId !== moodleCourse.moodleCourseId) {
        console.log(`  ⚠️  BITS catalog course already linked to different Moodle ID`);
        console.log(`     Catalog: ${catalogCourse.moodleCourseId}, Current: ${moodleCourse.moodleCourseId}`);
        console.log(`     Skipping to avoid conflict\n`);
        failed++;
        continue;
      }

      // 1. Transfer enrollments and resources FIRST (before deleting)
      const { enrollments } = await import('../src/modules/academics/academics.schema');
      const enrollmentsMoved = await db
        .update(enrollments)
        .set({ courseId: catalogCourse.id })
        .where(eq(enrollments.courseId, moodleCourse.id))
        .returning();

      const { resources } = await import('../src/modules/academics/academics.schema');
      const resourcesMoved = await db
        .update(resources)
        .set({ courseId: catalogCourse.id })
        .where(eq(resources.courseId, moodleCourse.id))
        .returning();

      // 2. Delete the duplicate Moodle course
      await db
        .delete(courses)
        .where(eq(courses.id, moodleCourse.id));

      // 3. Update BITS catalog course with Moodle ID and other data (now that duplicate is gone)
      const updateData: any = {
        moodleCourseId: moodleCourse.moodleCourseId, // Safe to set now
        updatedAt: new Date(),
      };

      if (!catalogCourse.professorName && moodleCourse.professorName) {
        updateData.professorName = moodleCourse.professorName;
      }
      if (!catalogCourse.description && moodleCourse.description) {
        updateData.description = moodleCourse.description;
      }

      await db
        .update(courses)
        .set(updateData)
        .where(eq(courses.id, catalogCourse.id));

      console.log(`  ✅ Merged with BITS catalog course (ID: ${catalogCourse.id})`);
      console.log(`     Transferred ${enrollmentsMoved.length} enrollments, ${resourcesMoved.length} resources`);
      console.log(`     Deleted duplicate, linked Moodle ID\n`);
      fixed++;
    } else {
      console.log(`  ⚠️  No match found in BITS catalog\n`);
      failed++;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   ✅ Fixed: ${fixed}`);
  console.log(`   ❌ No match: ${failed}`);
  console.log(`   📚 Total: ${moodleCoursesWithoutMatch.length}`);
}

fixCourseMatching()
  .then(() => {
    console.log('\n✅ Course matching fix completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error fixing course matching:', error);
    process.exit(1);
  });
