import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined');
}

const sql = postgres(databaseUrl);

async function main() {
    console.log('🗑️  Dropping all data...');

    try {
        // Drop the public schema and everything in it
        await sql`DROP SCHEMA IF EXISTS public CASCADE`;
        // Drop drizzle schema to reset migration history
        await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;

        // Recreate the public schema
        await sql`CREATE SCHEMA public`;
        // Grant permissions (standard for default pg setup)
        await sql`GRANT ALL ON SCHEMA public TO postgres`;
        await sql`GRANT ALL ON SCHEMA public TO public`;

        console.log('✅ Database reset successfully');
    } catch (error) {
        console.error('❌ Failed to reset database:', error);
        process.exit(1);
    } finally {
        await sql.end();
    }
}

main();
