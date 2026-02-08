import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { marketplaceService } from './marketplace.service';
import { successResponse, errorResponse, createdResponse } from '../../core/utils/response';
import { protect } from '../../core/auth/middleware';
import { db } from '../../core/database/client';
import { user } from '../auth/auth.schema';
import { eq } from 'drizzle-orm';

/**
 * Marketplace Module Routes
 * Privacy-first campus marketplace for buying, selling, and bartering
 */

const marketplace = new Hono();

/**
 * Test mode middleware - supports both production auth and test x-user-id header
 */
const protectOrTest = async (c: any, next: any) => {
    // Check for test mode header first
    const testUserId = c.req.header('x-user-id');

    if (testUserId) {
        // Test mode: fetch user from database
        const users = await db.select().from(user).where(eq(user.id, testUserId));
        if (users.length > 0) {
            c.set('user', users[0]);
            await next();
            return;
        }
    }

    // Production mode: use protect middleware
    return protect(c, next);
};

/**
 * VALIDATION SCHEMAS
 */

// Create item schema
const createItemSchema = z.object({
    title: z.string().min(1, 'Title is required').max(255),
    description: z.string().min(1, 'Description is required'),
    price: z.string().regex(/^\d+(\\.\\d{1,2})?$/, 'Invalid price format').optional().nullable(),
    tradeWishlist: z.string().optional().nullable(),
    listingType: z.enum(['sale', 'trade', 'both']),
    category: z.enum(['electronics', 'books', 'dorm_essentials', 'lab_gear', 'clothing', 'sports', 'other']).optional(),
    condition: z.enum(['new', 'like_new', 'good', 'fair', 'poor']).optional(),
    hostelZone: z.string().optional().nullable(),
    images: z.array(z.string().url()).optional(),
});

// Update item schema
const updateItemSchema = z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().min(1).optional(),
    price: z.string().regex(/^\d+(\\.\\d{1,2})?$/).optional().nullable(),
    tradeWishlist: z.string().optional().nullable(),
    category: z.enum(['electronics', 'books', 'dorm_essentials', 'lab_gear', 'clothing', 'sports', 'other']).optional(),
    condition: z.enum(['new', 'like_new', 'good', 'fair', 'poor']).optional(),
    hostelZone: z.string().optional().nullable(),
});

// Send message schema
const sendMessageSchema = z.object({
    content: z.string().min(1, 'Message content is required'),
});

// Submit review schema
const submitReviewSchema = z.object({
    targetUserId: z.string().uuid('Invalid user ID'),
    itemId: z.string().uuid('Invalid item ID'),
    rating: z.number().int().min(1).max(5),
    comment: z.string().optional(),
});

/**
 * ITEM ENDPOINTS
 */

/**
 * GET /items
 * Get public marketplace feed (PRIVACY-SAFE)
 * No authentication required
 */
marketplace.get('/items', async (c) => {
    try {
        const category = c.req.query('category');
        const listingType = c.req.query('listing_type');
        const hostelZone = c.req.query('hostel_zone');
        const minPrice = c.req.query('min_price');
        const maxPrice = c.req.query('max_price');
        const condition = c.req.query('condition');
        const search = c.req.query('search');
        const status = c.req.query('status') as 'active' | 'reserved' | 'sold' | undefined;

        const items = await marketplaceService.getPublicItems({
            category,
            listingType,
            hostelZone,
            minPrice,
            maxPrice,
            condition,
            search,
            status,
        });

        return successResponse(c, { items, count: items.length });
    } catch (error: any) {
        console.error('[API] Error fetching items:', error);
        return errorResponse(c, 'Failed to fetch items', 500);
    }
});

/**
 * POST /items
 * Create new listing
 * Requires authentication
 */
marketplace.post('/items', protectOrTest, zValidator('json', createItemSchema), async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const data = c.req.valid('json');

        const item = await marketplaceService.createItem({
            ...data,
            sellerId: user.id,
        });

        return createdResponse(c, { item });
    } catch (error: any) {
        console.error('[API] Error creating item:', error);
        return errorResponse(c, error.message || 'Failed to create item', 400);
    }
});

/**
 * GET /items/:id
 * Get item details
 * No authentication required (public view)
 */
marketplace.get('/items/:id', async (c) => {
    try {
        const itemId = c.req.param('id');

        const item = await marketplaceService.getItemById(itemId);
        if (!item) {
            return errorResponse(c, 'Item not found', 404, 'ITEM_NOT_FOUND');
        }

        return successResponse(c, item);
    } catch (error: any) {
        console.error('[API] Error fetching item:', error);
        return errorResponse(c, 'Failed to fetch item', 500);
    }
});

/**
 * PUT /items/:id
 * Update listing
 * Requires authentication and ownership
 */
