import { createBunWebSocket } from 'hono/bun';

/**
 * WebSocket factory for Bun + Hono
 * This provides the upgradeWebSocket middleware and the websocket handler
 * required to be exported by the main Bun entry point.
 */
export const { upgradeWebSocket, websocket } = createBunWebSocket();
