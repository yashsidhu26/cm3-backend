import { ExtractorService } from './services/extractor.service';
import { SchedulerService } from './services/scheduler.service';
import { StudentProfile } from './schemas/profile.schema';
import { ScheduleResponse } from './schemas/ai.schema';

export class ProductivityModule {
    private extractor: ExtractorService;
    private scheduler: SchedulerService;

    constructor() {
        this.extractor = new ExtractorService();
        this.scheduler = new SchedulerService();
    }

    /**
     * Orchestrates the productivity pipeline:
     * 1. Extractor (Llama) - Extracts tasks from transcript
     * 2. Scheduler (Gemini) - Maps tasks to a time-blocked schedule
     */
    async planDay(userId: string, transcript: string, profile: StudentProfile): Promise<ScheduleResponse> {
        console.log(`[ProductivityModule] Planning day for user: ${userId}`);

        // Stage 1: Extraction
        const extractionResult = await this.extractor.extractTasks(transcript, profile);
        console.log(`[ProductivityModule] Extracted ${extractionResult.tasks.length} tasks`);

        // Stage 2: Scheduling
        const schedule = await this.scheduler.createSchedule(extractionResult.tasks, profile);
        console.log(`[ProductivityModule] Schedule generated with efficiency score: ${schedule.efficiencyScore}`);

        return schedule;
    }
}
