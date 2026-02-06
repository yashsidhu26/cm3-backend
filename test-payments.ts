#!/usr/bin/env bun

/**
 * Payment Module Test Script
 * Tests the end-to-end flow of the Payment Module
 * 
 * Run: bun run test-payments.ts
 */

interface HelperUser {
    id: string;
    email: string;
    name: string;
    token: string;
    cookie: string;
}

class PaymentTester {
    private baseUrl: string;
    private users: HelperUser[] = [];
    private groupId: string = '';

    constructor(baseUrl: string = 'http://localhost:3000') {
        this.baseUrl = baseUrl;
    }

    private async request(
        method: string,
        path: string,
        body?: any,
        cookie?: string
    ): Promise<Response> {
        const url = `${this.baseUrl}${path}`;
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
        };

        if (cookie) {
            headers['Cookie'] = cookie;
        }

        const options: RequestInit = {
            method,
            headers,
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        return await fetch(url, options);
    }

    private extractCookie(response: Response): string {
        const setCookie = response.headers.get('set-cookie');
        return setCookie ? setCookie.split(';')[0] : '';
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

    async run() {
        console.log('🧪 Starting Payment Module Tests...\n');

        try {
            await this.createUsers();
            await this.createGroup();
            await this.addMembers();
            await this.createExpense();
            await this.checkBalancesBeforeSettlement();
            await this.makeSettlement();
            await this.checkBalancesAfterSettlement(); // Fixed method name (was checkBalancesAfterSetttlement)

            console.log('\n🎉 All Payment Tests Passed Successfully!');
        } catch (error: any) {
            console.error('\n❌ Test Failed:', error.message);
            process.exit(1);
        }
    }

    // 1. Create 3 Users
    private async createUsers() {
        console.log('1. Creating Users...');
        const userNames = ['User A', 'User B', 'User C'];

        for (const name of userNames) {
            const email = `test_${Date.now()}_${name.replace(' ', '')}@example.com`;
            const password = 'TestPassword123!';

            // Sign Up
            const res = await this.request('POST', '/api/auth/sign-up/email', {
                email,
                password,
                name,
            });
            this.assert(res.ok, `Failed to create ${name}`, res);

            const data = await res.json();
            const cookie = this.extractCookie(res);

            this.users.push({
                id: data.user.id,
                email,
                name,
                token: '', // We use cookie for auth
                cookie,
            });
            console.log(`   ✓ Created ${name} (${data.user.id})`);
        }
    }

    // 2. User A creates a group
    private async createGroup() {
        console.log('\n2. Creating Group...');
        const userA = this.users[0];

        const res = await this.request('POST', '/api/payments/groups', {
            name: 'Test Payment Group',
            description: 'Testing splitwise logic',
        }, userA.cookie);

        this.assert(res.ok, 'Failed to create group', res);
        const data = await res.json();
        this.groupId = data.data.group.id;
        console.log(`   ✓ Group created: ${this.groupId}`);
    }

    // 3. Add User B and C to the group
    private async addMembers() {
        console.log('\n3. Adding Members...');
        const userA = this.users[0];

        for (let i = 1; i < this.users.length; i++) {
            const user = this.users[i];
            const res = await this.request('POST', `/api/payments/groups/${this.groupId}/members`, {
                userId: user.id
            }, userA.cookie);

            this.assert(res.ok, `Failed to add ${user.name} to group`, res);
            console.log(`   ✓ Added ${user.name}`);
        }
    }

    // 4. User A creates an expense of 3000 (Equal Split)
    private async createExpense() {
        console.log('\n4. Creating Expense (3000, Split Currently)...');
        const userA = this.users[0];

        const res = await this.request('POST', `/api/payments/groups/${this.groupId}/expenses`, {
            description: 'Dinner',
            amount: '3000',
            paidBy: userA.id,
            splitType: 'equal',
            participants: this.users.map(u => ({ userId: u.id })), // All 3 involved
        }, userA.cookie);

        this.assert(res.ok, 'Failed to create expense', res);
        console.log('   ✓ Expense created: 3000 paid by User A, split equally');
    }

    // 5. Verify Balances
    private async checkBalancesBeforeSettlement() {
        console.log('\n5. Verifying Balances (Before Settlement)...');
        const userA = this.users[0];

        const res = await this.request('GET', `/api/payments/groups/${this.groupId}/balances`, undefined, userA.cookie);
        this.assert(res.ok, 'Failed to get balances');
        const data = await res.json();
        const balances = data.data.balances;

        // Expected:
        // User A: Paid 3000, Share 1000. Net +2000.
        // User B: Paid 0, Share 1000. Net -1000.
        // User C: Paid 0, Share 1000. Net -1000.

        this.verifyBalance(balances, this.users[0].id, 2000);
        this.verifyBalance(balances, this.users[1].id, -1000);
        this.verifyBalance(balances, this.users[2].id, -1000);

        console.log('   ✓ Balances correct');
    }

    // 6. User B pays User A 1000
    private async makeSettlement() {
        console.log('\n6. Recording Settlement (User B pays User A 1000)...');
        const userA = this.users[0]; // User A records it (or B could)

        const res = await this.request('POST', `/api/payments/groups/${this.groupId}/settlements`, {
            fromUserId: this.users[1].id, // User B
            toUserId: this.users[0].id,   // User A
            amount: '1000'
        }, userA.cookie);

        this.assert(res.ok, 'Failed to record settlement');
        console.log('   ✓ Settlement recorded');
    }

    // 7. Verify Final Balances
    private async checkBalancesAfterSettlement() {
        console.log('\n7. Verifying Final Balances...');
        const userA = this.users[0];

        const res = await this.request('GET', `/api/payments/groups/${this.groupId}/balances`, undefined, userA.cookie);
        this.assert(res.ok, 'Failed to get balances');
        const data = await res.json();
        const balances = data.data.balances;

        // Expected:
        // User A: +2000 initially, received 1000 from B. Wait, settlement reduces debt.
        // Balances should be:
        // User A: Owed 2000. Received 1000. Still Owed 1000 (from C). Net should be +1000 ?
        // Let's trace:
        // A paid 3000. Consumed 1000. Metric: Paid - Share = +2000.
        // Settlement: A received 1000. 
        // Logic in Service: Net = (paid - owed) + (received - settled)
        // A: (3000 - 1000) + (1000 - 0) = 2000 + 1000 = 3000? NO.
        // Settlement reduces the outstanding balance visually?
        // Wait, standard Splitwise:
        // "You are owed 1000" (after B pays back).

        // Let's check service logic:
        // Net Balance = (Paid - Share) + (Received - Settled)
        // A: (3000 - 1000) + (1000 - 0) = 3000. This usage seems wrong if "Received" adds to positive balance.
        // Usually, receiving money *reduces* the amount people owe you.
        // If I am +2000, and someone pays me 1000. My balance with *them* goes to 0. My total balance goes to +1000.
        // So Received should be SUBTRACTED from Net Balance?
        // OR: (Paid + Settled) - (Share + Received) ?

        // Let's re-read the service code in `payments.service.ts`:
        // const netBalance = (totalPaid - totalOwed) + (totalReceived - totalSettled);

        // Example with that formula:
        // A: Paid=3000, Owed=1000. Received=1000. Settled=0.
        // A Net = (3000 - 1000) + (1000 - 0) = 3000.

        // IF NetBalance means "How much cash I have relative to start", then yes (+3000 means I am down 3000? No).
        // Standard definition: Positive = You are Owed. Negative = You Owe.

        // If I am Owed 2000 (Paid 3000, ate 1000).
        // I receive 1000 cash.
        // Now I have 1000 (original share) + 1000 (reimbursement) = 2000.
        // I spent 3000.
        // So I am still "down" 1000 cash overall.
        // But "Net Balance" usually tracks "Debt".

        // If B gives me 1000. The debt is settled. The system should show I am owed 1000 (from C).
        // So A Net should be +1000.

        // The Service Logic seems:
        // `(totalPaid - totalOwed)` -> Initial Debt State. (3000 - 1000 = +2000).
        // `(totalReceived - totalSettled)` -> Settlement Delta.
        // If I Receive 1000, that implies I got cash back.
        // Does getting cash INCREASE my "owed to me" status or DECREASE it?
        // It DECREASES it. "I was owed 2000, now I got 1000, so I am owed 1000".
        // So verification: Net = (Paid - Owed) - (Received - Settled).

        // Let's check implementing Logic again. I will assume the Service logic is potentially buggy if it adds received.
        // Or maybe I am misinterpreting.

        // Waiting to run and see. I will assert what I expect logically (A = +1000). 
        // If it fails, I found a bug in the Service!

        this.verifyBalance(balances, this.users[0].id, 1000); // User A
        this.verifyBalance(balances, this.users[1].id, 0);    // User B (Settled)
        this.verifyBalance(balances, this.users[2].id, -1000); // User C (Still owes)

        console.log('   ✓ Final Balances correct');
    }

    private verifyBalance(balances: any[], userId: string, expectedAmount: number) {
        const userBal = balances.find((b: any) => b.userId === userId);
        if (!userBal) throw new Error(`User ${userId} not found in balances`);

        const actual = parseFloat(userBal.netBalance);
        if (Math.abs(actual - expectedAmount) > 0.01) {
            throw new Error(`Balance mismatch for ${userBal.userName}. Expected ${expectedAmount}, Got ${actual}`);
        }
    }
}

new PaymentTester().run();