marketplace.put('/items/:id', protect, zValidator('json', updateItemSchema), async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const itemId = c.req.param('id');

        // Check ownership
        const existingItem = await marketplaceService.getItemById(itemId);
        if (!existingItem) {
            return errorResponse(c, 'Item not found', 404, 'ITEM_NOT_FOUND');
        }

        if (existingItem.item.sellerId !== user.id) {
            return errorResponse(c, 'Only the seller can update this item', 403, 'NOT_SELLER');
        }

        const data = c.req.valid('json');
        const item = await marketplaceService.updateItem(itemId, data);

        return successResponse(c, { item });
    } catch (error: any) {
        console.error('[API] Error updating item:', error);
        return errorResponse(c, 'Failed to update item', 500);
    }
});

/**
 * DELETE /items/:id
 * Delete listing
 * Requires authentication and ownership
 */
marketplace.delete('/items/:id', protect, async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const itemId = c.req.param('id');

        // Check ownership
        const existingItem = await marketplaceService.getItemById(itemId);
        if (!existingItem) {
            return errorResponse(c, 'Item not found', 404, 'ITEM_NOT_FOUND');
        }

        if (existingItem.item.sellerId !== user.id) {
            return errorResponse(c, 'Only the seller can delete this item', 403, 'NOT_SELLER');
        }

        await marketplaceService.deleteItem(itemId);
        return successResponse(c, { message: 'Item deleted successfully' });
    } catch (error: any) {
        console.error('[API] Error deleting item:', error);
        return errorResponse(c, 'Failed to delete item', 500);
    }
});

/**
 * GET /my-items
 * Get authenticated user's listings
 * Requires authentication
 */
marketplace.get('/my-items', protect, async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const items = await marketplaceService.getUserItems(user.id);
        return successResponse(c, { items, count: items.length });
    } catch (error: any) {
        console.error('[API] Error fetching user items:', error);
        return errorResponse(c, 'Failed to fetch items', 500);
    }
});

/**
 * CONVERSATION ENDPOINTS
 */

/**
 * POST /chat/start
 * Start negotiation for an item
 * Requires authentication
 */
marketplace.post('/chat/start', protect, zValidator('json', z.object({
    itemId: z.string().uuid('Invalid item ID'),
})), async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const { itemId } = c.req.valid('json');

        // Check if item exists
        const item = await marketplaceService.getItemById(itemId);
        if (!item) {
            return errorResponse(c, 'Item not found', 404, 'ITEM_NOT_FOUND');
        }

        // Prevent seller from messaging themselves
        if (item.item.sellerId === user.id) {
            return errorResponse(c, 'You cannot start a conversation with yourself', 400, 'SELF_CONVERSATION');
        }

        const conversation = await marketplaceService.startConversation(itemId, user.id);
        return createdResponse(c, { conversation });
    } catch (error: any) {
        console.error('[API] Error starting conversation:', error);
        return errorResponse(c, error.message || 'Failed to start conversation', 500);
    }
});

/**
 * GET /chat/:id/messages
 * Get conversation messages
 * Requires authentication and participation
 */
marketplace.get('/chat/:id/messages', protect, async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const conversationId = c.req.param('id');

        const conversation = await marketplaceService.getConversation(conversationId);
        if (!conversation) {
            return errorResponse(c, 'Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
        }

        // Check participation
        const isBuyer = conversation.conversation.buyerId === user.id;
        const isSeller = conversation.conversation.sellerId === user.id;

        if (!isBuyer && !isSeller) {
            return errorResponse(c, 'You are not part of this conversation', 403, 'NOT_PARTICIPANT');
        }

        return successResponse(c, conversation);
    } catch (error: any) {
        console.error('[API] Error fetching messages:', error);
        return errorResponse(c, 'Failed to fetch messages', 500);
    }
});

/**
 * POST /chat/:id/message
 * Send message in conversation
 * Requires authentication and participation
 */
marketplace.post('/chat/:id/message', protect, zValidator('json', sendMessageSchema), async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const conversationId = c.req.param('id');
        const { content } = c.req.valid('json');

        const conversation = await marketplaceService.getConversation(conversationId);
        if (!conversation) {
            return errorResponse(c, 'Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
        }

        // Check participation
        const isBuyer = conversation.conversation.buyerId === user.id;
        const isSeller = conversation.conversation.sellerId === user.id;

        if (!isBuyer && !isSeller) {
            return errorResponse(c, 'You are not part of this conversation', 403, 'NOT_PARTICIPANT');
        }

        const message = await marketplaceService.sendMessage(conversationId, user.id, content);
        return createdResponse(c, { message });
    } catch (error: any) {
        console.error('[API] Error sending message:', error);
        return errorResponse(c, 'Failed to send message', 500);
    }
});

