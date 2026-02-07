import { eq, and, sql, or, ilike, gte, lte, inArray } from 'drizzle-orm';
import { db } from '../../core/database/client';
import {
    items,
    itemImages,
    conversations,
    messages,
    reviews,
    type Item,
    type NewItem,
    type ItemImage,
    type NewItemImage,
    type Conversation,
    type NewConversation,
    type Message,
    type NewMessage,
    type Review,
    type NewReview,
} from './marketplace.schema';
import { user } from '../auth/auth.schema';

/**
 * Marketplace Service
 * Privacy-first campus marketplace for buying, selling, and bartering
 */

export interface CreateItemData {
    sellerId: string;
    title: string;
    description: string;
    price?: string | null;
    tradeWishlist?: string | null;
    listingType: 'sale' | 'trade' | 'both';
    category?: 'electronics' | 'books' | 'dorm_essentials' | 'lab_gear' | 'clothing' | 'sports' | 'other';
    condition?: 'new' | 'like_new' | 'good' | 'fair' | 'poor';
    hostelZone?: string | null;
    images?: string[];
}

export interface SearchFilters {
    category?: string;
    listingType?: string;
    hostelZone?: string;
    minPrice?: string;
    maxPrice?: string;
    condition?: string;
    search?: string;
    status?: 'active' | 'reserved' | 'sold';
}

export interface SecureContactInfo {
    sellerInfo?: {
        name: string;
        phoneNumber: string | null;
        hostelRoom: string | null;
    };
    buyerInfo?: {
        name: string;
        phoneNumber: string | null;
        hostelRoom: string | null;
    };
}

export class MarketplaceService {
    /**
     * ITEM MANAGEMENT
     */

    async createItem(data: CreateItemData): Promise<Item> {
        // Validation: Trade-only items must have price = null/0
        if (data.listingType === 'trade' && data.price && parseFloat(data.price) > 0) {
            throw new Error('Trade-only listings cannot have a price greater than 0');
        }

        // Validation: Sale items must have a price
        if (data.listingType === 'sale' && (!data.price || parseFloat(data.price) <= 0)) {
            throw new Error('Sale listings must have a valid price');
        }

        // Create item
        const itemResult = await db.insert(items).values({
            sellerId: data.sellerId,
            title: data.title,
            description: data.description,
            price: data.price || null,
            tradeWishlist: data.tradeWishlist || null,
            listingType: data.listingType,
            category: data.category || 'other',
            condition: data.condition || 'good',
            hostelZone: data.hostelZone || null,
        }).returning();

        const item = itemResult[0];

        // Add images if provided
        if (data.images && data.images.length > 0) {
            await db.insert(itemImages).values(
                data.images.map((url, index) => ({
                    itemId: item.id,
                    imageUrl: url,
                    displayOrder: index,
                }))
            );
        }

        return item;
    }

    /**
     * PRIVACY-AWARE PUBLIC FEED
     * CRITICAL: This method MUST NEVER return PII (phone_number, hostel_room)
     */
    async getPublicItems(filters?: SearchFilters) {
        let query = db
            .select({
                item: items,
                sellerUsername: user.name,
                sellerTrustRating: user.trustRating,
                imageCount: sql<number>`cast(count(distinct ${itemImages.id}) as integer)`,
            })
            .from(items)
            .innerJoin(user, eq(items.sellerId, user.id))
            .leftJoin(itemImages, eq(items.id, itemImages.itemId))
            .$dynamic();

        // Apply filters
        const conditions = [];

        // Default to active items only
        conditions.push(eq(items.status, filters?.status || 'active'));

        if (filters?.category) {
            conditions.push(eq(items.category, filters.category as any));
        }

        if (filters?.listingType) {
            conditions.push(eq(items.listingType, filters.listingType as any));
        }

        if (filters?.hostelZone) {
            conditions.push(eq(items.hostelZone, filters.hostelZone));
        }

        if (filters?.minPrice) {
            conditions.push(gte(items.price, filters.minPrice));
        }

        if (filters?.maxPrice) {
            conditions.push(lte(items.price, filters.maxPrice));
        }

        if (filters?.condition) {
            conditions.push(eq(items.condition, filters.condition as any));
        }

        if (filters?.search) {
            conditions.push(
                or(
                    ilike(items.title, `%${filters.search}%`),
                    ilike(items.description, `%${filters.search}%`)
                )!
            );
        }

        if (conditions.length > 0) {
            query = query.where(and(...conditions));
        }

        const results = await query
            .groupBy(items.id, user.name, user.trustRating)
            .orderBy(sql`${items.createdAt} DESC`);

        return results;
    }

