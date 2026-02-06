import { eq, and, sql, inArray } from 'drizzle-orm';
import { db } from '../../core/database/client';
import {
    groups,
    groupMembers,
    expenses,
    expenseParticipants,
    settlements,
    type Group,
    type NewGroup,
    type GroupMember,
    type Expense,
    type NewExpense,
    type ExpenseParticipant,
    type Settlement,
    type NewSettlement,
} from './payments.schema';
import { user } from '../auth/auth.schema';

/**
 * Payments Service
 * Business logic for Splitwise-like expense sharing and settlements
 */

export interface CreateExpenseData {
    groupId: string;
    description: string;
    amount: string;
    paidBy: string;
    splitType: 'equal' | 'exact' | 'percentage';
    category?: 'food' | 'transport' | 'accommodation' | 'entertainment' | 'utilities' | 'other';
    date?: Date;
    participants: Array<{
        userId: string;
        shareAmount?: string; // Required for 'exact' and 'percentage' splits
    }>;
}

export interface UserBalance {
    userId: string;
    userName: string;
    userEmail: string;
    netBalance: string; // Positive = owed to them, Negative = they owe
}

export interface DetailedBalance {
    fromUserId: string;
    fromUserName: string;
    toUserId: string;
    toUserName: string;
    amount: string;
}

export interface SuggestedSettlement {
    fromUserId: string;
    fromUserName: string;
    toUserId: string;
    toUserName: string;
    amount: string;
}

export class PaymentsService {
    /**
     * GROUP MANAGEMENT
     */

    async createGroup(name: string, description: string | undefined, createdBy: string): Promise<Group> {
        const result = await db.insert(groups).values({
            name,
            description,
            createdBy,
        }).returning();

        // Automatically add creator as member
        await db.insert(groupMembers).values({
            groupId: result[0].id,
            userId: createdBy,
        });

        return result[0];
    }

    async getGroupById(groupId: string): Promise<Group | undefined> {
        const result = await db.select().from(groups).where(eq(groups.id, groupId));
        return result[0];
    }

    async getUserGroups(userId: string): Promise<Array<Group & { memberCount: number }>> {
        const result = await db
            .select({
                group: groups,
                memberCount: sql<number>`cast(count(distinct ${groupMembers.userId}) as integer)`,
            })
            .from(groupMembers)
            .innerJoin(groups, eq(groupMembers.groupId, groups.id))
            .where(eq(groupMembers.userId, userId))
            .groupBy(groups.id);

        return result.map(r => ({ ...r.group, memberCount: r.memberCount }));
    }

    async getGroupMembers(groupId: string) {
        return await db
            .select({
                id: groupMembers.id,
                userId: user.id,
                userName: user.name,
                userEmail: user.email,
                joinedAt: groupMembers.joinedAt,
            })
            .from(groupMembers)
            .innerJoin(user, eq(groupMembers.userId, user.id))
            .where(eq(groupMembers.groupId, groupId));
    }

    async isUserInGroup(groupId: string, userId: string): Promise<boolean> {
        const result = await db
            .select()
            .from(groupMembers)
            .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
        return result.length > 0;
    }

    async addMemberToGroup(groupId: string, userId: string): Promise<GroupMember> {
        const result = await db.insert(groupMembers).values({
            groupId,
            userId,
        }).returning();
        return result[0];
    }

    async removeMemberFromGroup(groupId: string, userId: string): Promise<void> {
        await db
            .delete(groupMembers)
            .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
    }

    async deleteGroup(groupId: string): Promise<void> {
        await db.delete(groups).where(eq(groups.id, groupId));
    }

    /**
     * EXPENSE MANAGEMENT
     */