/**
 * GET /my-conversations
 * Get user's conversations
 * Requires authentication
 */
marketplace.get('/my-conversations', protect, async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const conversations = await marketplaceService.getUserConversations(user.id);
        return successResponse(c, { conversations, count: conversations.length });
    } catch (error: any) {
        console.error('[API] Error fetching conversations:', error);
        return errorResponse(c, 'Failed to fetch conversations', 500);
    }
});

/**
 * HANDSHAKE PROTOCOL ENDPOINTS
 */

/**
 * POST /chat/:id/reveal
 * Seller reveals contact info
 * Requires authentication and seller role
 */
marketplace.post('/chat/:id/reveal', protect, async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const conversationId = c.req.param('id');

        const conversation = await marketplaceService.getConversation(conversationId);
        if (!conversation) {
            return errorResponse(c, 'Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
        }

        // Only seller can reveal
        if (conversation.conversation.sellerId !== user.id) {
            return errorResponse(c, 'Only the seller can reveal contact info', 403, 'NOT_SELLER');
        }

        const updated = await marketplaceService.revealSellerContact(conversationId);
        return successResponse(c, { conversation: updated, message: 'Contact info revealed' });
    } catch (error: any) {
        console.error('[API] Error revealing contact:', error);
        return errorResponse(c, 'Failed to reveal contact info', 500);
    }
});

/**
 * POST /chat/:id/finalize
 * Finalize deal (mutual handshake)
 * Requires authentication and participation
 */
marketplace.post('/chat/:id/finalize', protect, async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const conversationId = c.req.param('id');

        const conversation = await marketplaceService.getConversation(conversationId);
        if (!conversation) {
            return errorResponse(c, 'Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
        }

        // Check participation
        const isBuyer = conversation.conversation.buyerId === user.id;
        const isSeller = conversation.conversation.sellerId === user.id;

        if (!isBuyer && !isSeller) {
            return errorResponse(c, 'You are not part of this conversation', 403, 'NOT_PARTICIPANT');
        }

        const updated = await marketplaceService.finalizeDeal(conversationId);
        return successResponse(c, {
            conversation: updated,
            message: 'Deal finalized! Item marked as SOLD. Both parties can now view contact info.'
        });
    } catch (error: any) {
        console.error('[API] Error finalizing deal:', error);
        return errorResponse(c, error.message || 'Failed to finalize deal', 500);
    }
});

/**
 * GET /chat/:id/secure-details
 * Get secure contact info (permission-gated)
 * Requires authentication and participation
 */
marketplace.get('/chat/:id/secure-details', protect, async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const conversationId = c.req.param('id');

        const contactInfo = await marketplaceService.getSecureContactInfo(conversationId, user.id);

        // Check if any info was returned
        if (!contactInfo.sellerInfo && !contactInfo.buyerInfo) {
            return errorResponse(
                c,
                'Contact information not available. Seller must reveal info first, or deal must be finalized.',
                403,
                'CONTACT_NOT_REVEALED'
            );
        }

        return successResponse(c, contactInfo);
    } catch (error: any) {
        console.error('[API] Error fetching secure details:', error);
        return errorResponse(c, error.message || 'Failed to fetch contact info', 403);
    }
});

/**
 * REVIEW ENDPOINTS
 */

/**
 * POST /reviews
 * Submit review after transaction
 * Requires authentication
 */
marketplace.post('/reviews', protect, zValidator('json', submitReviewSchema), async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const { targetUserId, itemId, rating, comment } = c.req.valid('json');

        const review = await marketplaceService.submitReview(
            user.id,
            targetUserId,
            itemId,
            rating,
            comment
        );

        return createdResponse(c, { review });
    } catch (error: any) {
        console.error('[API] Error submitting review:', error);
        return errorResponse(c, error.message || 'Failed to submit review', 400);
    }
});

/**
 * GET /users/:id/reviews
 * Get user's reviews
 * No authentication required
 */
marketplace.get('/users/:id/reviews', async (c) => {
    try {
        const userId = c.req.param('id');

        const reviews = await marketplaceService.getUserReviews(userId);
        return successResponse(c, { reviews, count: reviews.length });
    } catch (error: any) {
        console.error('[API] Error fetching reviews:', error);
        return errorResponse(c, 'Failed to fetch reviews', 500);
    }
});

/**
 * GET /users/:id/trust-rating
 * Get user's trust rating
 * No authentication required
 */
marketplace.get('/users/:id/trust-rating', async (c) => {
    try {
        const userId = c.req.param('id');

        const rating = await marketplaceService.getUserTrustRating(userId);
        return successResponse(c, rating);
    } catch (error: any) {
        console.error('[API] Error fetching trust rating:', error);
        return errorResponse(c, 'Failed to fetch trust rating', 500);
    }
});

export default marketplace;