    async getItemById(itemId: string) {
        const itemData = await db
            .select({
                item: items,
                sellerUsername: user.name,
                sellerTrustRating: user.trustRating,
            })
            .from(items)
            .innerJoin(user, eq(items.sellerId, user.id))
            .where(eq(items.id, itemId));

        if (itemData.length === 0) {
            return undefined;
        }

        const itemImages = await this.getItemImages(itemId);

        return {
            ...itemData[0],
            images: itemImages,
        };
    }

    async getItemImages(itemId: string): Promise<ItemImage[]> {
        return await db
            .select()
            .from(itemImages)
            .where(eq(itemImages.itemId, itemId))
            .orderBy(itemImages.displayOrder);
    }

    async updateItem(itemId: string, data: Partial<CreateItemData>): Promise<Item> {
        const updateData: any = {};

        if (data.title) updateData.title = data.title;
        if (data.description) updateData.description = data.description;
        if (data.price !== undefined) updateData.price = data.price;
        if (data.tradeWishlist !== undefined) updateData.tradeWishlist = data.tradeWishlist;
        if (data.category) updateData.category = data.category;
        if (data.condition) updateData.condition = data.condition;
        if (data.hostelZone !== undefined) updateData.hostelZone = data.hostelZone;

        updateData.updatedAt = new Date();

        const result = await db
            .update(items)
            .set(updateData)
            .where(eq(items.id, itemId))
            .returning();

        return result[0];
    }

    async deleteItem(itemId: string): Promise<void> {
        await db.delete(items).where(eq(items.id, itemId));
    }

    async markItemAsSold(itemId: string): Promise<void> {
        await db
            .update(items)
            .set({ status: 'sold', updatedAt: new Date() })
            .where(eq(items.id, itemId));
    }

    /**
     * CONVERSATION MANAGEMENT
     */

    async startConversation(itemId: string, buyerId: string): Promise<Conversation> {
        // Get item to find seller
        const item = await db.select().from(items).where(eq(items.id, itemId));
        if (item.length === 0) {
            throw new Error('Item not found');
        }

        const sellerId = item[0].sellerId;

        // Check if conversation already exists
        const existing = await db
            .select()
            .from(conversations)
            .where(
                and(
                    eq(conversations.itemId, itemId),
                    eq(conversations.buyerId, buyerId)
                )
            );

        if (existing.length > 0) {
            return existing[0];
        }

        // Create new conversation
        const result = await db.insert(conversations).values({
            itemId,
            buyerId,
            sellerId,
        }).returning();

        return result[0];
    }

    async getConversation(conversationId: string) {
        const convData = await db
            .select({
                conversation: conversations,
                itemTitle: items.title,
                buyerName: sql<string>`buyer.name`,
                sellerName: sql<string>`seller.name`,
            })
            .from(conversations)
            .innerJoin(items, eq(conversations.itemId, items.id))
            .innerJoin(
                sql`${user} as buyer`,
                eq(conversations.buyerId, sql`buyer.id`)
            )
            .innerJoin(
                sql`${user} as seller`,
                eq(conversations.sellerId, sql`seller.id`)
            )
            .where(eq(conversations.id, conversationId));

        if (convData.length === 0) {
            return undefined;
        }

        const msgs = await this.getMessages(conversationId);

        return {
            ...convData[0],
            messages: msgs,
        };
    }

    async getMessages(conversationId: string): Promise<Array<Message & { senderName: string }>> {
        return await db
            .select({
                id: messages.id,
                conversationId: messages.conversationId,
                senderId: messages.senderId,
                content: messages.content,
                isSystemMessage: messages.isSystemMessage,
                sentAt: messages.sentAt,
                senderName: user.name,
            })
            .from(messages)
            .innerJoin(user, eq(messages.senderId, user.id))
            .where(eq(messages.conversationId, conversationId))
            .orderBy(messages.sentAt);
    }

