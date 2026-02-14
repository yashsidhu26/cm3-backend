import { eq, and, ilike, or, inArray, desc } from 'drizzle-orm';
import { db } from '../../core/database/client';
import {
  skillsInterests,
  userSkillsInterests,
  skillResources,
  skillRelationships,
  skillPlans,
  skillTasks,
  type SkillInterest,
  type NewSkillInterest,
  type UserSkillInterest,
  type NewUserSkillInterest,
  type SkillResource,
  type NewSkillResource,
  type SkillRelationship,
  type NewSkillRelationship,
  type SkillPlan,
  type SkillTask,
  type NewSkillTask,
} from './skills-interests.schema';
import { scheduleItems, schedules } from '../student-profile/student-profile.schema';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';

const aiSkillPlanResponseSchema = z.object({
  skill: z.object({
    name: z.string().min(1),
    category: z.enum([
      'programming',
      'design',
      'business',
      'languages',
      'personal',
      'academic',
      'creative',
      'technical',
      'other',
    ]),
    description: z.string().optional(),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
    estimatedHours: z.number().optional(),
    tags: z.array(z.string()).optional(),
    icon: z.string().optional(),
  }),
  tasks: z.array(
    z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      howTo: z.string().optional(),
      taskType: z.enum(['task', 'subskill']).optional(),
      estimatedMinutes: z.number().optional(),
      order: z.number().optional(),
    })
  ),
});

/**
 * Skills & Interests Service
 * Business logic for managing skills/interests
 */

export class SkillsInterestsService {
  private async resolveUserSkill(userId: string, idOrSkillInterestId: string) {
    const [byId] = await db
      .select()
      .from(userSkillsInterests)
      .where(and(eq(userSkillsInterests.userId, userId), eq(userSkillsInterests.id, idOrSkillInterestId)))
      .limit(1);

    if (byId) return byId;

    const [bySkillId] = await db
      .select()
      .from(userSkillsInterests)
      .where(
        and(
          eq(userSkillsInterests.userId, userId),
          eq(userSkillsInterests.skillInterestId, idOrSkillInterestId)
        )
      )
      .limit(1);

    return bySkillId || null;
  }
  private getAIClient() {
    const projectId =
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCP_PROJECT_ID ||
      process.env.VERTEX_PROJECT_ID;
    if (!projectId) {
      throw new Error('Google Cloud project ID not configured');
    }
    const location = process.env.GCP_LOCATION || 'global';
    return new GoogleGenAI({ vertexai: true, project: projectId, location });
  }

  private getSkillPlanModel() {
    return (
      process.env.SKILL_PLAN_MODEL ||
      process.env.GEMINI_MODEL ||
      process.env.SMART_SCHEDULE_MODEL ||
      'gemini-2.5-flash'
    );
  }

  private getSkillPlanFallbackModel() {
    return process.env.SKILL_PLAN_FALLBACK_MODEL || 'gemini-2.5-flash';
  }

  private isModelNotFound(error: any) {
    const message = error?.message || '';
    return (
      (message.includes('Model') && message.includes('was not found')) ||
      message.includes('NOT_FOUND') ||
      message.includes('Publisher Model')
    );
  }

