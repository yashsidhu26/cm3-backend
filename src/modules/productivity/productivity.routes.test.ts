import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';

// Set dummy env vars for top-level instantiations
process.env.GROQ_API_KEY = 'dummy';
process.env.GEMINI_API_KEY = 'dummy';
process.env.OPENAI_API_KEY = 'dummy';
process.env.XAI_API_KEY = 'dummy';

// Mock services directly since ProductivityModule instantiates them in constructor
mock.module('./services/extractor.service', () => {
    return {
        ExtractorService: class {
            extractTasks = mock(async () => ({ tasks: [] }));
        }
    };
});

mock.module('./services/scheduler.service', () => {
    return {
        SchedulerService: class {
            createSchedule = mock(async () => ({ efficiencyScore: 90, blocks: [] }));
        }
    };
});

// Also mock ProductivityModule for the route test to use specific results
const mockPlanDay = mock(async () => ({
    efficiencyScore: 90,
    blocks: [
        { startTime: "08:00", endTime: "09:00", taskTitle: "Morning Task", activityType: "deep_work" }
    ]
}));

mock.module('./productivity.module', () => {
    return {
        ProductivityModule: class {
            planDay = mockPlanDay;
        }
    };
});

import productivityRoutes from './productivity.routes';

describe('Productivity Routes', () => {
    let app: Hono;

    beforeEach(() => {
        app = new Hono();
        app.route('/productivity', productivityRoutes);
    });

    test('POST /productivity/plan returns 200 and schedule', async () => {
        const res = await app.request('/productivity/plan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: "user-456",
                transcript: "Plan my day please"
            })
        });

        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.efficiencyScore).toBe(90);
        expect(body.blocks[0].taskTitle).toBe("Morning Task");
        expect(mockPlanDay).toHaveBeenCalled();
    });

    test('POST /productivity/plan returns 400 for invalid body', async () => {
        const res = await app.request('/productivity/plan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: "user-456"
                // missing transcript
            })
        });

        expect(res.status).toBe(400);
    });
});