    async sendMessage(conversationId: string, senderId: string, content: string): Promise<Message> {
        const result = await db.insert(messages).values({
            conversationId,
            senderId,
            content,
            isSystemMessage: false,
        }).returning();

        return result[0];
    }

    async injectSystemMessage(conversationId: string, content: string): Promise<Message> {
        // Use a system user ID (first user in DB or create a dedicated system user)
        const systemUser = await db.select().from(user).limit(1);
        const systemUserId = systemUser[0]?.id || 'system';

        const result = await db.insert(messages).values({
            conversationId,
            senderId: systemUserId,
            content,
            isSystemMessage: true,
        }).returning();

        return result[0];
    }

    /**
     * HANDSHAKE PROTOCOL STATE MACHINE
     */

    async revealSellerContact(conversationId: string): Promise<Conversation> {
        // Update conversation state
        const result = await db
            .update(conversations)
            .set({
                sellerRevealed: true,
                stage: 'seller_revealed',
                updatedAt: new Date(),
            })
            .where(eq(conversations.id, conversationId))
            .returning();

        // Inject system message
        await this.injectSystemMessage(
            conversationId,
            'SYSTEM: Seller has revealed their contact information. Buyer can now view seller details.'
        );

        return result[0];
    }

    async finalizeDeal(conversationId: string): Promise<Conversation> {
        const conv = await db
            .select()
            .from(conversations)
            .where(eq(conversations.id, conversationId));

        if (conv.length === 0) {
            throw new Error('Conversation not found');
        }

        // Update conversation state
        const result = await db
            .update(conversations)
            .set({
                dealFinalized: true,
                stage: 'finalized',
                updatedAt: new Date(),
            })
            .where(eq(conversations.id, conversationId))
            .returning();

        // Mark item as sold
        await this.markItemAsSold(conv[0].itemId);

        // Inject system message
        await this.injectSystemMessage(
            conversationId,
            'SYSTEM: Deal finalized! Both parties can now view each other\'s contact information. Item marked as SOLD.'
        );

        return result[0];
    }

    /**
     * SECURE CONTACT INFO ACCESS
     * Permission-gated PII retrieval
     */
    async getSecureContactInfo(conversationId: string, requesterId: string): Promise<SecureContactInfo> {
        const conv = await db
            .select()
            .from(conversations)
            .where(eq(conversations.id, conversationId));

        if (conv.length === 0) {
            throw new Error('Conversation not found');
        }

        const conversation = conv[0];
        const result: SecureContactInfo = {};

        // Check if requester is buyer
        const isBuyer = conversation.buyerId === requesterId;
        const isSeller = conversation.sellerId === requesterId;

        if (!isBuyer && !isSeller) {
            throw new Error('Unauthorized: You are not part of this conversation');
        }

        // Buyer can see seller info if seller revealed
        if (isBuyer && conversation.sellerRevealed) {
            const sellerData = await db
                .select({
                    name: user.name,
                    phoneNumber: user.phoneNumber,
                    hostelRoom: user.hostelRoom,
                })
                .from(user)
                .where(eq(user.id, conversation.sellerId));

            if (sellerData.length > 0) {
                result.sellerInfo = sellerData[0];
            }
        }

        // Seller can see buyer info only if deal finalized
        if (isSeller && conversation.dealFinalized) {
            const buyerData = await db
                .select({
                    name: user.name,
                    phoneNumber: user.phoneNumber,
                    hostelRoom: user.hostelRoom,
                })
                .from(user)
                .where(eq(user.id, conversation.buyerId));

            if (buyerData.length > 0) {
                result.buyerInfo = buyerData[0];
            }
        }

        // Both can see each other if deal finalized
        if (conversation.dealFinalized) {
            if (isBuyer) {
                const sellerData = await db
                    .select({
                        name: user.name,
                        phoneNumber: user.phoneNumber,
                        hostelRoom: user.hostelRoom,
                    })
                    .from(user)
                    .where(eq(user.id, conversation.sellerId));

                if (sellerData.length > 0) {
                    result.sellerInfo = sellerData[0];
                }
            }

            if (isSeller) {
                const buyerData = await db
                    .select({
                        name: user.name,
                        phoneNumber: user.phoneNumber,
                        hostelRoom: user.hostelRoom,
                    })
                    .from(user)
                    .where(eq(user.id, conversation.buyerId));

                if (buyerData.length > 0) {
                    result.buyerInfo = buyerData[0];
                }
            }
        }

        return result;
    }

