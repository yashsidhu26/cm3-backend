#!/usr/bin/env bun

/**
 * Comprehensive Marketplace API Test Suite
 * Tests all marketplace endpoints end-to-end with privacy verification
 * 
 * Run: bun run test-marketplace-comprehensive.ts
 */

import { db } from './src/core/database/client';
import { user } from './src/modules/auth/auth.schema';
import {
    items,
    itemImages,
    conversations,
    messages,
    reviews,
} from './src/modules/marketplace/marketplace.schema';
import { eq, inArray } from 'drizzle-orm';

const BASE_URL = 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/marketplace`;

interface TestUser {
    id: string;
    email: string;
    name: string;
}

class MarketplaceAPITester {
    private users: TestUser[] = [];
    private itemId: string = '';
    private conversationId: string = '';

    private async request(method: string, url: string, body?: any, userId?: string) {
        const headers: any = {
            'Content-Type': 'application/json',
        };

        if (userId) {
            headers['x-user-id'] = userId;
        }

        const response = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });

        return response;
    }

    private async assert(condition: boolean, message: string, response?: Response) {
        if (!condition) {
            let details = '';
            if (response) {
                try {
                    const data = await response.json();
                    details = `\nResponse: ${JSON.stringify(data, null, 2)}`;
                } catch (e) {
                    details = `\nCould not parse response body`;
                }
            }
            throw new Error(`${message}${details}`);
        }
    }

    private async cleanup() {
        console.log('🧹 Cleaning up test data...');

        if (this.itemId) {
            await db.delete(reviews).where(eq(reviews.itemId, this.itemId));
            await db.delete(messages);
            await db.delete(conversations);
            await db.delete(itemImages).where(eq(itemImages.itemId, this.itemId));
            await db.delete(items).where(eq(items.id, this.itemId));
        }

        if (this.users.length > 0) {
            const userIds = this.users.map(u => u.id);
            await db.delete(user).where(inArray(user.id, userIds));
        }
    }

    async run() {
        console.log('🧪 Starting Comprehensive Marketplace API Tests...\n');

        try {
            // Check if server is running
            await this.checkServerHealth();

            // Setup
            await this.setupTestData();

            // Test all endpoints
            await this.testItemEndpoints();
            await this.testConversationEndpoints();
            await this.testHandshakeProtocol();
            await this.testReviewEndpoints();
            await this.testPrivacyControls();

            console.log('\n🎉 All Marketplace API Endpoints Tested Successfully!');
            console.log('✅ Privacy controls verified!');
            console.log('✅ Handshake protocol working perfectly!');

            await this.cleanup();
            process.exit(0);
        } catch (error: any) {
            console.error('\n❌ Test Failed:', error.message);
            await this.cleanup();
            process.exit(1);
        }
    }

    // ==================== SETUP ====================

    private async checkServerHealth() {
        console.log('1. Checking Server Health...');
        try {
            const response = await fetch(`${BASE_URL}/health`);
            await this.assert(response.ok, 'Server health check failed', response);
            console.log('   ✓ Server is running');
        } catch (error) {
            throw new Error('Server is not running. Please start it with: bun run src/app.ts');
        }
    }

    private async setupTestData() {
        console.log('\n2. Setting Up Test Data...');

        // Create users with marketplace fields
        const userNames = ['Test Seller', 'Test Buyer'];
        for (const name of userNames) {
            const email = `test_marketplace_${Date.now()}_${name.replace(/\s/g, '')}@example.com`;
            const result = await db.insert(user).values({
                email,
                name,
                emailVerified: true,
                phoneNumber: `+91-98765${Math.floor(10000 + Math.random() * 90000)}`,
                hostelRoom: `H${Math.floor(1 + Math.random() * 5)}-${Math.floor(100 + Math.random() * 900)}`,
            }).returning();

            this.users.push({
                id: result[0].id,
                email,
                name,
            });
        }
        console.log('   ✓ Created 2 test users with PII');
    }

    // ==================== ITEM ENDPOINTS ====================

    private async testItemEndpoints() {
        console.log('\n3. Testing Item Endpoints (6 endpoints)...');

        // POST /items (Sale)
        let res = await this.request('POST', `${API_BASE}/items`, {
            title: 'MacBook Pro 2021',
            description: 'Excellent condition, barely used. M1 chip, 16GB RAM',
            price: '45000.00',
            listingType: 'sale',
            category: 'electronics',
            condition: 'like_new',
            hostelZone: 'Hostel 4',
            images: ['https://example.com/laptop1.jpg', 'https://example.com/laptop2.jpg'],
        }, this.users[0].id);
        await this.assert(res.status === 201, 'POST /items (sale) failed', res);
        const itemData = await res.json();
        this.itemId = itemData.data.item.id;
        console.log('   ✓ POST /items (sale listing)');

        // POST /items (Trade)
        res = await this.request('POST', `${API_BASE}/items`, {
            title: 'TI-84 Calculator',
            description: 'Looking to trade for textbooks',
            price: null,
            tradeWishlist: 'Engineering textbooks, preferably Thermodynamics or Fluid Mechanics',
            listingType: 'trade',
            category: 'lab_gear',
            condition: 'good',
        }, this.users[0].id);
        await this.assert(res.status === 201, 'POST /items (trade) failed', res);
        console.log('   ✓ POST /items (trade listing)');

        // POST /items (Both)
        res = await this.request('POST', `${API_BASE}/items`, {
            title: 'Textbook Bundle',
            description: 'Semester 1 books, willing to sell or trade',
            price: '2000.00',
            tradeWishlist: 'Semester 2 books',
            listingType: 'both',
            category: 'books',
            condition: 'good',
        }, this.users[0].id);
        await this.assert(res.status === 201, 'POST /items (both) failed', res);
        console.log('   ✓ POST /items (both sale/trade)');

        // Validation: Trade-only with price should fail
        res = await this.request('POST', `${API_BASE}/items`, {
            title: 'Invalid Item',
            description: 'This should fail',
            price: '100.00',
            listingType: 'trade',
            category: 'other',
        }, this.users[0].id);
        await this.assert(res.status === 400, 'Validation failed: trade with price accepted', res);
        console.log('   ✓ Validation: Trade-only with price rejected');

        // GET /items (Public Feed)
        res = await this.request('GET', `${API_BASE}/items`);
        await this.assert(res.ok, 'GET /items failed', res);
        const feedData = await res.json();
        await this.assert(feedData.data.items.length >= 3, 'Not enough items in feed');
        console.log('   ✓ GET /items (public feed)');

        // GET /items/:id
        res = await this.request('GET', `${API_BASE}/items/${this.itemId}`);
        await this.assert(res.ok, 'GET /items/:id failed', res);
        const singleItemData = await res.json();
        await this.assert(singleItemData.data.item.id === this.itemId, 'Wrong item returned');
        await this.assert(singleItemData.data.images.length === 2, 'Images not returned');
        console.log('   ✓ GET /items/:id');

        // PUT /items/:id
        res = await this.request('PUT', `${API_BASE}/items/${this.itemId}`, {
            price: '42000.00',
            description: 'Price reduced! Excellent condition, barely used. M1 chip, 16GB RAM',
        }, this.users[0].id);
        await this.assert(res.ok, 'PUT /items/:id failed', res);
        console.log('   ✓ PUT /items/:id');

        // GET /my-items
        res = await this.request('GET', `${API_BASE}/my-items`, undefined, this.users[0].id);
        await this.assert(res.ok, 'GET /my-items failed', res);
        const myItemsData = await res.json();
        await this.assert(myItemsData.data.items.length >= 3, 'Not all items returned');
        console.log('   ✓ GET /my-items');

        // Search & Filter
        res = await this.request('GET', `${API_BASE}/items?category=electronics&min_price=40000&max_price=50000&search=macbook`);
        await this.assert(res.ok, 'GET /items with filters failed', res);
        const searchData = await res.json();
        await this.assert(searchData.data.items.length > 0, 'Search returned no results');
        console.log('   ✓ GET /items with search & filters');
    }

    // ==================== CONVERSATION ENDPOINTS ====================

    private async testConversationEndpoints() {
        console.log('\n4. Testing Conversation Endpoints (4 endpoints)...');

        // POST /chat/start
        let res = await this.request('POST', `${API_BASE}/chat/start`, {
            itemId: this.itemId,
        }, this.users[1].id);
        await this.assert(res.status === 201, 'POST /chat/start failed', res);
        const convData = await res.json();
        this.conversationId = convData.data.conversation.id;
        await this.assert(convData.data.conversation.stage === 'negotiation', 'Wrong initial stage');
        console.log('   ✓ POST /chat/start');

        // Prevent seller from messaging themselves
        res = await this.request('POST', `${API_BASE}/chat/start`, {
            itemId: this.itemId,
        }, this.users[0].id);
        await this.assert(res.status === 400, 'Self-conversation should be prevented', res);
        console.log('   ✓ Verified self-conversation prevention');

        // POST /chat/:id/message (Buyer)
        res = await this.request('POST', `${API_BASE}/chat/${this.conversationId}/message`, {
            content: 'Hi! Is this item still available?',
        }, this.users[1].id);
        await this.assert(res.status === 201, 'POST /chat/:id/message (buyer) failed', res);
        console.log('   ✓ POST /chat/:id/message (buyer)');

        // POST /chat/:id/message (Seller)
        res = await this.request('POST', `${API_BASE}/chat/${this.conversationId}/message`, {
            content: 'Yes! It\'s available. Would you like to see it?',
        }, this.users[0].id);
        await this.assert(res.status === 201, 'POST /chat/:id/message (seller) failed', res);
        console.log('   ✓ POST /chat/:id/message (seller)');

        // GET /chat/:id/messages
        res = await this.request('GET', `${API_BASE}/chat/${this.conversationId}/messages`, undefined, this.users[1].id);
        await this.assert(res.ok, 'GET /chat/:id/messages failed', res);
        const messagesData = await res.json();
        await this.assert(messagesData.data.messages.length >= 2, 'Not all messages returned');
        console.log('   ✓ GET /chat/:id/messages');

        // GET /my-conversations
        res = await this.request('GET', `${API_BASE}/my-conversations`, undefined, this.users[1].id);
        await this.assert(res.ok, 'GET /my-conversations failed', res);
        const convsData = await res.json();
        await this.assert(convsData.data.conversations.length > 0, 'No conversations returned');
        console.log('   ✓ GET /my-conversations');
    }

    // ==================== HANDSHAKE PROTOCOL ====================

    private async testHandshakeProtocol() {
        console.log('\n5. Testing Handshake Protocol (3 endpoints)...');

        // GET /chat/:id/secure-details (Before reveal - should fail)
        let res = await this.request('GET', `${API_BASE}/chat/${this.conversationId}/secure-details`, undefined, this.users[1].id);
        await this.assert(res.status === 403, 'Contact info should not be available before reveal', res);
        console.log('   ✓ Verified PII blocked before reveal');

        // POST /chat/:id/reveal (Seller reveals)
        res = await this.request('POST', `${API_BASE}/chat/${this.conversationId}/reveal`, undefined, this.users[0].id);
        await this.assert(res.ok, 'POST /chat/:id/reveal failed', res);
        const revealData = await res.json();
        await this.assert(revealData.data.conversation.stage === 'seller_revealed', 'Stage not updated');
        await this.assert(revealData.data.conversation.sellerRevealed === true, 'sellerRevealed flag not set');
        console.log('   ✓ POST /chat/:id/reveal (seller)');

        // Verify system message was injected
        res = await this.request('GET', `${API_BASE}/chat/${this.conversationId}/messages`, undefined, this.users[1].id);
        const msgs = await res.json();
        const systemMsg = msgs.data.messages.find((m: any) => m.isSystemMessage);
        await this.assert(systemMsg !== undefined, 'System message not injected');
        console.log('   ✓ Verified system message injection');

        // GET /chat/:id/secure-details (After reveal - buyer sees seller info)
        res = await this.request('GET', `${API_BASE}/chat/${this.conversationId}/secure-details`, undefined, this.users[1].id);
        await this.assert(res.ok, 'GET /chat/:id/secure-details (after reveal) failed', res);
        const contactData = await res.json();
        await this.assert(contactData.data.sellerInfo !== undefined, 'Seller info not returned');
        await this.assert(contactData.data.sellerInfo.phoneNumber !== null, 'Seller phone not returned');
        await this.assert(contactData.data.buyerInfo === undefined, 'Buyer info leaked before finalization');
        console.log('   ✓ GET /chat/:id/secure-details (buyer sees seller)');

        // Seller should NOT see buyer info yet
        res = await this.request('GET', `${API_BASE}/chat/${this.conversationId}/secure-details`, undefined, this.users[0].id);
        const sellerView = await res.json();
        await this.assert(sellerView.data.buyerInfo === undefined, 'PRIVACY VIOLATION: Buyer info leaked before finalization');
        console.log('   ✓ Verified buyer PII still protected');

        // POST /chat/:id/finalize
        res = await this.request('POST', `${API_BASE}/chat/${this.conversationId}/finalize`, undefined, this.users[1].id);
        await this.assert(res.ok, 'POST /chat/:id/finalize failed', res);
        const finalizeData = await res.json();
        await this.assert(finalizeData.data.conversation.stage === 'finalized', 'Stage not updated to finalized');
        await this.assert(finalizeData.data.conversation.dealFinalized === true, 'dealFinalized flag not set');
        console.log('   ✓ POST /chat/:id/finalize');

        // Verify item marked as SOLD
        res = await this.request('GET', `${API_BASE}/items/${this.itemId}`);
        const itemCheck = await res.json();
        await this.assert(itemCheck.data.item.status === 'sold', 'Item not marked as SOLD');
        console.log('   ✓ Verified item marked as SOLD');

        // Both parties can now see each other's info
        res = await this.request('GET', `${API_BASE}/chat/${this.conversationId}/secure-details`, undefined, this.users[0].id);
        const sellerFinalView = await res.json();
        await this.assert(sellerFinalView.data.buyerInfo !== undefined, 'Buyer info not available after finalization');
        await this.assert(sellerFinalView.data.sellerInfo !== undefined, 'Seller info not available');
        console.log('   ✓ Seller can now see buyer info');

        res = await this.request('GET', `${API_BASE}/chat/${this.conversationId}/secure-details`, undefined, this.users[1].id);
        const buyerFinalView = await res.json();
        await this.assert(buyerFinalView.data.sellerInfo !== undefined, 'Seller info not available');
        await this.assert(buyerFinalView.data.buyerInfo !== undefined, 'Buyer info not available');
        console.log('   ✓ Buyer can see both parties\' info');
    }

    // ==================== REVIEW ENDPOINTS ====================

    private async testReviewEndpoints() {
        console.log('\n6. Testing Review Endpoints (3 endpoints)...');

        // POST /reviews (Buyer reviews seller)
        let res = await this.request('POST', `${API_BASE}/reviews`, {
            targetUserId: this.users[0].id,
            itemId: this.itemId,
            rating: 5,
            comment: 'Great seller! Item exactly as described. Smooth transaction.',
        }, this.users[1].id);
        await this.assert(res.status === 201, 'POST /reviews failed', res);
        console.log('   ✓ POST /reviews (buyer → seller)');

        // POST /reviews (Seller reviews buyer)
        res = await this.request('POST', `${API_BASE}/reviews`, {
            targetUserId: this.users[1].id,
            itemId: this.itemId,
            rating: 5,
            comment: 'Excellent buyer! Quick payment and communication.',
        }, this.users[0].id);
        await this.assert(res.status === 201, 'POST /reviews failed', res);
        console.log('   ✓ POST /reviews (seller → buyer)');

        // Prevent duplicate review
        res = await this.request('POST', `${API_BASE}/reviews`, {
            targetUserId: this.users[0].id,
            itemId: this.itemId,
            rating: 4,
            comment: 'Trying to review again',
        }, this.users[1].id);
        await this.assert(res.status === 400, 'Duplicate review should be prevented', res);
        console.log('   ✓ Verified duplicate review prevention');

        // GET /users/:id/reviews
        res = await this.request('GET', `${API_BASE}/users/${this.users[0].id}/reviews`);
        await this.assert(res.ok, 'GET /users/:id/reviews failed', res);
        const reviewsData = await res.json();
        await this.assert(reviewsData.data.reviews.length > 0, 'No reviews returned');
        console.log('   ✓ GET /users/:id/reviews');

        // GET /users/:id/trust-rating
        res = await this.request('GET', `${API_BASE}/users/${this.users[0].id}/trust-rating`);
        await this.assert(res.ok, 'GET /users/:id/trust-rating failed', res);
        const trustData = await res.json();
        await this.assert(parseFloat(trustData.data.trustRating) === 5.0, 'Trust rating not calculated correctly');
        await this.assert(trustData.data.reviewsCount === 1, 'Review count incorrect');
        console.log('   ✓ GET /users/:id/trust-rating');
        console.log('   ✓ Verified trust rating calculation (5.00/5.00)');
    }

    // ==================== PRIVACY CONTROLS ====================

    private async testPrivacyControls() {
        console.log('\n7. Testing Privacy Controls...');

        // GET /items - Verify NO PII in public feed
        const res = await this.request('GET', `${API_BASE}/items`);
        const feedData = await res.json();

        for (const itemData of feedData.data.items) {
            if (itemData.phoneNumber || itemData.hostelRoom || itemData.item?.phoneNumber || itemData.item?.hostelRoom) {
                throw new Error('❌ CRITICAL PRIVACY VIOLATION: PII found in public feed!');
            }
        }
        console.log('   ✓ PRIVACY VERIFIED: No PII in public feed');

        // Verify PII fields exist in database but not in API response
        const dbUser = await db.select().from(user).where(eq(user.id, this.users[0].id));
        await this.assert(dbUser[0].phoneNumber !== null, 'Phone number not in database');
        await this.assert(dbUser[0].hostelRoom !== null, 'Hostel room not in database');
        console.log('   ✓ PRIVACY VERIFIED: PII stored in DB but excluded from API');

        console.log('\n   🔒 PRIVACY AUDIT COMPLETE:');
        console.log('      ✓ Public feed excludes all PII');
        console.log('      ✓ Contact info gated by handshake protocol');
        console.log('      ✓ Progressive disclosure working correctly');
        console.log('      ✓ System messages notify state changes');
    }
}

// Run tests
const tester = new MarketplaceAPITester();
tester.run();
