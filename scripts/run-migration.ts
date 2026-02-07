/**
 * Manual Migration Script
 * Runs SQL to add new columns and tables
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import postgres from 'postgres';

async function runMigration() {
  console.log('🔄 Running manual migration...\n');

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const sql = postgres(DATABASE_URL);

  try {
    // Read SQL file
    const sqlFile = readFileSync(join(process.cwd(), 'scripts', 'add-new-columns.sql'), 'utf-8');

    // Execute SQL
    console.log('📝 Executing SQL migration...');
    await sql.unsafe(sqlFile);

    console.log('✅ Migration completed successfully!\n');

    // Verify tables exist
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('course_sections', 'class_schedule', 'user_section_registrations', 'studydeck_token')
      ORDER BY table_name;
    `;

    console.log('📊 New tables created:');
    tables.forEach((t: any) => console.log(`  ✓ ${t.table_name}`));

    // Verify columns exist
    const columns = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'courses'
      AND column_name IN ('static_id', 'units', 'course_type', 'nickname', 'handout_link')
      ORDER BY column_name;
    `;

    console.log('\n📊 New columns in courses table:');
    columns.forEach((c: any) => console.log(`  ✓ ${c.column_name}`));

    console.log('\n🎉 Database schema is ready!');
    console.log('\nYou can now run: bun run seed:courses\n');

  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    throw error;
  } finally {
    await sql.end();
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
