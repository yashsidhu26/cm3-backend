import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { paymentsService } from './payments.service';
import { successResponse, errorResponse, createdResponse } from '../../core/utils/response';
import { protect } from '../../core/auth/middleware';

/**
 * Payments Module Routes
 * Splitwise-like expense sharing and settlement tracking
 */

const payments = new Hono();

/**
 * VALIDATION SCHEMAS
 */

// Create group schema
const createGroupSchema = z.object({
    name: z.string().min(1, 'Group name is required').max(255),
    description: z.string().optional(),
});

// Add member schema
const addMemberSchema = z.object({
    userId: z.string().uuid('Invalid user ID'),
});

// Create expense schema
const createExpenseSchema = z.object({
    description: z.string().min(1, 'Description is required').max(500),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid amount format'),
    paidBy: z.string().uuid('Invalid user ID'),
    splitType: z.enum(['equal', 'exact', 'percentage']),
    category: z.enum(['food', 'transport', 'accommodation', 'entertainment', 'utilities', 'other']).optional(),
    date: z.string().datetime().optional(),
    participants: z.array(z.object({
        userId: z.string().uuid('Invalid user ID'),
        shareAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid amount format').optional(),
    })).min(1, 'At least one participant is required'),
});

// Update expense schema
const updateExpenseSchema = z.object({
    description: z.string().min(1).max(500).optional(),
    category: z.enum(['food', 'transport', 'accommodation', 'entertainment', 'utilities', 'other']).optional(),
    date: z.string().datetime().optional(),
});

// Settlement schema
const settlementSchema = z.object({
    fromUserId: z.string().uuid('Invalid user ID'),
    toUserId: z.string().uuid('Invalid user ID'),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid amount format'),
    note: z.string().optional(),
});

/**
 * GROUP ENDPOINTS
 */

/**
 * POST /groups
 * Create a new group
 * Requires authentication
 */
payments.post('/groups', protect, zValidator('json', createGroupSchema), async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const { name, description } = c.req.valid('json');

        const group = await paymentsService.createGroup(name, description, user.id);
        return createdResponse(c, { group });
    } catch (error: any) {
        console.error('[API] Error creating group:', error);
        return errorResponse(c, 'Failed to create group', 500);
    }
});

/**
 * GET /groups
 * Get user's groups
 * Requires authentication
 */
payments.get('/groups', protect, async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const groups = await paymentsService.getUserGroups(user.id);
        return successResponse(c, { groups, count: groups.length });
    } catch (error: any) {
        console.error('[API] Error fetching groups:', error);
        return errorResponse(c, 'Failed to fetch groups', 500);
    }
});

/**
 * GET /groups/:id
 * Get group details with members
 * Requires authentication and group membership
 */
payments.get('/groups/:id', protect, async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const groupId = c.req.param('id');

        // Check if user is member
        const isMember = await paymentsService.isUserInGroup(groupId, user.id);
        if (!isMember) {
            return errorResponse(c, 'You are not a member of this group', 403, 'NOT_MEMBER');
        }

        const group = await paymentsService.getGroupById(groupId);
        if (!group) {
            return errorResponse(c, 'Group not found', 404, 'GROUP_NOT_FOUND');
        }

        const members = await paymentsService.getGroupMembers(groupId);

        return successResponse(c, { group, members });
    } catch (error: any) {
        console.error('[API] Error fetching group:', error);
        return errorResponse(c, 'Failed to fetch group', 500);
    }
});

/**
 * POST /groups/:id/members
 * Add member to group
 * Requires authentication and group membership
 */
payments.post('/groups/:id/members', protect, zValidator('json', addMemberSchema), async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const groupId = c.req.param('id');
        const { userId } = c.req.valid('json');

        // Check if requester is member
        const isMember = await paymentsService.isUserInGroup(groupId, user.id);
        if (!isMember) {
            return errorResponse(c, 'You are not a member of this group', 403, 'NOT_MEMBER');
        }

        // Check if user is already a member
        const isAlreadyMember = await paymentsService.isUserInGroup(groupId, userId);
        if (isAlreadyMember) {
            return errorResponse(c, 'User is already a member', 409, 'ALREADY_MEMBER');
        }

        const member = await paymentsService.addMemberToGroup(groupId, userId);
        return createdResponse(c, { member });
    } catch (error: any) {
        console.error('[API] Error adding member:', error);
        return errorResponse(c, 'Failed to add member', 500);
    }
});

/**
 * DELETE /groups/:id/members/:userId
 * Remove member from group
 * Requires authentication and must be group creator
 */
payments.delete('/groups/:id/members/:userId', protect, async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const groupId = c.req.param('id');
        const userIdToRemove = c.req.param('userId');

        // Check if group exists and user is creator
        const group = await paymentsService.getGroupById(groupId);
        if (!group) {
            return errorResponse(c, 'Group not found', 404, 'GROUP_NOT_FOUND');
        }

        if (group.createdBy !== user.id) {
            return errorResponse(c, 'Only group creator can remove members', 403, 'NOT_CREATOR');
        }

        await paymentsService.removeMemberFromGroup(groupId, userIdToRemove);
        return successResponse(c, { message: 'Member removed successfully' });
    } catch (error: any) {
        console.error('[API] Error removing member:', error);
        return errorResponse(c, 'Failed to remove member', 500);
    }
});

