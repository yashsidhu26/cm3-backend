import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { db } from './src/modules/spotify/database';
import { capsules, capsuleSongs, queuedSongs } from './src/modules/spotify/spotify.schema';

async function verify() {
    console.log('Waiting for server to be ready...');
    await new Promise(r => setTimeout(r, 5000));
    console.log('--- Spotify Verification ---');

    // 1. Seed some data
    console.log('Seeding test data...');
    const capId = 'test-capsule-1';

    // Clean up
    const sqlite = new Database('spotify.db');
    sqlite.run('DELETE FROM spotify_capsules');
    sqlite.run('DELETE FROM capsule_songs');
    sqlite.run('DELETE FROM queued_songs');

    await db.insert(capsules).values({
        id: capId,
        name: 'Summer Vibes 2024',
        createdAt: Date.now() - (90 * 24 * 60 * 60 * 1000), // 90 days ago exactly
    });

    await db.insert(queuedSongs).values({
        id: 'q1',
        capsuleId: capId,
        spotifyTrackId: 'track-A',
        status: 'pending',
    });

    await db.insert(capsuleSongs).values({
        id: 's1',
        capsuleId: capId,
        spotifyTrackId: 'track-B',
    });

    console.log('Data seeded.');

    // 2. Test Discovery Queue
    console.log('Testing Discovery Queue...');
    const queueResponse = await fetch('http://localhost:3000/api/spotify/discovery/queue');
    const queue = await queueResponse.json();
    console.log('Queue:', queue);

    // 3. Test Voting
    console.log('Testing Voting (Mocking 2 true votes)...');
    await fetch('http://localhost:3000/api/spotify/discovery/vote', {
        method: 'POST',
        body: JSON.stringify({ trackId: 'q1', vote: true }),
        headers: { 'Content-Type': 'application/json' }
    });

    const vote2 = await fetch('http://localhost:3000/api/spotify/discovery/vote', {
        method: 'POST',
        body: JSON.stringify({ trackId: 'q1', vote: true }),
        headers: { 'Content-Type': 'application/json' }
    });
    const vote2Result = await vote2.json();
    console.log('Vote 2 Result (Should move to capsule):', vote2Result);

    // 4. Test Milestone Flash
    console.log('Testing Milestone Flash simulation...');
    const milestoneResponse = await fetch('http://localhost:3000/api/spotify/admin/run-milestones', { method: 'POST' });
    const milestoneResult = await milestoneResponse.json();
    console.log('Milestone Result:', milestoneResult);

    const updatedCap = await db.select().from(capsules).where(eq(capsules.id, capId)).get();
    console.log('Updated Capsule Flash State:', updatedCap?.isFlashActive, 'Song ID:', updatedCap?.flashSongId);

    if (updatedCap?.isFlashActive) {
        console.log('✅ Milestone Flash successfully triggered for 90-day-old capsule!');
    } else {
        console.log('❌ Milestone Flash FAILED.');
    }

    console.log('--- Verification Complete ---');
}

// Run the verification
// Note: Requires the server to be running!
// We'll assume the user is running 'bun dev' or we've started it.
verify().catch(console.error);
