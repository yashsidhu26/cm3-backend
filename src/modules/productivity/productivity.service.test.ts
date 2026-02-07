import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { ProductivityModule } from './productivity.module';
import { ExtractorService } from './services/extractor.service';
import { SchedulerService } from './services/scheduler.service';
import type { StudentProfile } from './schemas/profile.schema';

// Mock the services
mock.module('./services/extractor.service', () => {
    return {
        ExtractorService: class {
            extractTasks = mock(async () => ({
                tasks: [
                    { title: "Task 1", priority: "high", durationMinutes: 60 },
                    { title: "Task 2", priority: "medium", durationMinutes: 30 }
                ]
            }))
        }
    };
});

mock.module('./services/scheduler.service', () => {
    return {
        SchedulerService: class {
            createSchedule = mock(async () => ({
                efficiencyScore: 85,
                blocks: [
                    { startTime: "10:30", endTime: "11:30", taskTitle: "Task 1", activityType: "deep_work" },
                    { startTime: "11:30", endTime: "12:00", taskTitle: "Task 2", activityType: "shallow_work" }
                ]
            }))
        }
    };
});

describe('ProductivityModule', () => {
    let module: ProductivityModule;
    const mockProfile: StudentProfile = {
        existingSchedule: [],
        preferences: { chronotype: "EarlyBird", focusDuration: 45 },
        activeCourses: []
    };

    beforeEach(() => {
        module = new ProductivityModule();
    });

    test('planDay orchestrates extraction and scheduling correctly', async () => {
        const userId = "user-123";
        const transcript = "I have some tasks to do";

        const result = await module.planDay(userId, transcript, mockProfile);

        expect(result.efficiencyScore).toBe(85);
        expect(result.blocks).toHaveLength(2);
        expect(result.blocks[0].taskTitle).toBe("Task 1");
    });
});