/**
 * DELETE /groups/:id
 * Delete group
 * Requires authentication and must be group creator
 */
payments.delete('/groups/:id', protect, async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const groupId = c.req.param('id');

        // Check if group exists and user is creator
        const group = await paymentsService.getGroupById(groupId);
        if (!group) {
            return errorResponse(c, 'Group not found', 404, 'GROUP_NOT_FOUND');
        }

        if (group.createdBy !== user.id) {
            return errorResponse(c, 'Only group creator can delete the group', 403, 'NOT_CREATOR');
        }

        await paymentsService.deleteGroup(groupId);
        return successResponse(c, { message: 'Group deleted successfully' });
    } catch (error: any) {
        console.error('[API] Error deleting group:', error);
        return errorResponse(c, 'Failed to delete group', 500);
    }
});

/**
 * EXPENSE ENDPOINTS
 */

/**
 * POST /groups/:groupId/expenses
 * Create expense in group
 * Requires authentication and group membership
 */
payments.post('/groups/:groupId/expenses', protect, zValidator('json', createExpenseSchema), async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const groupId = c.req.param('groupId');

        // Check if user is member
        const isMember = await paymentsService.isUserInGroup(groupId, user.id);
        if (!isMember) {
            return errorResponse(c, 'You are not a member of this group', 403, 'NOT_MEMBER');
        }

        const data = c.req.valid('json');

        const expense = await paymentsService.createExpense({
            ...data,
            groupId,
            date: data.date ? new Date(data.date) : undefined,
        });

        return createdResponse(c, { expense });
    } catch (error: any) {
        console.error('[API] Error creating expense:', error);
        return errorResponse(c, error.message || 'Failed to create expense', 500);
    }
});

/**
 * GET /groups/:groupId/expenses
 * Get all expenses for a group
 * Requires authentication and group membership
 */
payments.get('/groups/:groupId/expenses', protect, async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const groupId = c.req.param('groupId');

        // Check if user is member
        const isMember = await paymentsService.isUserInGroup(groupId, user.id);
        if (!isMember) {
            return errorResponse(c, 'You are not a member of this group', 403, 'NOT_MEMBER');
        }

        const expenses = await paymentsService.getGroupExpenses(groupId);
        return successResponse(c, { expenses, count: expenses.length });
    } catch (error: any) {
        console.error('[API] Error fetching expenses:', error);
        return errorResponse(c, 'Failed to fetch expenses', 500);
    }
});

/**
 * GET /expenses/:id
 * Get expense details with participants
 * Requires authentication and group membership
 */
payments.get('/expenses/:id', protect, async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const expenseId = c.req.param('id');

        const expense = await paymentsService.getExpenseById(expenseId);
        if (!expense) {
            return errorResponse(c, 'Expense not found', 404, 'EXPENSE_NOT_FOUND');
        }

        // Check if user is member of the group
        const isMember = await paymentsService.isUserInGroup(expense.expense.groupId, user.id);
        if (!isMember) {
            return errorResponse(c, 'You are not a member of this group', 403, 'NOT_MEMBER');
        }

        return successResponse(c, expense);
    } catch (error: any) {
        console.error('[API] Error fetching expense:', error);
        return errorResponse(c, 'Failed to fetch expense', 500);
    }
});

/**
 * PUT /expenses/:id
 * Update expense
 * Requires authentication and must be expense creator
 */
payments.put('/expenses/:id', protect, zValidator('json', updateExpenseSchema), async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const expenseId = c.req.param('id');

        const expenseData = await paymentsService.getExpenseById(expenseId);
        if (!expenseData) {
            return errorResponse(c, 'Expense not found', 404, 'EXPENSE_NOT_FOUND');
        }

        // Check if user is the one who paid (creator)
        if (expenseData.expense.paidBy !== user.id) {
            return errorResponse(c, 'Only expense creator can update it', 403, 'NOT_CREATOR');
        }

        const data = c.req.valid('json');
        const expense = await paymentsService.updateExpense(expenseId, {
            ...data,
            date: data.date ? new Date(data.date) : undefined,
        });

        return successResponse(c, { expense });
    } catch (error: any) {
        console.error('[API] Error updating expense:', error);
        return errorResponse(c, 'Failed to update expense', 500);
    }
});

/**
 * DELETE /expenses/:id
 * Delete expense
 * Requires authentication and must be expense creator
 */
payments.delete('/expenses/:id', protect, async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const expenseId = c.req.param('id');

        const expenseData = await paymentsService.getExpenseById(expenseId);
        if (!expenseData) {
            return errorResponse(c, 'Expense not found', 404, 'EXPENSE_NOT_FOUND');
        }

        // Check if user is the one who paid (creator)
        if (expenseData.expense.paidBy !== user.id) {
            return errorResponse(c, 'Only expense creator can delete it', 403, 'NOT_CREATOR');
        }

        await paymentsService.deleteExpense(expenseId);
        return successResponse(c, { message: 'Expense deleted successfully' });
    } catch (error: any) {
        console.error('[API] Error deleting expense:', error);
        return errorResponse(c, 'Failed to delete expense', 500);
    }
});

