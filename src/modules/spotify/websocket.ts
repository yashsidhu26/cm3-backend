import { upgradeWebSocket } from '../../core/utils/websocket';
import { db } from './database';
import { superSyncEvents } from './spotify.schema';

/**
 * Heat Map Shared Canvas WebSocket (/ws/nebula)
 * Handles TUG_ARTIST and TAP_BUBBLE events.
 * Implements 500ms window logic for SUPER_SYNC events.
 */

// In-memory store for recent taps to detect SUPER_SYNC
// Map<ArtistId, { userId: string, timestamp: number }[]>
const recentTaps = new Map<string, { userId: string, timestamp: number }[]>();

export const nebulaWebSocket = upgradeWebSocket((c) => {
    return {
        onMessage: async (event, ws) => {
            try {
                const data = JSON.parse(event.data.toString());
                const { type, artistId, userId } = data;

                if (type === 'TUG_ARTIST') {
                    // Broadcast movement to others? (Simplified for now)
                    ws.send(JSON.stringify({ type: 'NEBULA_UPDATE', artistId, action: 'tugging' }));
                }

                if (type === 'TAP_BUBBLE') {
                    const now = Date.now();
                    const taps = recentTaps.get(artistId) || [];

                    // Filter out taps older than 500ms
                    const activeTaps = taps.filter(t => now - t.timestamp < 500);

                    // Check if someone else tapped within 500ms
                    const otherTap = activeTaps.find(t => t.userId !== userId);

                    if (otherTap) {
                        // SUPER_SYNC Triggered!
                        console.log(`🔥 SUPER_SYNC detected for artist ${artistId} between ${userId} and ${otherTap.userId}`);

                        // Save to database
                        await db.insert(superSyncEvents).values({
                            artistId,
                            user1Id: userId,
                            user2Id: otherTap.userId,
                            timestamp: now,
                        });

                        // Notify clients
                        ws.send(JSON.stringify({ type: 'SUPER_SYNC', artistId, users: [userId, otherTap.userId] }));
                    } else {
                        // Record this tap
                        activeTaps.push({ userId, timestamp: now });
                        recentTaps.set(artistId, activeTaps);

                        ws.send(JSON.stringify({ type: 'TAP_RECEIVED', artistId }));
                    }
                }
            } catch (err) {
                console.error('WebSocket message error:', err);
            }
        },
        onClose: () => {
            console.log('Nebula WebSocket closed');
        },
    };
});
