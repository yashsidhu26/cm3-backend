import { Hono } from 'hono';
import { db } from './database';
import { queuedSongs, capsuleSongs, whisperNotes, capsules, votes, flashReactions } from './spotify.schema';
import { eq, and, sql, count } from 'drizzle-orm';
import { nebulaWebSocket } from './websocket';
import { getCurrentPlayback } from './spotify';
import { protect } from '../../core/auth/middleware';

const spotify = new Hono();

// WebSocket endpoint for Heat Map (Does not need protect if handled internally, but let's keep it simple)
spotify.get('/ws/nebula', nebulaWebSocket);

/**
 * 2. Collaborative "Blind" Voting
 */

// GET /discovery/queue: Returns songs without metadata
spotify.get('/discovery/queue', async (c) => {
    const songs = await db.select().from(queuedSongs).all();
    return c.json(songs.map(s => ({ id: s.id, spotifyTrackId: s.spotifyTrackId })));
});

// POST /discovery/vote: Accepts track_id and vote (bool)
spotify.post('/discovery/vote', protect, async (c) => {
    const { trackId, vote } = await c.req.json();
    const user = c.get('user')!;

    // 1. Record the vote
    await db.insert(votes).values({
        queuedSongId: trackId,
        userId: user.id,
        vote: vote,
    }).onConflictDoUpdate({
        target: [votes.queuedSongId, votes.userId],
        set: { vote: vote }
    });

    if (vote === true) {
        // 2. Check if at least 2 distinct users voted true
        const trueVotes = await db.select({ count: count() })
            .from(votes)
            .where(and(eq(votes.queuedSongId, trackId), eq(votes.vote, true)))
            .get();

        if (trueVotes && trueVotes.count >= 2) {
            // Move to capsule_songs
            const song = await db.select().from(queuedSongs).where(eq(queuedSongs.id, trackId)).get();
            if (song) {
                await db.insert(capsuleSongs).values({
                    capsuleId: song.capsuleId,
                    spotifyTrackId: song.spotifyTrackId,
                });
                // Optionally clean up queue and votes
                await db.delete(queuedSongs).where(eq(queuedSongs.id, trackId));
                // votes will be cleaned up by cascade if implemented, but for now we'll just leave it or manually delete
                await db.delete(votes).where(eq(votes.queuedSongId, trackId));

                return c.json({ success: true, action: 'moved_to_capsule' });
            }
        }
    }

    return c.json({ success: true, action: 'vote_recorded' });
});

/**
 * 3. "The Whisper Gallery" (Proximity)
 */
spotify.post('/capsule/whisper', protect, async (c) => {
    const body = await c.req.parseBody();
    const capsuleId = body['capsuleId'] as string;
    const token = c.req.header('Authorization')?.replace('Bearer ', '');

    if (!token) return c.json({ error: 'Spotify Token Required' }, 401);

    const playback = await getCurrentPlayback(token);
    const trackMetadata = playback?.item ? {
        trackId: playback.item.id,
        trackName: playback.item.name,
        artistName: playback.item.artists[0]?.name,
    } : { trackId: 'unknown', trackName: 'Unknown', artistName: 'Unknown' };

    await db.insert(whisperNotes).values({
        capsuleId,
        audioBlobUrl: 'local://blobs/' + Date.now(),
        ...trackMetadata,
    });

    return c.json({ success: true, taggedWith: trackMetadata });
});

/**
 * 4. Milestone "Flashes"
 */

// POST /capsule/flash/react: Requires 2-way handshake to unblur
spotify.post('/capsule/flash/react', protect, async (c) => {
    const { capsuleId, reaction } = await c.req.json();
    const user = c.get('user')!;

    // 1. Record reaction
    await db.insert(flashReactions).values({
        capsuleId,
        userId: user.id,
        reaction,
    });

    // 2. Check if at least 2 distinct users reacted
    const reactions = await db.select({ count: count() })
        .from(flashReactions)
        .where(eq(flashReactions.capsuleId, capsuleId))
        .get();

    if (reactions && reactions.count >= 2) {
        return c.json({ success: true, message: 'Metadata unblurred!', status: 'UNBLURRED' });
    }

    return c.json({ success: true, message: 'Reaction recorded. Waiting for partner.', status: 'PENDING_PARTNER' });
});

/**
 * Admin: Simulate Milestone Cron
 */
spotify.post('/admin/run-milestones', async (c) => {
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    const targetDateStart = ninetyDaysAgo - (12 * 60 * 60 * 1000);
    const targetDateEnd = ninetyDaysAgo + (12 * 60 * 60 * 1000);

    const targetCapsules = await db.select().from(capsules).all();
    const matches = targetCapsules.filter(cap => cap.createdAt >= targetDateStart && cap.createdAt <= targetDateEnd);

    for (const cap of matches) {
        const songs = await db.select().from(capsuleSongs).where(eq(capsuleSongs.capsuleId, cap.id)).all();
        if (songs.length > 0) {
            const randomSong = songs[Math.floor(Math.random() * songs.length)];
            await db.update(capsules).set({
                isFlashActive: true,
                flashSongId: randomSong.spotifyTrackId
            }).where(eq(capsules.id, cap.id));
        }
    }

    return c.json({ success: true, processed: matches.length });
});

export default spotify;