  private async generateSkillPlanWithAI(input: {
    interest: string;
    additionalPreferences?: string;
  }) {
    const ai = this.getAIClient();
    const model = this.getSkillPlanModel();
    const fallbackModel = this.getSkillPlanFallbackModel();
    const systemPrompt =
      'You are an expert learning planner. Return ONLY valid JSON matching this schema: ' +
      '{"skill":{"name":"...","category":"programming|design|business|languages|personal|academic|creative|technical|other","description":"...","difficulty":"beginner|intermediate|advanced|expert","estimatedHours":20,"tags":["..."],"icon":"..."},' +
      '"tasks":[{"title":"...","description":"...","howTo":"...","taskType":"task|subskill","estimatedMinutes":60,"order":1}]}' +
      '. Provide 5-10 tasks with clear how-to steps. Use taskType=subskill when it is a skill chunk.';

    const userPrompt = `Interest: ${input.interest}\nPreferences: ${
      input.additionalPreferences || 'None'
    }\nReturn JSON only.`;

    let result;
    try {
      result = await ai.models.generateContent({
        model,
        contents: [
          { role: 'user', parts: [{ text: systemPrompt + '\n' + userPrompt }] },
        ],
      });
    } catch (error: any) {
      if (this.isModelNotFound(error) && fallbackModel !== model) {
        console.warn('[SkillPlan] Primary model not found, falling back:', model, '->', fallbackModel);
        result = await ai.models.generateContent({
          model: fallbackModel,
          contents: [
            { role: 'user', parts: [{ text: systemPrompt + '\n' + userPrompt }] },
          ],
        });
      } else {
        throw error;
      }
    }

    const raw = result.text?.trim() || '';
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error('AI returned non-JSON response');
    }
    const text = raw.slice(jsonStart, jsonEnd + 1);
    const parsed = aiSkillPlanResponseSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      throw new Error('AI returned invalid skill plan data');
    }
    return parsed.data;
  }

  /**
   * Get all skills/interests (catalog)
   */
  async getAllSkills(filters?: {
    category?: string;
    difficulty?: string;
    search?: string;
  }): Promise<SkillInterest[]> {
    let query = db.select().from(skillsInterests);

    // Apply filters (simplified - you can enhance this)
    const results = await query;

    let filtered = results;

    if (filters?.category) {
      filtered = filtered.filter((s) => s.category === filters.category);
    }

    if (filters?.difficulty) {
      filtered = filtered.filter((s) => s.difficulty === filters.difficulty);
    }

    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(searchLower) ||
          s.description?.toLowerCase().includes(searchLower) ||
          s.tags?.some((tag) => tag.toLowerCase().includes(searchLower))
      );
    }

    return filtered;
  }

  /**
   * Get skill by ID
   */
  async getSkillById(id: string): Promise<SkillInterest | null> {
    const [skill] = await db
      .select()
      .from(skillsInterests)
      .where(eq(skillsInterests.id, id))
      .limit(1);

    return skill || null;
  }

  /**
   * Create new skill/interest
   */
  async createSkill(data: NewSkillInterest): Promise<SkillInterest> {
    const [skill] = await db.insert(skillsInterests).values(data).returning();
    return skill;
  }

  /**
   * Update skill/interest
   */
  async updateSkill(id: string, data: Partial<NewSkillInterest>): Promise<SkillInterest> {
    const [skill] = await db
      .update(skillsInterests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(skillsInterests.id, id))
      .returning();

    return skill;
  }

  /**
   * Delete skill/interest
   */
  async deleteSkill(id: string): Promise<void> {
    await db.delete(skillsInterests).where(eq(skillsInterests.id, id));
  }

  /**
   * Get user's skills/interests
   */
  async getUserSkills(userId: string, status?: string): Promise<any[]> {
    let query = db
      .select()
      .from(userSkillsInterests)
      .where(eq(userSkillsInterests.userId, userId));

    const results = await query;

    let filtered = results;
    if (status) {
      filtered = results.filter((r) => r.status === status);
    }

    // Fetch skill details for each
    const withDetails = [];
    for (const userSkill of filtered) {
      const [skill] = await db
        .select()
        .from(skillsInterests)
        .where(eq(skillsInterests.id, userSkill.skillInterestId))
        .limit(1);

      if (skill) {
        withDetails.push({
          ...userSkill,
          skill,
        });
      }
    }

    return withDetails;
  }

  /**
   * Add skill to user's learning list
   */
  async addSkillToUser(userId: string, skillInterestId: string, status: string = 'interested'): Promise<UserSkillInterest> {
    // Check if already added
    const existing = await db
      .select()
      .from(userSkillsInterests)
      .where(
        and(
          eq(userSkillsInterests.userId, userId),
          eq(userSkillsInterests.skillInterestId, skillInterestId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw new Error('Skill already added to your list');
    }

    const [userSkill] = await db
      .insert(userSkillsInterests)
      .values({
        userId,
        skillInterestId,
        status: status as any,
        startedAt: status === 'learning' ? new Date() : null,
      })
      .returning();

    return userSkill;
  }

  async addInterestWithPlan(
    userId: string,
    data: {
      interest: string;
      status?: string;
      additionalPreferences?: string;
    }
  ): Promise<{
    skill: SkillInterest;
    userSkill: UserSkillInterest;
    plan: SkillPlan;
    tasks: SkillTask[];
  }> {
    const aiResult = await this.generateSkillPlanWithAI({
      interest: data.interest,
      additionalPreferences: data.additionalPreferences,
    });

    const skillName = aiResult.skill.name.trim();
    let skill = await db
      .select()
      .from(skillsInterests)
      .where(ilike(skillsInterests.name, skillName))
      .limit(1)
      .then((rows) => rows[0]);

    if (!skill) {
      const [created] = await db
        .insert(skillsInterests)
        .values({
          name: aiResult.skill.name,
          category: aiResult.skill.category,
          description: aiResult.skill.description,
          difficulty: aiResult.skill.difficulty,
          estimatedHours: aiResult.skill.estimatedHours,
          tags: aiResult.skill.tags,
          icon: aiResult.skill.icon,
        })
        .returning();
      skill = created;
    }

    let userSkill = await db
      .select()
      .from(userSkillsInterests)
      .where(and(eq(userSkillsInterests.userId, userId), eq(userSkillsInterests.skillInterestId, skill.id)))
      .limit(1)
      .then((rows) => rows[0]);

    if (!userSkill) {
      const status = (data.status || 'learning') as any;
      const [createdUserSkill] = await db
        .insert(userSkillsInterests)
        .values({
          userId,
          skillInterestId: skill.id,
          status,
          startedAt: status === 'learning' ? new Date() : null,
        })
        .returning();
      userSkill = createdUserSkill;
    }

    const [plan] = await db
      .insert(skillPlans)
      .values({
        userId,
        skillInterestId: skill.id,
        title: `Plan for ${skill.name}`,
        description: aiResult.skill.description,
      })
      .returning();

    const tasksToInsert: NewSkillTask[] = aiResult.tasks.map((task, idx) => ({
      planId: plan.id,
      userId,
      skillInterestId: skill.id,
      title: task.title,
      description: task.description,
      howTo: task.howTo,
      taskType: task.taskType || 'task',
      order: task.order ?? idx + 1,
      estimatedMinutes: task.estimatedMinutes,
    }));

    const tasks = tasksToInsert.length
      ? await db.insert(skillTasks).values(tasksToInsert).returning()
      : [];

    await this.recalculateSkillProgress(userId, skill.id);

    return { skill, userSkill, plan, tasks };
  }

  async getSkillPlan(userId: string, skillInterestId: string) {
    const [plan] = await db
      .select()
      .from(skillPlans)
      .where(and(eq(skillPlans.userId, userId), eq(skillPlans.skillInterestId, skillInterestId)))
      .orderBy(desc(skillPlans.createdAt))
      .limit(1);

    if (!plan) return null;

    const tasks = await db
      .select()
      .from(skillTasks)
      .where(and(eq(skillTasks.userId, userId), eq(skillTasks.skillInterestId, skillInterestId)))
      .orderBy(skillTasks.order);

    return { plan, tasks };
  }

  async updateSkillTask(
    userId: string,
    taskId: string,
    data: {
      status?: 'pending' | 'in_progress' | 'completed' | 'skipped';
      notes?: string;
    }
  ) {
    const updateData: any = { ...data, updatedAt: new Date() };
    if (data.status === 'completed') {
      updateData.completedAt = new Date();
    }

    const [task] = await db
      .update(skillTasks)
      .set(updateData)
      .where(and(eq(skillTasks.id, taskId), eq(skillTasks.userId, userId)))
      .returning();

    if (!task) {
      throw new Error('Skill task not found');
    }

    await this.recalculateSkillProgress(userId, task.skillInterestId);
    return task;
  }

  async addSkillTaskToSchedule(
    userId: string,
    taskId: string,
    data: {
      scheduleId: string;
      startDateTime: string;
      endDateTime: string;
    }
  ) {
    const [task] = await db
      .select()
      .from(skillTasks)
      .where(and(eq(skillTasks.id, taskId), eq(skillTasks.userId, userId)))
      .limit(1);

    if (!task) {
      throw new Error('Skill task not found');
    }

    const [schedule] = await db
      .select()
      .from(schedules)
      .where(and(eq(schedules.id, data.scheduleId), eq(schedules.userId, userId)))
      .limit(1);

    if (!schedule) {
      throw new Error('Schedule not found');
    }

    const [item] = await db
      .insert(scheduleItems)
      .values({
        scheduleId: data.scheduleId,
        userId,
        title: task.title,
        description: task.description || task.howTo || undefined,
        type: 'custom',
        linkedEntityId: task.id,
        linkedEntityType: 'skill_task',
        startDateTime: new Date(data.startDateTime),
        endDateTime: new Date(data.endDateTime),
      })
      .returning();

    await db
      .update(skillTasks)
      .set({ scheduleItemId: item.id, updatedAt: new Date() })
      .where(eq(skillTasks.id, task.id));

    return item;
  }

  private async recalculateSkillProgress(userId: string, skillInterestId: string) {
    const tasks = await db
      .select()
      .from(skillTasks)
      .where(and(eq(skillTasks.userId, userId), eq(skillTasks.skillInterestId, skillInterestId)));

    if (tasks.length === 0) return;

    const completed = tasks.filter((t) => t.status === 'completed').length;
    const progress = Math.round((completed / tasks.length) * 100);

    const [userSkill] = await db
      .select()
      .from(userSkillsInterests)
      .where(and(eq(userSkillsInterests.userId, userId), eq(userSkillsInterests.skillInterestId, skillInterestId)))
      .limit(1);

    if (!userSkill) return;

    let nextStatus = userSkill.status;
    if (progress >= 100) {
      nextStatus = 'completed';
    } else if (progress > 0 && userSkill.status !== 'paused') {
      nextStatus = 'learning';
    }

    await db
      .update(userSkillsInterests)
      .set({
        progress,
        status: nextStatus as any,
        completedAt: progress >= 100 ? new Date() : userSkill.completedAt,
        updatedAt: new Date(),
      })
      .where(eq(userSkillsInterests.id, userSkill.id));
  }

  /**
   * Update user skill status/progress
   */
  async updateUserSkill(
    userId: string,
    skillInterestId: string,
    data: {
      status?: string;
      progress?: number;
      notes?: string;
    }
  ): Promise<UserSkillInterest> {
    const resolved = await this.resolveUserSkill(userId, skillInterestId);
    if (!resolved) {
      throw new Error('Skill not found in your list');
    }

    const updateData: any = { ...data, updatedAt: new Date() };

    if (data.status === 'learning' && !updateData.startedAt) {
      updateData.startedAt = new Date();
    }

    if (data.status === 'completed') {
      updateData.completedAt = new Date();
      updateData.progress = 100;
    }

    const [userSkill] = await db
      .update(userSkillsInterests)
      .set(updateData)
      .where(and(eq(userSkillsInterests.userId, userId), eq(userSkillsInterests.id, resolved.id)))
      .returning();

    if (!userSkill) {
      throw new Error('User skill not found');
    }

    return userSkill;
  }

  /**
   * Remove skill from user's list
   */
  async removeSkillFromUser(userId: string, skillInterestId: string): Promise<void> {
    const resolved = await this.resolveUserSkill(userId, skillInterestId);
    if (!resolved) {
      throw new Error('Skill not found in your list');
    }

    const deleted = await db
      .delete(userSkillsInterests)
      .where(and(eq(userSkillsInterests.userId, userId), eq(userSkillsInterests.id, resolved.id)))
      .returning();

    if (deleted.length === 0) {
      throw new Error('Skill not found in your list');
    }
  }

  /**
   * Get resources for a skill
   */
  async getSkillResources(skillInterestId: string): Promise<SkillResource[]> {
    return await db
      .select()
      .from(skillResources)
      .where(eq(skillResources.skillInterestId, skillInterestId));
  }

  /**
   * Add resource to skill
   */
  async addResource(data: NewSkillResource): Promise<SkillResource> {
    const [resource] = await db.insert(skillResources).values(data).returning();
    return resource;
  }

  /**
   * Update resource
   */
  async updateResource(id: string, data: Partial<NewSkillResource>): Promise<SkillResource> {
    const [resource] = await db
      .update(skillResources)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(skillResources.id, id))
      .returning();

    return resource;
  }

  /**
   * Delete resource
   */
  async deleteResource(id: string): Promise<void> {
    await db.delete(skillResources).where(eq(skillResources.id, id));
  }

  /**
   * Get user's learning stats
   */
  async getUserStats(userId: string) {
    const allSkills = await db
      .select()
      .from(userSkillsInterests)
      .where(eq(userSkillsInterests.userId, userId));

    const stats = {
      total: allSkills.length,
      interested: allSkills.filter((s) => s.status === 'interested').length,
      learning: allSkills.filter((s) => s.status === 'learning').length,
      completed: allSkills.filter((s) => s.status === 'completed').length,
      paused: allSkills.filter((s) => s.status === 'paused').length,
      totalProgress: allSkills.reduce((sum, s) => sum + (s.progress || 0), 0),
      avgProgress: allSkills.length > 0
        ? Math.round(allSkills.reduce((sum, s) => sum + (s.progress || 0), 0) / allSkills.length)
        : 0,
    };

    return stats;
  }

  /**
   * Get related skills for a skill
   */
  async getRelatedSkills(skillId: string): Promise<any[]> {
    // Get both directions of relationships
    const [outgoing, incoming] = await Promise.all([
      db
        .select()
        .from(skillRelationships)
        .where(eq(skillRelationships.fromSkillId, skillId)),
      db
        .select()
        .from(skillRelationships)
        .where(eq(skillRelationships.toSkillId, skillId)),
    ]);

    // Fetch skill details for related skills
    const relatedSkillIds = [
      ...outgoing.map((r) => r.toSkillId),
      ...incoming.map((r) => r.fromSkillId),
    ];

    if (relatedSkillIds.length === 0) {
      return [];
    }

    const relatedSkills = await db
      .select()
      .from(skillsInterests)
      .where(inArray(skillsInterests.id, relatedSkillIds));

    // Build result with relationship context
    const result = [];
    for (const rel of outgoing) {
      const skill = relatedSkills.find((s) => s.id === rel.toSkillId);
      if (skill) {
        result.push({
          ...skill,
          relationshipType: rel.relationshipType,
          relationshipDescription: rel.description,
          direction: 'outgoing',
        });
      }
    }
    for (const rel of incoming) {
      const skill = relatedSkills.find((s) => s.id === rel.fromSkillId);
      if (skill) {
        result.push({
          ...skill,
          relationshipType: rel.relationshipType,
          relationshipDescription: rel.description,
          direction: 'incoming',
        });
      }
    }

    return result;
  }

  /**
   * Add relationship between skills
   */
  async addSkillRelationship(data: NewSkillRelationship): Promise<SkillRelationship> {
    // Check if relationship already exists
    const existing = await db
      .select()
      .from(skillRelationships)
      .where(
        and(
          eq(skillRelationships.fromSkillId, data.fromSkillId),
          eq(skillRelationships.toSkillId, data.toSkillId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw new Error('Relationship already exists');
    }

    const [relationship] = await db.insert(skillRelationships).values(data).returning();
    return relationship;
  }

  /**
   * Delete skill relationship
   */
  async deleteSkillRelationship(fromSkillId: string, toSkillId: string): Promise<void> {
    await db
      .delete(skillRelationships)
      .where(
        and(
          eq(skillRelationships.fromSkillId, fromSkillId),
          eq(skillRelationships.toSkillId, toSkillId)
        )
      );
  }

  /**
   * Get skill recommendations for user based on their completed/learning skills
   */
  async getRecommendations(userId: string): Promise<any[]> {
    // Get user's completed and learning skills
    const userSkills = await db
      .select()
      .from(userSkillsInterests)
      .where(
        and(
          eq(userSkillsInterests.userId, userId),
          or(
            eq(userSkillsInterests.status, 'completed'),
            eq(userSkillsInterests.status, 'learning')
          )
        )
      );

    if (userSkills.length === 0) {
      return [];
    }

    const userSkillIds = userSkills.map((us) => us.skillInterestId);

    // Find skills related to user's skills
    const relatedSkillRelations = await db
      .select()
      .from(skillRelationships)
      .where(inArray(skillRelationships.fromSkillId, userSkillIds));

    const recommendedSkillIds = relatedSkillRelations
      .map((r) => r.toSkillId)
      .filter((id) => !userSkillIds.includes(id)); // Exclude skills user already has

    if (recommendedSkillIds.length === 0) {
      return [];
    }

    // Get unique recommended skills
    const uniqueIds = [...new Set(recommendedSkillIds)];

    const recommendedSkills = await db
      .select()
      .from(skillsInterests)
      .where(inArray(skillsInterests.id, uniqueIds));

    // Add context about why recommended
    const result = recommendedSkills.map((skill) => {
      const relations = relatedSkillRelations.filter((r) => r.toSkillId === skill.id);
      return {
        ...skill,
        recommendationReasons: relations.map((r) => ({
          relationType: r.relationshipType,
          description: r.description,
        })),
      };
    });

    return result;
  }
}

export const skillsInterestsService = new SkillsInterestsService();