    async createExpense(data: CreateExpenseData): Promise<Expense> {
        // Validate participants
        if (data.participants.length === 0) {
            throw new Error('At least one participant is required');
        }

        // Calculate share amounts based on split type
        const totalAmount = parseFloat(data.amount);
        let participantShares: Array<{ userId: string; shareAmount: string }>;

        if (data.splitType === 'equal') {
            const shareAmount = (totalAmount / data.participants.length).toFixed(2);
            participantShares = data.participants.map(p => ({
                userId: p.userId,
                shareAmount,
            }));
        } else if (data.splitType === 'exact') {
            // Validate that all participants have shareAmount
            if (data.participants.some(p => !p.shareAmount)) {
                throw new Error('All participants must have shareAmount for exact split');
            }

            // Validate that sum equals total
            const sum = data.participants.reduce((acc, p) => acc + parseFloat(p.shareAmount!), 0);
            if (Math.abs(sum - totalAmount) > 0.01) {
                throw new Error(`Share amounts (${sum}) must equal total amount (${totalAmount})`);
            }

            participantShares = data.participants.map(p => ({
                userId: p.userId,
                shareAmount: p.shareAmount!,
            }));
        } else if (data.splitType === 'percentage') {
            // Validate that all participants have shareAmount (percentage)
            if (data.participants.some(p => !p.shareAmount)) {
                throw new Error('All participants must have percentage for percentage split');
            }

            // Validate that percentages sum to 100
            const sumPercentage = data.participants.reduce((acc, p) => acc + parseFloat(p.shareAmount!), 0);
            if (Math.abs(sumPercentage - 100) > 0.01) {
                throw new Error(`Percentages must sum to 100, got ${sumPercentage}`);
            }

            participantShares = data.participants.map(p => ({
                userId: p.userId,
                shareAmount: ((totalAmount * parseFloat(p.shareAmount!)) / 100).toFixed(2),
            }));
        } else {
            throw new Error('Invalid split type');
        }

        // Create expense
        const expenseResult = await db.insert(expenses).values({
            groupId: data.groupId,
            description: data.description,
            amount: data.amount,
            paidBy: data.paidBy,
            splitType: data.splitType,
            category: data.category || 'other',
            date: data.date || new Date(),
        }).returning();

        const expense = expenseResult[0];

        // Create expense participants
        await db.insert(expenseParticipants).values(
            participantShares.map(p => ({
                expenseId: expense.id,
                userId: p.userId,
                shareAmount: p.shareAmount,
                isPaid: p.userId === data.paidBy, // Payer has already paid their share
            }))
        );

        return expense;
    }

    async getGroupExpenses(groupId: string) {
        return await db
            .select({
                expense: expenses,
                payerName: user.name,
                payerEmail: user.email,
                participantCount: sql<number>`cast(count(distinct ${expenseParticipants.userId}) as integer)`,
            })
            .from(expenses)
            .innerJoin(user, eq(expenses.paidBy, user.id))
            .leftJoin(expenseParticipants, eq(expenses.id, expenseParticipants.expenseId))
            .where(eq(expenses.groupId, groupId))
            .groupBy(expenses.id, user.name, user.email)
            .orderBy(sql`${expenses.date} DESC`);
    }

    async getExpenseById(expenseId: string) {
        const expenseData = await db
            .select({
                expense: expenses,
                payerName: user.name,
                payerEmail: user.email,
            })
            .from(expenses)
            .innerJoin(user, eq(expenses.paidBy, user.id))
            .where(eq(expenses.id, expenseId));

        if (expenseData.length === 0) {
            return undefined;
        }

        const participants = await db
            .select({
                id: expenseParticipants.id,
                userId: user.id,
                userName: user.name,
                userEmail: user.email,
                shareAmount: expenseParticipants.shareAmount,
                isPaid: expenseParticipants.isPaid,
            })
            .from(expenseParticipants)
            .innerJoin(user, eq(expenseParticipants.userId, user.id))
            .where(eq(expenseParticipants.expenseId, expenseId));

        return {
            ...expenseData[0],
            participants,
        };
    }

    async updateExpense(expenseId: string, data: Partial<CreateExpenseData>): Promise<Expense> {
        const updateData: any = {};

        if (data.description) updateData.description = data.description;
        if (data.category) updateData.category = data.category;
        if (data.date) updateData.date = data.date;

        updateData.updatedAt = new Date();

        const result = await db
            .update(expenses)
            .set(updateData)
            .where(eq(expenses.id, expenseId))
            .returning();

        return result[0];
    }

    async deleteExpense(expenseId: string): Promise<void> {
        await db.delete(expenses).where(eq(expenses.id, expenseId));
    }

    /**
     * BALANCE CALCULATIONS
     */

    async calculateGroupBalances(groupId: string): Promise<UserBalance[]> {
        // Get all group members
        const members = await this.getGroupMembers(groupId);

        // Calculate balances for each member
        const balances: UserBalance[] = [];

        for (const member of members) {
            // Amount paid by user
            const paidResult = await db
                .select({
                    total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
                })
                .from(expenses)
                .where(and(eq(expenses.groupId, groupId), eq(expenses.paidBy, member.userId)));

            const totalPaid = parseFloat(paidResult[0]?.total || '0');

            // Amount owed by user (their share of all expenses)
            const owedResult = await db
                .select({
                    total: sql<string>`COALESCE(SUM(${expenseParticipants.shareAmount}), 0)`,
                })
                .from(expenseParticipants)
                .innerJoin(expenses, eq(expenseParticipants.expenseId, expenses.id))
                .where(and(eq(expenses.groupId, groupId), eq(expenseParticipants.userId, member.userId)));

            const totalOwed = parseFloat(owedResult[0]?.total || '0');

            // Amount received in settlements
            const receivedResult = await db
                .select({
                    total: sql<string>`COALESCE(SUM(${settlements.amount}), 0)`,
                })
                .from(settlements)
                .where(and(eq(settlements.groupId, groupId), eq(settlements.toUserId, member.userId)));

            const totalReceived = parseFloat(receivedResult[0]?.total || '0');

            // Amount paid in settlements
            const settledResult = await db
                .select({
                    total: sql<string>`COALESCE(SUM(${settlements.amount}), 0)`,
                })
                .from(settlements)
                .where(and(eq(settlements.groupId, groupId), eq(settlements.fromUserId, member.userId)));

            const totalSettled = parseFloat(settledResult[0]?.total || '0');

            // Net balance = (paid - owed) + (settled - received)
            // positive settled (paid) reduces negative balance (debt)
            // positive received reduces positive balance (credit)
            const netBalance = (totalPaid - totalOwed) + (totalSettled - totalReceived);

            balances.push({
                userId: member.userId,
                userName: member.userName,
                userEmail: member.userEmail,
                netBalance: netBalance.toFixed(2),
            });
        }

        return balances;
    }

