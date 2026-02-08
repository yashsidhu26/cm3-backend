import { db } from '../database/client';
import { session as sessionTable, user as userTable } from '../../modules/auth/auth.schema';
import { eq, and, gt } from 'drizzle-orm';
import { randomBytes } from 'crypto';

export const SESSION_COOKIE_NAME = 'super-app.session_token';
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

export class SessionService {
    /**
     * Create a new session for a user
     */
    static async createSession(userId: string, userAgent?: string, ipAddress?: string) {
        const token = randomBytes(32).toString('base64url');
        const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);

        await db.insert(sessionTable).values({
            token,
            userId,
            expiresAt,
            userAgent,
            ipAddress,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        return { token, expiresAt };
    }

    /**
     * Validate a session token
     * Returns user and session if valid, null otherwise
     */
    static async validateSession(token: string) {
        const result = await db
            .select({
                user: userTable,
                session: sessionTable,
            })
            .from(sessionTable)
            .innerJoin(userTable, eq(sessionTable.userId, userTable.id))
            .where(
                and(
                    eq(sessionTable.token, token),
                    gt(sessionTable.expiresAt, new Date())
                )
            )
            .limit(1);

        if (result.length === 0) {
            return null;
        }

        return result[0];
    }

    /**
     * Invalidate a session (logout)
     */
    static async invalidateSession(token: string) {
        await db.delete(sessionTable).where(eq(sessionTable.token, token));
    }

    /**
     * Invalidate all sessions for a user
     */
    static async invalidateAllUserSessions(userId: string) {
        await db.delete(sessionTable).where(eq(sessionTable.userId, userId));
    }
}