    /**
     * REVIEW & TRUST RATING SYSTEM
     */

    async submitReview(
        reviewerId: string,
        targetUserId: string,
        itemId: string,
        rating: number,
        comment?: string
    ): Promise<Review> {
        // Validate rating
        if (rating < 1 || rating > 5) {
            throw new Error('Rating must be between 1 and 5');
        }

        // Check if deal was finalized
        const conv = await db
            .select()
            .from(conversations)
            .where(
                and(
                    eq(conversations.itemId, itemId),
                    or(
                        eq(conversations.buyerId, reviewerId),
                        eq(conversations.sellerId, reviewerId)
                    )!,
                    eq(conversations.dealFinalized, true)
                )
            );

        if (conv.length === 0) {
            throw new Error('You can only review after a finalized deal');
        }

        // Check for duplicate review
        const existing = await db
            .select()
            .from(reviews)
            .where(
                and(
                    eq(reviews.reviewerId, reviewerId),
                    eq(reviews.itemId, itemId)
                )
            );

        if (existing.length > 0) {
            throw new Error('You have already reviewed this transaction');
        }

        // Create review
        const result = await db.insert(reviews).values({
            reviewerId,
            targetUserId,
            itemId,
            rating,
            comment: comment || null,
        }).returning();

        // Update user trust rating
        await this.updateUserTrustRating(targetUserId);

        return result[0];
    }

    async updateUserTrustRating(userId: string): Promise<void> {
        const reviewData = await db
            .select({
                avgRating: sql<string>`COALESCE(AVG(${reviews.rating}), 0)`,
                count: sql<number>`cast(COUNT(*) as integer)`,
            })
            .from(reviews)
            .where(eq(reviews.targetUserId, userId));

        const avgRating = parseFloat(reviewData[0]?.avgRating || '0').toFixed(2);
        const count = reviewData[0]?.count || 0;

        await db
            .update(user)
            .set({
                trustRating: avgRating,
                reviewsCount: count,
            })
            .where(eq(user.id, userId));
    }

    async getUserReviews(userId: string) {
        return await db
            .select({
                review: reviews,
                reviewerName: user.name,
                itemTitle: items.title,
            })
            .from(reviews)
            .innerJoin(user, eq(reviews.reviewerId, user.id))
            .innerJoin(items, eq(reviews.itemId, items.id))
            .where(eq(reviews.targetUserId, userId))
            .orderBy(sql`${reviews.createdAt} DESC`);
    }

    async getUserTrustRating(userId: string) {
        const userData = await db
            .select({
                trustRating: user.trustRating,
                reviewsCount: user.reviewsCount,
            })
            .from(user)
            .where(eq(user.id, userId));

        return userData[0] || { trustRating: '0.00', reviewsCount: 0 };
    }

    /**
     * USER'S OWN ITEMS
     */
    async getUserItems(userId: string) {
        return await db
            .select({
                item: items,
                imageCount: sql<number>`cast(count(distinct ${itemImages.id}) as integer)`,
            })
            .from(items)
            .leftJoin(itemImages, eq(items.id, itemImages.itemId))
            .where(eq(items.sellerId, userId))
            .groupBy(items.id)
            .orderBy(sql`${items.createdAt} DESC`);
    }

    /**
     * USER'S CONVERSATIONS
     */
    async getUserConversations(userId: string) {
        return await db
            .select({
                conversation: conversations,
                itemTitle: items.title,
                otherUserName: sql<string>`CASE 
                    WHEN ${conversations.buyerId} = ${userId} THEN seller.name 
                    ELSE buyer.name 
                END`,
            })
            .from(conversations)
            .innerJoin(items, eq(conversations.itemId, items.id))
            .innerJoin(
                sql`${user} as buyer`,
                eq(conversations.buyerId, sql`buyer.id`)
            )
            .innerJoin(
                sql`${user} as seller`,
                eq(conversations.sellerId, sql`seller.id`)
            )
            .where(
                or(
                    eq(conversations.buyerId, userId),
                    eq(conversations.sellerId, userId)
                )!
            )
            .orderBy(sql`${conversations.updatedAt} DESC`);
    }
}

// Export singleton instance
export const marketplaceService = new MarketplaceService();
