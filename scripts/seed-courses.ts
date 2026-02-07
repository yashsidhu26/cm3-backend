/**
 * Course Seeding Script
 * Populates the database with courses from all_courses.json and handouts.json
 *
 * Usage: bun run scripts/seed-courses.ts
 */

import { db } from '../src/core/database/client';
import { courses } from '../src/modules/academics/academics.schema';
import { eq } from 'drizzle-orm';
import { findMatchingCourse } from '../src/modules/academics/course-matcher';
import * as fs from 'fs';
import * as path from 'path';

interface AllCourse {
  static_id: string;
  course_id: string;
  name: string;
  units: number;
  ic: string;
  is_added: boolean;
  type: string;
  nickname: string;
}

interface Handout {
  course_code: string;
  course_name: string;
  handout_link: string;
}

async function seedCourses() {
  console.log('🌱 Starting course seeding...\n');

  try {
    // 1. Load JSON files
    console.log('📁 Loading JSON files...');
    const allCoursesPath = path.join(process.cwd(), 'all_courses.json');
    const handoutsPath = path.join(process.cwd(), 'handouts.json');

    if (!fs.existsSync(allCoursesPath)) {
      throw new Error(`all_courses.json not found at: ${allCoursesPath}`);
    }

    if (!fs.existsSync(handoutsPath)) {
      throw new Error(`handouts.json not found at: ${handoutsPath}`);
    }

    const allCoursesData = JSON.parse(fs.readFileSync(allCoursesPath, 'utf-8')) as AllCourse[];
    const handoutsData = JSON.parse(fs.readFileSync(handoutsPath, 'utf-8')) as Handout[];

    console.log(`✓ Loaded ${allCoursesData.length} courses from all_courses.json`);
    console.log(`✓ Loaded ${handoutsData.length} handouts from handouts.json\n`);

    // 2. Process and insert courses
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    console.log('🔄 Processing courses...\n');

    for (const course of allCoursesData) {
      try {
        // Find matching handout
        const matchingHandout = findMatchingCourse(course.course_id, handoutsData);

        // Check if course already exists by static_id
        const existing = await db
          .select()
          .from(courses)
          .where(eq(courses.staticId, course.static_id))
          .limit(1);

        const courseData = {
          staticId: course.static_id,
          code: course.course_id,
          name: course.name,
          professorName: course.ic || null,
          units: course.units,
          courseType: course.type || null,
          nickname: course.nickname || null,
          handoutLink: matchingHandout?.handout_link || null,
          updatedAt: new Date(),
        };

        if (existing.length > 0) {
          // Update existing course
          await db
            .update(courses)
            .set(courseData)
            .where(eq(courses.staticId, course.static_id));

          updated++;

          if (updated % 100 === 0) {
            console.log(`⟳ Updated ${updated} courses...`);
          }
        } else {
          // Insert new course
          await db.insert(courses).values(courseData);

          inserted++;

          if (inserted % 100 === 0) {
            console.log(`✓ Inserted ${inserted} courses...`);
          }
        }
      } catch (error: any) {
        errors++;
        console.error(`❌ Error processing course ${course.course_id}:`, error.message);

        if (errors > 10) {
          console.error('Too many errors, stopping seed process.');
          throw new Error('Seed process aborted due to excessive errors');
        }
      }
    }

    // 3. Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Seeding Summary:');
    console.log('='.repeat(50));
    console.log(`✓ Inserted: ${inserted} courses`);
    console.log(`⟳ Updated: ${updated} courses`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`📚 Total courses in database: ${inserted + updated}`);
    console.log('='.repeat(50) + '\n');

    console.log('✅ Course seeding completed successfully!\n');

    // 4. Show some stats
    const totalCourses = await db.select().from(courses);
    const coursesWithHandouts = totalCourses.filter((c) => c.handoutLink);
    const coursesWithMoodle = totalCourses.filter((c) => c.moodleCourseId);

    console.log('📈 Database Statistics:');
    console.log(`  Total courses: ${totalCourses.length}`);
    console.log(`  Courses with handouts: ${coursesWithHandouts.length}`);
    console.log(`  Courses linked to Moodle: ${coursesWithMoodle.length}`);
    console.log('');

  } catch (error: any) {
    console.error('\n❌ Seeding failed:', error.message);
    process.exit(1);
  }
}

// Run the seed script
seedCourses()
  .then(() => {
    console.log('🎉 Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
