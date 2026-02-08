/**
 * Spotify API Integration Helpers
 * Using native fetch as per requirements.
 */

export interface SpotifyArtist {
    id: string;
    name: string;
    genres: string[];
}

export interface SpotifyTrack {
    id: string;
    name: string;
    artists: { name: string }[];
    preview_url: string | null;
}

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

export async function spotifyFetch<T>(endpoint: string, token: string): Promise<T> {
    const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Spotify API error: ${response.status} ${errorBody}`);
    }

    return response.json() as Promise<T>;
}

export async function getTopArtists(token: string): Promise<SpotifyArtist[]> {
    const data = await spotifyFetch<{ items: SpotifyArtist[] }>('/me/top/artists?limit=20', token);
    return data.items;
}

export async function getRecommendations(seed_artists: string[], token: string): Promise<SpotifyTrack[]> {
    const seeds = seed_artists.join(',');
    const data = await spotifyFetch<{ tracks: SpotifyTrack[] }>(`/recommendations?seed_artists=${seeds}&limit=5`, token);
    return data.tracks;
}

export async function getCurrentPlayback(token: string): Promise<any> {
    const data = await spotifyFetch<any>('/me/player/currently-playing', token);
    return data;
}

/**
 * Compare two users' top artists and calculate overlap weight for the Heat Map.
 */
export function calculateArtistOverlap(user1Artists: SpotifyArtist[], user2Artists: SpotifyArtist[]) {
    const u1Ids = new Set(user1Artists.map(a => a.id));
    const overlap = user2Artists.filter(a => u1Ids.has(a.id));

    // Example weight: percentage of overlap relative to total unique artists
    const allIds = new Set([...user1Artists.map(a => a.id), ...user2Artists.map(a => a.id)]);
    const weight = (overlap.length / allIds.size) * 100;

    return {
        overlapArtists: overlap,
        weight: Math.round(weight),
    };
}
