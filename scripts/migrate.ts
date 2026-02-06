import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined');
}

const migrationClient = postgres(databaseUrl, { max: 1 });

async function main() {
    console.log('Running migrations...');

    const db = drizzle(migrationClient);

    await migrate(db, { migrationsFolder: './drizzle' });

    console.log('Migrations completed successfully');
    await migrationClient.end();
}

main().catch((err) => {
    console.error('Migration failed');
    console.error(err);
    process.exit(1);
});
