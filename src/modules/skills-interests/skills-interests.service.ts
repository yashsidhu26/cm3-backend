import { eq, and, ilike, or, inArray } from 'drizzle-orm';
import { db } from '../../core/database/client';
import {
  skillsInterests,
  userSkillsInterests,
  skillResources,
  skillRelationships,
  type SkillInterest,
  type NewSkillInterest,
  type UserSkillInterest,
  type NewUserSkillInterest,
  type SkillResource,
  type NewSkillResource,
  type SkillRelationship,
  type NewSkillRelationship,
} from './skills-interests.schema';

/**
 * Skills & Interests Service
 * Business logic for managing skills/interests
 */

export class SkillsInterestsService {
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
      .where(
        and(
          eq(userSkillsInterests.userId, userId),
          eq(userSkillsInterests.skillInterestId, skillInterestId)
        )
      )
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
    const deleted = await db
      .delete(userSkillsInterests)
      .where(
        and(
          eq(userSkillsInterests.userId, userId),
          eq(userSkillsInterests.skillInterestId, skillInterestId)
        )
      )
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
