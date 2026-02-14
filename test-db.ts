import { db } from './src/core/database/client';
import { brainNodes } from './src/modules/brain/brain.schema';

async function testConnection() {
    console.log('Testing connection...');
    try {
        const result = await db.select().from(brainNodes).limit(1);
        console.log('Success:', result);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

testConnection();