    async getUserBalanceInGroup(groupId: string, userId: string): Promise<UserBalance | undefined> {
        const balances = await this.calculateGroupBalances(groupId);
        return balances.find(b => b.userId === userId);
    }

    async getDetailedBalances(groupId: string): Promise<DetailedBalance[]> {
        const balances = await this.calculateGroupBalances(groupId);
        const detailed: DetailedBalance[] = [];

        // Find who owes whom
        const creditors = balances.filter(b => parseFloat(b.netBalance) > 0);
        const debtors = balances.filter(b => parseFloat(b.netBalance) < 0);

        for (const debtor of debtors) {
            for (const creditor of creditors) {
                const debtAmount = Math.abs(parseFloat(debtor.netBalance));
                const creditAmount = parseFloat(creditor.netBalance);

                if (debtAmount > 0.01 && creditAmount > 0.01) {
                    const settleAmount = Math.min(debtAmount, creditAmount);

                    detailed.push({
                        fromUserId: debtor.userId,
                        fromUserName: debtor.userName,
                        toUserId: creditor.userId,
                        toUserName: creditor.userName,
                        amount: settleAmount.toFixed(2),
                    });
                }
            }
        }

        return detailed;
    }

    /**
     * SETTLEMENT TRACKING
     */

    async recordSettlement(
        groupId: string,
        fromUserId: string,
        toUserId: string,
        amount: string,
        note?: string
    ): Promise<Settlement> {
        const result = await db.insert(settlements).values({
            groupId,
            fromUserId,
            toUserId,
            amount,
            note,
        }).returning();

        return result[0];
    }

    async getGroupSettlements(groupId: string) {
        return await db
            .select({
                settlement: settlements,
                fromUserName: sql<string>`from_user.name`,
                fromUserEmail: sql<string>`from_user.email`,
                toUserName: sql<string>`to_user.name`,
                toUserEmail: sql<string>`to_user.email`,
            })
            .from(settlements)
            .innerJoin(
                sql`${user} as from_user`,
                eq(settlements.fromUserId, sql`from_user.id`)
            )
            .innerJoin(
                sql`${user} as to_user`,
                eq(settlements.toUserId, sql`to_user.id`)
            )
            .where(eq(settlements.groupId, groupId))
            .orderBy(sql`${settlements.settledAt} DESC`);
    }

    async getSuggestedSettlements(groupId: string): Promise<SuggestedSettlement[]> {
        const balances = await this.calculateGroupBalances(groupId);

        // Simplified debt settlement algorithm
        const creditors = balances
            .filter(b => parseFloat(b.netBalance) > 0.01)
            .map(b => ({ ...b, remaining: parseFloat(b.netBalance) }))
            .sort((a, b) => b.remaining - a.remaining);

        const debtors = balances
            .filter(b => parseFloat(b.netBalance) < -0.01)
            .map(b => ({ ...b, remaining: Math.abs(parseFloat(b.netBalance)) }))
            .sort((a, b) => b.remaining - a.remaining);

        const suggestions: SuggestedSettlement[] = [];

        let i = 0, j = 0;
        while (i < debtors.length && j < creditors.length) {
            const debtor = debtors[i];
            const creditor = creditors[j];

            const settleAmount = Math.min(debtor.remaining, creditor.remaining);

            suggestions.push({
                fromUserId: debtor.userId,
                fromUserName: debtor.userName,
                toUserId: creditor.userId,
                toUserName: creditor.userName,
                amount: settleAmount.toFixed(2),
            });

            debtor.remaining -= settleAmount;
            creditor.remaining -= settleAmount;

            if (debtor.remaining < 0.01) i++;
            if (creditor.remaining < 0.01) j++;
        }

        return suggestions;
    }
}

// Export singleton instance
export const paymentsService = new PaymentsService();
