#!/usr/bin/env bun

/**
 * Comprehensive Social API Routes Test
 * Tests all 30 API endpoints end-to-end
 * 
 * Run: bun run test-social-api.ts
 */

import { db } from './src/core/database/client';
import { user } from './src/modules/auth/auth.schema';
import { groups } from './src/modules/payments/payments.schema';
import {
    positions,
    positionPermissions,
    groupMembership,
    posts,
    announcements,
    introPosts,
    tags,
    userTags,
    polls,
    pollOptions,
    pollVotes,
    anonymousPollVotes,
    tasks,
    schedules,
} from './src/modules/social/social.schema';
import { eq, inArray } from 'drizzle-orm';

const BASE_URL = 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/social`;

interface TestUser {
    id: string;
    email: string;
    name: string;
}

class SocialAPITester {
    private users: TestUser[] = [];
    private groupId: string = '';
    private adminPositionId: string = '';
    private jcoPositionId: string = '';
    private developerTagId: string = '';
    private designerTagId: string = '';
    private pollId: string = '';
    private pollOptionIds: string[] = [];
    private taskId: string = '';
    private postId: string = '';

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

        if (this.groupId) {
            await db.delete(schedules).where(eq(schedules.userId, this.users[0]?.id || ''));
            await db.delete(tasks).where(eq(tasks.groupId, this.groupId));
            await db.delete(anonymousPollVotes);
            await db.delete(pollVotes);
            await db.delete(pollOptions);
            await db.delete(polls);
            await db.delete(userTags).where(eq(userTags.groupId, this.groupId));
            await db.delete(tags).where(eq(tags.groupId, this.groupId));
            await db.delete(introPosts);
            await db.delete(announcements);
            await db.delete(posts).where(eq(posts.groupId, this.groupId));
            await db.delete(groupMembership).where(eq(groupMembership.groupId, this.groupId));
            await db.delete(positionPermissions);
            await db.delete(positions).where(eq(positions.groupId, this.groupId));
            await db.delete(groups).where(eq(groups.id, this.groupId));
        }

        if (this.users.length > 0) {
            const userIds = this.users.map(u => u.id);
            await db.delete(user).where(inArray(user.id, userIds));
        }
    }

    async run() {
        console.log('🧪 Starting Comprehensive Social API Tests...\n');

        try {
            // Check if server is running
            await this.checkServerHealth();

            // Setup
            await this.setupTestData();

            // Test all endpoints
            await this.testPostsEndpoints();
            await this.testRBACEndpoints();
            await this.testAnnouncementEndpoints();
            await this.testMemberEndpoints();
            await this.testTagEndpoints();
            await this.testPollEndpoints();
            await this.testTaskEndpoints();

            console.log('\n🎉 All 30 API Endpoints Tested Successfully!');
            console.log('✅ All routes working perfectly!');

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

        // Create users
        const userNames = ['Admin User', 'Member User', 'New User'];
        for (const name of userNames) {
            const email = `test_api_${Date.now()}_${name.replace(/\s/g, '')}@example.com`;
            const result = await db.insert(user).values({
                email,
                name,
                emailVerified: true,
            }).returning();

            this.users.push({
                id: result[0].id,
                email,
                name,
            });
        }
        console.log('   ✓ Created 3 test users');

        // Create group
        const groupResult = await db.insert(groups).values({
            name: 'Test API Group',
            description: 'Testing API routes',
            createdBy: this.users[0].id,
        }).returning();
        this.groupId = groupResult[0].id;
        console.log('   ✓ Created test group');

        // Add members
        for (const testUser of this.users) {
            await db.insert(groupMembership).values({
                groupId: this.groupId,
                userId: testUser.id,
            });
        }
        console.log('   ✓ Added members to group');

        // Create initial admin position directly in DB (to bootstrap permissions)
        const adminPosResult = await db.insert(positions).values({
            groupId: this.groupId,
            name: 'Admin',
            description: 'Administrator role',
            isAdmin: true,
            createdBy: this.users[0].id,
        }).returning();
        this.adminPositionId = adminPosResult[0].id;

        // Add admin permissions
        const adminPermissions = ['assign_roles', 'create_announcements', 'manage_tags', 'assign_tasks', 'manage_positions'];
        for (const perm of adminPermissions) {
            await db.insert(positionPermissions).values({
                positionId: this.adminPositionId,
                permissionKey: perm,
            });
        }

        // Assign admin position to first user
        await db.update(groupMembership)
            .set({ positionId: this.adminPositionId })
            .where(eq(groupMembership.userId, this.users[0].id));

        console.log('   ✓ Created admin position and assigned to first user');
    }

    // ==================== POSTS ENDPOINTS ====================

    private async testPostsEndpoints() {
        console.log('\n3. Testing Posts Endpoints (6 endpoints)...');

        // POST /posts
        let res = await this.request('POST', `${API_BASE}/posts`, {
            userId: this.users[0].id,
            groupId: this.groupId,
            title: 'Test Post',
            content: 'This is a test post',
        });
        await this.assert(res.status === 201, 'POST /posts failed', res);
        const postData = await res.json();
        this.postId = postData.data.post.id;
        console.log('   ✓ POST /posts');

        // GET /posts
        res = await this.request('GET', `${API_BASE}/posts`);
        await this.assert(res.ok, 'GET /posts failed', res);
        const postsData = await res.json();
        await this.assert(postsData.data.posts.length > 0, 'No posts returned');
        console.log('   ✓ GET /posts');

        // GET /posts/:id
        res = await this.request('GET', `${API_BASE}/posts/${this.postId}`);
        await this.assert(res.ok, 'GET /posts/:id failed', res);
        console.log('   ✓ GET /posts/:id');

        // POST /comments
        res = await this.request('POST', `${API_BASE}/comments`, {
            postId: this.postId,
            userId: this.users[1].id,
            content: 'Great post!',
        });
        await this.assert(res.status === 201, 'POST /comments failed', res);
        console.log('   ✓ POST /comments');

        // GET /posts/:id/comments
        res = await this.request('GET', `${API_BASE}/posts/${this.postId}/comments`);
        await this.assert(res.ok, 'GET /posts/:id/comments failed', res);
        const commentsData = await res.json();
        await this.assert(commentsData.data.comments.length > 0, 'No comments returned');
        console.log('   ✓ GET /posts/:id/comments');

        // GET /users/:id/posts
        res = await this.request('GET', `${API_BASE}/users/${this.users[0].id}/posts`);
        await this.assert(res.ok, 'GET /users/:id/posts failed', res);
        console.log('   ✓ GET /users/:id/posts');
    }

    // ==================== RBAC ENDPOINTS ====================

    private async testRBACEndpoints() {
        console.log('\n4. Testing RBAC Endpoints (4 endpoints)...');

        // POST /groups/:groupId/positions (create admin position)
        let res = await this.request('POST', `${API_BASE}/groups/${this.groupId}/positions`, {
            name: 'Admin',
            description: 'Administrator role',
            isAdmin: true,
            permissions: ['assign_roles', 'create_announcements', 'manage_tags', 'assign_tasks'],
        }, this.users[0].id);
        await this.assert(res.status === 201, 'POST /groups/:groupId/positions failed', res);
        const adminPosData = await res.json();
        this.adminPositionId = adminPosData.data.position.id;
        console.log('   ✓ POST /groups/:groupId/positions (Admin)');

        // Create JCO position
        res = await this.request('POST', `${API_BASE}/groups/${this.groupId}/positions`, {
            name: 'jco',
            description: 'Junior Coordinator',
            isAdmin: false,
        }, this.users[0].id);
        await this.assert(res.status === 201, 'POST /groups/:groupId/positions (jco) failed', res);
        const jcoPosData = await res.json();
        this.jcoPositionId = jcoPosData.data.position.id;
        console.log('   ✓ POST /groups/:groupId/positions (JCO)');

        // GET /groups/:groupId/positions
        res = await this.request('GET', `${API_BASE}/groups/${this.groupId}/positions`);
        await this.assert(res.ok, 'GET /groups/:groupId/positions failed', res);
        const positionsData = await res.json();
        await this.assert(positionsData.data.positions.length >= 2, 'Not enough positions returned');
        console.log('   ✓ GET /groups/:groupId/positions');

        // POST /groups/:groupId/members/:userId/assign-position
        res = await this.request('POST', `${API_BASE}/groups/${this.groupId}/members/${this.users[0].id}/assign-position`, {
            positionId: this.adminPositionId,
        }, this.users[0].id);
        await this.assert(res.ok, 'POST assign-position failed', res);
        console.log('   ✓ POST /groups/:groupId/members/:userId/assign-position');

        // GET /groups/:groupId/members
        res = await this.request('GET', `${API_BASE}/groups/${this.groupId}/members`);
        await this.assert(res.ok, 'GET /groups/:groupId/members failed', res);
        const membersData = await res.json();
        await this.assert(membersData.data.members.length === 3, 'Wrong number of members');
        console.log('   ✓ GET /groups/:groupId/members');
    }

    // ==================== ANNOUNCEMENT ENDPOINTS ====================

    private async testAnnouncementEndpoints() {
        console.log('\n5. Testing Announcement Endpoints (2 endpoints)...');

        // POST /groups/:groupId/announcements
        const meetingDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        let res = await this.request('POST', `${API_BASE}/groups/${this.groupId}/announcements`, {
            title: 'Important Meeting',
            content: 'Team meeting next week',
            meetingDate,
            meetingLocation: 'Conference Room A',
            isUrgent: true,
        }, this.users[0].id);
        await this.assert(res.status === 201, 'POST /announcements failed', res);
        const announcementData = await res.json();
        await this.assert(announcementData.data.post.postType === 'announcement', 'Wrong post type');
        await this.assert(announcementData.data.post.isPinned === true, 'Announcement not pinned');
        console.log('   ✓ POST /groups/:groupId/announcements');

        // GET /groups/:groupId/announcements
        res = await this.request('GET', `${API_BASE}/groups/${this.groupId}/announcements`);
        await this.assert(res.ok, 'GET /announcements failed', res);
        const announcementsData = await res.json();
        await this.assert(announcementsData.data.announcements.length > 0, 'No announcements returned');
        console.log('   ✓ GET /groups/:groupId/announcements');

        // GET with urgent filter
        res = await this.request('GET', `${API_BASE}/groups/${this.groupId}/announcements?is_urgent=true`);
        await this.assert(res.ok, 'GET /announcements?is_urgent failed', res);
        console.log('   ✓ GET /groups/:groupId/announcements?is_urgent=true');
    }

    // ==================== MEMBER ENDPOINTS ====================

    private async testMemberEndpoints() {
        console.log('\n6. Testing Member Endpoints (2 endpoints)...');

        // POST /groups/:groupId/members (already tested in setup, but test intro creation)
        // We'll create a new user and add them
        const newUserResult = await db.insert(user).values({
            email: `new_member_${Date.now()}@example.com`,
            name: 'Brand New User',
            emailVerified: true,
        }).returning();
        const newUserId = newUserResult[0].id;

        let res = await this.request('POST', `${API_BASE}/groups/${this.groupId}/members`, {
            userId: newUserId,
        }, this.users[0].id);
        await this.assert(res.status === 201, 'POST /groups/:groupId/members failed', res);
        console.log('   ✓ POST /groups/:groupId/members (auto-creates intro)');

        // Verify intro post was created
        const introPosts = await db.select().from(posts).where(eq(posts.postType, 'intro'));
        await this.assert(introPosts.length > 0, 'Intro post not created automatically');
        console.log('   ✓ Verified intro post auto-creation');

        // POST /groups/:groupId/intro (self-intro)
        res = await this.request('POST', `${API_BASE}/groups/${this.groupId}/intro`, {
            content: 'Hi everyone! Excited to be here!',
        }, this.users[1].id);
        await this.assert(res.status === 201, 'POST /intro failed', res);
        console.log('   ✓ POST /groups/:groupId/intro');

        // Cleanup new user
        await db.delete(user).where(eq(user.id, newUserId));
    }

    // ==================== TAG ENDPOINTS ====================

    private async testTagEndpoints() {
        console.log('\n7. Testing Tag Endpoints (6 endpoints)...');

        // POST /groups/:groupId/tags (Developer)
        let res = await this.request('POST', `${API_BASE}/groups/${this.groupId}/tags`, {
            name: 'Developer',
            color: '#3B82F6',
            description: 'Software developers',
        }, this.users[0].id);
        await this.assert(res.status === 201, 'POST /tags (Developer) failed', res);
        const devTagData = await res.json();
        this.developerTagId = devTagData.data.tag.id;
        console.log('   ✓ POST /groups/:groupId/tags (Developer)');

        // POST /groups/:groupId/tags (Designer)
        res = await this.request('POST', `${API_BASE}/groups/${this.groupId}/tags`, {
            name: 'Designer',
            color: '#EC4899',
        }, this.users[0].id);
        await this.assert(res.status === 201, 'POST /tags (Designer) failed', res);
        const designerTagData = await res.json();
        this.designerTagId = designerTagData.data.tag.id;
        console.log('   ✓ POST /groups/:groupId/tags (Designer)');

        // GET /groups/:groupId/tags
        res = await this.request('GET', `${API_BASE}/groups/${this.groupId}/tags`);
        await this.assert(res.ok, 'GET /tags failed', res);
        const tagsData = await res.json();
        await this.assert(tagsData.data.tags.length >= 2, 'Not enough tags returned');
        console.log('   ✓ GET /groups/:groupId/tags');

        // POST /groups/:groupId/members/:userId/tags
        res = await this.request('POST', `${API_BASE}/groups/${this.groupId}/members/${this.users[1].id}/tags`, {
            tagId: this.developerTagId,
        }, this.users[0].id);
        await this.assert(res.status === 201, 'POST assign tag failed', res);
        console.log('   ✓ POST /groups/:groupId/members/:userId/tags');

        // GET /groups/:groupId/members/by-tags
        res = await this.request('GET', `${API_BASE}/groups/${this.groupId}/members/by-tags?tags=${this.developerTagId}`);
        await this.assert(res.ok, 'GET /members/by-tags failed', res);
        const filteredMembers = await res.json();
        await this.assert(filteredMembers.data.members.length > 0, 'No members with tag found');
        console.log('   ✓ GET /groups/:groupId/members/by-tags');

        // GET /groups/:groupId/members/:userId/tags
        res = await this.request('GET', `${API_BASE}/groups/${this.groupId}/members/${this.users[1].id}/tags`);
        await this.assert(res.ok, 'GET user tags failed', res);
        const userTagsData = await res.json();
        await this.assert(userTagsData.data.tags.length > 0, 'No tags for user');
        console.log('   ✓ GET /groups/:groupId/members/:userId/tags');

        // DELETE /groups/:groupId/members/:userId/tags/:tagId
        res = await this.request('DELETE', `${API_BASE}/groups/${this.groupId}/members/${this.users[1].id}/tags/${this.developerTagId}`, undefined, this.users[0].id);
        await this.assert(res.ok, 'DELETE tag failed', res);
        console.log('   ✓ DELETE /groups/:groupId/members/:userId/tags/:tagId');
    }

    // ==================== POLL ENDPOINTS ====================

    private async testPollEndpoints() {
        console.log('\n8. Testing Poll Endpoints (3 endpoints)...');

        // POST /groups/:groupId/polls (anonymous)
        let res = await this.request('POST', `${API_BASE}/groups/${this.groupId}/polls`, {
            question: 'Best meeting time?',
            options: [
                { text: '9 AM', order: 1 },
                { text: '2 PM', order: 2 },
                { text: '5 PM', order: 3 },
            ],
            isAnonymous: true,
            isMultipleChoice: false,
        }, this.users[0].id);
        await this.assert(res.status === 201, 'POST /polls failed', res);
        const pollData = await res.json();
        this.pollId = pollData.data.poll.id;
        this.pollOptionIds = pollData.data.options.map((opt: any) => opt.id);
        await this.assert(pollData.data.poll.isAnonymous === true, 'Poll not anonymous');
        console.log('   ✓ POST /groups/:groupId/polls');

        // POST /polls/:pollId/vote
        res = await this.request('POST', `${API_BASE}/polls/${this.pollId}/vote`, {
            optionIds: [this.pollOptionIds[0]],
        }, this.users[1].id);
        await this.assert(res.ok, 'POST /vote failed', res);
        console.log('   ✓ POST /polls/:pollId/vote');

        // Try to vote again (should fail)
        res = await this.request('POST', `${API_BASE}/polls/${this.pollId}/vote`, {
            optionIds: [this.pollOptionIds[1]],
        }, this.users[1].id);
        await this.assert(res.status === 400, 'Double voting should be prevented', res);
        console.log('   ✓ Verified double-voting prevention');

        // GET /polls/:pollId/results
        res = await this.request('GET', `${API_BASE}/polls/${this.pollId}/results`, undefined, this.users[1].id);
        await this.assert(res.ok, 'GET /results failed', res);
        const resultsData = await res.json();
        await this.assert(resultsData.data.poll.isAnonymous === true, 'Poll anonymity not preserved');
        await this.assert(resultsData.data.options[0].voters.length === 0, 'PRIVACY VIOLATION: Voters exposed in anonymous poll!');
        await this.assert(resultsData.data.userHasVoted === true, 'User vote status not tracked');
        await this.assert(resultsData.data.totalVotes === 1, 'Vote not counted');
        console.log('   ✓ GET /polls/:pollId/results');
        console.log('   ✓ PRIVACY VERIFIED: Anonymous poll protects voter identity');
    }

    // ==================== TASK ENDPOINTS ====================

    private async testTaskEndpoints() {
        console.log('\n9. Testing Task & Schedule Endpoints (5 endpoints)...');

        // POST /groups/:groupId/tasks
        const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
        let res = await this.request('POST', `${API_BASE}/groups/${this.groupId}/tasks`, {
            title: 'Complete documentation',
            description: 'Write comprehensive docs',
            assignedTo: this.users[1].id,
            dueDate,
            priority: 'high',
        }, this.users[0].id);
        await this.assert(res.status === 201, 'POST /tasks failed', res);
        const taskData = await res.json();
        this.taskId = taskData.data.task.id;
        await this.assert(taskData.data.schedule !== null, 'Schedule not auto-created');
        console.log('   ✓ POST /groups/:groupId/tasks');
        console.log('   ✓ Verified schedule auto-creation');

        // GET /groups/:groupId/tasks
        res = await this.request('GET', `${API_BASE}/groups/${this.groupId}/tasks`);
        await this.assert(res.ok, 'GET /tasks failed', res);
        const tasksData = await res.json();
        await this.assert(tasksData.data.tasks.length > 0, 'No tasks returned');
        console.log('   ✓ GET /groups/:groupId/tasks');

        // GET with filters
        res = await this.request('GET', `${API_BASE}/groups/${this.groupId}/tasks?assigned_to=${this.users[1].id}&status=pending`);
        await this.assert(res.ok, 'GET /tasks with filters failed', res);
        console.log('   ✓ GET /groups/:groupId/tasks?filters');

        // PUT /tasks/:taskId
        const newDueDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
        res = await this.request('PUT', `${API_BASE}/tasks/${this.taskId}`, {
            dueDate: newDueDate,
            status: 'in_progress',
        });
        await this.assert(res.ok, 'PUT /tasks/:taskId failed', res);
        console.log('   ✓ PUT /tasks/:taskId');

        // Verify schedule was synced
        const scheduleData = await db.select().from(schedules).where(eq(schedules.sourceTaskId, this.taskId));
        await this.assert(scheduleData.length > 0, 'Schedule not found');
        await this.assert(
            new Date(scheduleData[0].startTime).getTime() === new Date(newDueDate).getTime(),
            'Schedule not synced with task update'
        );
        console.log('   ✓ Verified schedule sync on task update');

        // GET /users/:userId/schedule
        res = await this.request('GET', `${API_BASE}/users/${this.users[1].id}/schedule`);
        await this.assert(res.ok, 'GET /schedule failed', res);
        const scheduleResults = await res.json();
        await this.assert(scheduleResults.data.schedule.length > 0, 'No schedule entries');
        await this.assert(scheduleResults.data.schedule[0].task !== null, 'Task details not included');
        console.log('   ✓ GET /users/:userId/schedule');

        // DELETE /tasks/:taskId
        res = await this.request('DELETE', `${API_BASE}/tasks/${this.taskId}`);
        await this.assert(res.ok, 'DELETE /tasks/:taskId failed', res);
        console.log('   ✓ DELETE /tasks/:taskId');

        // Verify schedule was deleted
        const deletedSchedule = await db.select().from(schedules).where(eq(schedules.sourceTaskId, this.taskId));
        await this.assert(deletedSchedule.length === 0, 'Schedule not deleted with task');
        console.log('   ✓ Verified schedule cascade delete');

        // DELETE /posts/:id (test post deletion)
        res = await this.request('DELETE', `${API_BASE}/posts/${this.postId}`);
        await this.assert(res.ok, 'DELETE /posts/:id failed', res);
        console.log('   ✓ DELETE /posts/:id');
    }
}

// Run tests
const tester = new SocialAPITester();
tester.run();