/**
 * BALANCE ENDPOINTS
 */

/**
 * GET /groups/:groupId/balances
 * Get all balances for group members
 * Requires authentication and group membership
 */
payments.get('/groups/:groupId/balances', protect, async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const groupId = c.req.param('groupId');

        // Check if user is member
        const isMember = await paymentsService.isUserInGroup(groupId, user.id);
        if (!isMember) {
            return errorResponse(c, 'You are not a member of this group', 403, 'NOT_MEMBER');
        }

        const balances = await paymentsService.calculateGroupBalances(groupId);
        return successResponse(c, { balances });
    } catch (error: any) {
        console.error('[API] Error calculating balances:', error);
        return errorResponse(c, 'Failed to calculate balances', 500);
    }
});

/**
 * GET /groups/:groupId/balances/me
 * Get authenticated user's balance in group
 * Requires authentication and group membership
 */
payments.get('/groups/:groupId/balances/me', protect, async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const groupId = c.req.param('groupId');

        // Check if user is member
        const isMember = await paymentsService.isUserInGroup(groupId, user.id);
        if (!isMember) {
            return errorResponse(c, 'You are not a member of this group', 403, 'NOT_MEMBER');
        }

        const balance = await paymentsService.getUserBalanceInGroup(groupId, user.id);
        return successResponse(c, { balance });
    } catch (error: any) {
        console.error('[API] Error fetching user balance:', error);
        return errorResponse(c, 'Failed to fetch balance', 500);
    }
});

/**
 * GET /groups/:groupId/balances/detailed
 * Get detailed who-owes-whom breakdown
 * Requires authentication and group membership
 */
payments.get('/groups/:groupId/balances/detailed', protect, async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const groupId = c.req.param('groupId');

        // Check if user is member
        const isMember = await paymentsService.isUserInGroup(groupId, user.id);
        if (!isMember) {
            return errorResponse(c, 'You are not a member of this group', 403, 'NOT_MEMBER');
        }

        const detailed = await paymentsService.getDetailedBalances(groupId);
        return successResponse(c, { balances: detailed });
    } catch (error: any) {
        console.error('[API] Error fetching detailed balances:', error);
        return errorResponse(c, 'Failed to fetch detailed balances', 500);
    }
});

/**
 * SETTLEMENT ENDPOINTS
 */

/**
 * POST /groups/:groupId/settlements
 * Record a settlement payment
 * Requires authentication and group membership
 */
payments.post('/groups/:groupId/settlements', protect, zValidator('json', settlementSchema), async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const groupId = c.req.param('groupId');

        // Check if user is member
        const isMember = await paymentsService.isUserInGroup(groupId, user.id);
        if (!isMember) {
            return errorResponse(c, 'You are not a member of this group', 403, 'NOT_MEMBER');
        }

        const { fromUserId, toUserId, amount, note } = c.req.valid('json');

        const settlement = await paymentsService.recordSettlement(groupId, fromUserId, toUserId, amount, note);
        return createdResponse(c, { settlement });
    } catch (error: any) {
        console.error('[API] Error recording settlement:', error);
        return errorResponse(c, 'Failed to record settlement', 500);
    }
});

/**
 * GET /groups/:groupId/settlements
 * Get settlement history for group
 * Requires authentication and group membership
 */
payments.get('/groups/:groupId/settlements', protect, async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const groupId = c.req.param('groupId');

        // Check if user is member
        const isMember = await paymentsService.isUserInGroup(groupId, user.id);
        if (!isMember) {
            return errorResponse(c, 'You are not a member of this group', 403, 'NOT_MEMBER');
        }

        const settlements = await paymentsService.getGroupSettlements(groupId);
        return successResponse(c, { settlements, count: settlements.length });
    } catch (error: any) {
        console.error('[API] Error fetching settlements:', error);
        return errorResponse(c, 'Failed to fetch settlements', 500);
    }
});

/**
 * GET /groups/:groupId/settlements/suggested
 * Get suggested optimal settlements
 * Requires authentication and group membership
 */
payments.get('/groups/:groupId/settlements/suggested', protect, async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return errorResponse(c, 'User not authenticated', 401);
        }

        const groupId = c.req.param('groupId');

        // Check if user is member
        const isMember = await paymentsService.isUserInGroup(groupId, user.id);
        if (!isMember) {
            return errorResponse(c, 'You are not a member of this group', 403, 'NOT_MEMBER');
        }

        const suggestions = await paymentsService.getSuggestedSettlements(groupId);
        return successResponse(c, { suggestions });
    } catch (error: any) {
        console.error('[API] Error fetching settlement suggestions:', error);
        return errorResponse(c, 'Failed to fetch suggestions', 500);
    }
});

export default payments;
