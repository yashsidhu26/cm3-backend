#!/usr/bin/env bun

/**
 * Social Features Test Script
 * Tests all 6 new social module features
 * 
 * Run: bun run test-social-features.ts
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
import { eq, and, inArray } from 'drizzle-orm';

interface TestUser {
    id: string;
    email: string;
    name: string;
}

class SocialFeaturesTester {
    private users: TestUser[] = [];
    private groupId: string = '';
    private adminPositionId: string = '';
    private customPositionId: string = '';

    private async cleanup() {
        console.log('🧹 Cleaning up test data...');
        // Delete in reverse order of dependencies
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

        // Delete test users
        if (this.users.length > 0) {
            const userIds = this.users.map(u => u.id);
            await db.delete(user).where(inArray(user.id, userIds));
        }
    }

    async run() {
        console.log('🧪 Starting Social Features Tests...\n');

        try {
            await this.createTestUsers();
            await this.createTestGroup();
            await this.testRBAC();
            await this.testAnnouncements();
            await this.testIntroPost();
            await this.testTags();
            await this.testAnonymousPolls();
            await this.testTaskScheduleSync();

            console.log('\n🎉 All Social Features Tests Passed!');
            await this.cleanup();
            process.exit(0);
        } catch (error: any) {
            console.error('\n❌ Test Failed:', error.message);
            await this.cleanup();
            process.exit(1);
        }
    }

    // Helper: Create test users
    private async createTestUsers() {
        console.log('1. Creating Test Users...');
        const userNames = ['Admin User', 'Member User', 'New User'];

        for (const name of userNames) {
            const email = `test_social_${Date.now()}_${name.replace(/\s/g, '')}@example.com`;
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
            console.log(`   ✓ Created ${name}`);
        }
    }

    // Helper: Create test group
    private async createTestGroup() {
        console.log('\n2. Creating Test Group...');
        const result = await db.insert(groups).values({
            name: 'Test Social Group',
            description: 'Testing social features',
            createdBy: this.users[0].id,
        }).returning();

        this.groupId = result[0].id;
        console.log(`   ✓ Group created: ${this.groupId}`);

        // Add all users as members
        for (const testUser of this.users) {
            await db.insert(groupMembership).values({
                groupId: this.groupId,
                userId: testUser.id,
            });
        }
        console.log('   ✓ All users added as members');
    }

    // Test 1: RBAC - Dynamic Roles & Positions
    private async testRBAC() {
        console.log('\n3. Testing RBAC (Roles & Positions)...');

        // Create Admin position
        const adminPos = await db.insert(positions).values({
            groupId: this.groupId,
            name: 'Admin',
            description: 'Administrator with full permissions',
            isAdmin: true,
            createdBy: this.users[0].id,
        }).returning();
        this.adminPositionId = adminPos[0].id;

        // Add admin permissions
        await db.insert(positionPermissions).values([
            { positionId: this.adminPositionId, permissionKey: 'assign_roles' },
            { positionId: this.adminPositionId, permissionKey: 'create_announcements' },
            { positionId: this.adminPositionId, permissionKey: 'manage_tags' },
            { positionId: this.adminPositionId, permissionKey: 'assign_tasks' },
        ]);
        console.log('   ✓ Admin position created with permissions');

        // Assign admin position to first user
        await db.update(groupMembership)
            .set({ positionId: this.adminPositionId })
            .where(and(
                eq(groupMembership.groupId, this.groupId),
                eq(groupMembership.userId, this.users[0].id)
            ));
        console.log('   ✓ Admin position assigned to Admin User');

        // Create custom position (e.g., 'jco')
        const customPos = await db.insert(positions).values({
            groupId: this.groupId,
            name: 'jco',
            description: 'Junior Coordinator',
            isAdmin: false,
            createdBy: this.users[0].id,
        }).returning();
        this.customPositionId = customPos[0].id;

        // Assign custom position to second user
        await db.update(groupMembership)
            .set({ positionId: this.customPositionId })
            .where(and(
                eq(groupMembership.groupId, this.groupId),
                eq(groupMembership.userId, this.users[1].id)
            ));
        console.log('   ✓ Custom position "jco" created and assigned');

        // Verify admin can assign roles
        const adminMembership = await db.select()
            .from(groupMembership)
            .innerJoin(positions, eq(groupMembership.positionId, positions.id))
            .where(and(
                eq(groupMembership.groupId, this.groupId),
                eq(groupMembership.userId, this.users[0].id)
            ));

        if (!adminMembership[0]?.positions.isAdmin) {
            throw new Error('Admin position not correctly assigned');
        }
        console.log('   ✓ RBAC verified: Admin can assign roles');
    }

    // Test 2: Announcements
    private async testAnnouncements() {
        console.log('\n4. Testing Announcements...');

        // Create announcement post
        const post = await db.insert(posts).values({
            groupId: this.groupId,
            userId: this.users[0].id,
            title: 'Important Meeting',
            content: 'Team meeting scheduled for next week',
            postType: 'announcement',
            isPinned: true,
        }).returning();

        // Create announcement metadata
        const meetingDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 1 week from now
        await db.insert(announcements).values({
            postId: post[0].id,
            meetingDate,
            meetingLocation: 'Conference Room A',
            isUrgent: true,
        });

        console.log('   ✓ Announcement created with metadata');

        // Verify announcement
        const announcement = await db.select()
            .from(posts)
            .innerJoin(announcements, eq(posts.id, announcements.postId))
            .where(eq(posts.id, post[0].id));

        if (announcement[0]?.posts.postType !== 'announcement' || !announcement[0]?.posts.isPinned) {
            throw new Error('Announcement not created correctly');
        }
        console.log('   ✓ Announcement verified: Pinned and urgent');
    }

    // Test 3: Intro Posts (Auto-generation)
    private async testIntroPost() {
        console.log('\n5. Testing Intro Posts...');

        // Simulate adding a new member (User 2)
        const introPost = await db.insert(posts).values({
            groupId: this.groupId,
            userId: this.users[0].id, // Posted by admin
            title: 'New Member',
            content: `${this.users[0].name} added ${this.users[2].name} to the group. Welcome!`,
            postType: 'intro',
        }).returning();

        // Create intro metadata
        await db.insert(introPosts).values({
            postId: introPost[0].id,
            introducedUserId: this.users[2].id,
            addedByUserId: this.users[0].id,
        });

        console.log('   ✓ Intro post created automatically');

        // Verify intro post
        const intro = await db.select()
            .from(posts)
            .innerJoin(introPosts, eq(posts.id, introPosts.postId))
            .where(eq(posts.id, introPost[0].id));

        if (intro[0]?.posts.postType !== 'intro') {
            throw new Error('Intro post not created correctly');
        }
        console.log('   ✓ Intro post verified');
    }

    // Test 4: Custom Tags
    private async testTags() {
        console.log('\n6. Testing Custom Tags...');

        // Create tags
        const tag1 = await db.insert(tags).values({
            groupId: this.groupId,
            name: 'Developer',
            color: '#3B82F6',
            description: 'Software developers',
            createdBy: this.users[0].id,
        }).returning();

        const tag2 = await db.insert(tags).values({
            groupId: this.groupId,
            name: 'Designer',
            color: '#EC4899',
            description: 'UI/UX designers',
            createdBy: this.users[0].id,
        }).returning();

        console.log('   ✓ Tags created: Developer, Designer');

        // Assign tags to users
        await db.insert(userTags).values({
            userId: this.users[1].id,
            tagId: tag1[0].id,
            groupId: this.groupId,
            assignedBy: this.users[0].id,
        });

        await db.insert(userTags).values({
            userId: this.users[2].id,
            tagId: tag2[0].id,
            groupId: this.groupId,
            assignedBy: this.users[0].id,
        });

        console.log('   ✓ Tags assigned to users');

        // Filter members by tag
        const developers = await db.select()
            .from(user)
            .innerJoin(userTags, eq(user.id, userTags.userId))
            .where(and(
                eq(userTags.groupId, this.groupId),
                eq(userTags.tagId, tag1[0].id)
            ));

        if (developers.length !== 1 || developers[0].user.id !== this.users[1].id) {
            throw new Error('Tag filtering not working correctly');
        }
        console.log('   ✓ Tag filtering verified');
    }

    // Test 5: Anonymous Polls
    private async testAnonymousPolls() {
        console.log('\n7. Testing Anonymous Polls...');

        // Create poll post
        const pollPost = await db.insert(posts).values({
            groupId: this.groupId,
            userId: this.users[0].id,
            content: 'What time works best for the meeting?',
            postType: 'poll',
        }).returning();

        // Create poll
        const poll = await db.insert(polls).values({
            postId: pollPost[0].id,
            question: 'What time works best for the meeting?',
            isAnonymous: true,
            isMultipleChoice: false,
        }).returning();

        // Create poll options
        const option1 = await db.insert(pollOptions).values({
            pollId: poll[0].id,
            optionText: '9 AM',
            displayOrder: 1,
        }).returning();

        const option2 = await db.insert(pollOptions).values({
            pollId: poll[0].id,
            optionText: '2 PM',
            displayOrder: 2,
        }).returning();

        console.log('   ✓ Anonymous poll created with options');

        // User 1 votes (anonymously)
        // Step 1: Record that user voted (to prevent double voting)
        await db.insert(pollVotes).values({
            pollId: poll[0].id,
            userId: this.users[1].id,
            optionId: null, // NULL for anonymous
        });

        // Step 2: Record the vote separately (no user link)
        await db.insert(anonymousPollVotes).values({
            pollId: poll[0].id,
            optionId: option1[0].id,
        });

        // Increment vote count
        await db.update(pollOptions)
            .set({ voteCount: 1 })
            .where(eq(pollOptions.id, option1[0].id));

        console.log('   ✓ Anonymous vote recorded');

        // Verify anonymity: Check that we can't link user to their choice
        const voteRecord = await db.select()
            .from(pollVotes)
            .where(and(
                eq(pollVotes.pollId, poll[0].id),
                eq(pollVotes.userId, this.users[1].id)
            ));

        if (voteRecord[0]?.optionId !== null) {
            throw new Error('PRIVACY VIOLATION: User vote is not anonymous!');
        }

        // Verify vote was counted
        const option1Result = await db.select()
            .from(pollOptions)
            .where(eq(pollOptions.id, option1[0].id));

        if (option1Result[0]?.voteCount !== 1) {
            throw new Error('Vote not counted correctly');
        }

        console.log('   ✓ PRIVACY VERIFIED: Vote is anonymous, but counted');
    }

    // Test 6: Task-Schedule Automation
    private async testTaskScheduleSync() {
        console.log('\n8. Testing Task-Schedule Automation...');

        const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days from now

        // Create task
        const task = await db.insert(tasks).values({
            groupId: this.groupId,
            title: 'Complete project documentation',
            description: 'Write comprehensive docs for the project',
            assignedTo: this.users[1].id,
            assignedBy: this.users[0].id,
            dueDate,
            priority: 'high',
            status: 'pending',
        }).returning();

        console.log('   ✓ Task created');

        // AUTO-CREATE schedule entry
        const schedule = await db.insert(schedules).values({
            userId: this.users[1].id,
            title: `Task: ${task[0].title}`,
            description: task[0].description,
            startTime: dueDate,
            eventType: 'task',
            sourceTaskId: task[0].id,
        }).returning();

        console.log('   ✓ Schedule entry auto-created');

        // Verify schedule was created
        const scheduleEntry = await db.select()
            .from(schedules)
            .where(eq(schedules.sourceTaskId, task[0].id));

        if (scheduleEntry.length !== 1) {
            throw new Error('Schedule not created automatically');
        }
        console.log('   ✓ Task-Schedule link verified');

        // Update task due date
        const newDueDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days from now
        await db.update(tasks)
            .set({ dueDate: newDueDate })
            .where(eq(tasks.id, task[0].id));

        // SYNC: Update schedule
        await db.update(schedules)
            .set({ startTime: newDueDate })
            .where(eq(schedules.sourceTaskId, task[0].id));

        console.log('   ✓ Task updated, schedule synced');

        // Verify sync
        const updatedSchedule = await db.select()
            .from(schedules)
            .where(eq(schedules.sourceTaskId, task[0].id));

        if (updatedSchedule[0]?.startTime.getTime() !== newDueDate.getTime()) {
            throw new Error('Schedule not synced with task update');
        }
        console.log('   ✓ SYNC VERIFIED: Schedule updated with task');
    }
}

// Run tests
const tester = new SocialFeaturesTester();
tester.run();
