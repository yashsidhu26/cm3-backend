import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { protect } from '../../core/auth/middleware';
import { successResponse, errorResponse } from '../../core/utils/response';
import { skillsInterestsService } from './skills-interests.service';

const app = new Hono();

// ============================================
// VALIDATION SCHEMAS
// ============================================

const skillCreateSchema = z.object({
  name: z.string().max(255),
  category: z.enum(['programming', 'design', 'business', 'languages', 'personal', 'academic', 'creative', 'technical', 'other']),
  description: z.string().optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
  estimatedHours: z.number().optional(),
  tags: z.array(z.string()).optional(),
  icon: z.string().max(100).optional(),
});

const skillUpdateSchema = skillCreateSchema.partial();

const userSkillAddSchema = z.object({
  skillInterestId: z.string().uuid(),
  status: z.enum(['interested', 'learning', 'completed', 'paused']).optional().default('interested'),
});

const userSkillUpdateSchema = z.object({
  status: z.enum(['interested', 'learning', 'completed', 'paused']).optional(),
  progress: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
});

const addInterestSchema = z.object({
  interest: z.string().min(1).max(255),
  status: z.enum(['interested', 'learning', 'completed', 'paused']).optional(),
  additionalPreferences: z.string().max(4000).optional(),
});

const skillTaskUpdateSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'skipped']).optional(),
  notes: z.string().optional(),
});

const addSkillTaskToScheduleSchema = z.object({
  scheduleId: z.string().uuid(),
  startDateTime: z.string().datetime(),
  endDateTime: z.string().datetime(),
});

const resourceCreateSchema = z.object({
  skillInterestId: z.string().uuid(),
  title: z.string().max(500),
  url: z.string().optional(),
  type: z.enum(['article', 'video', 'course', 'book', 'tutorial', 'documentation', 'project', 'other']),
  description: z.string().optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
  estimatedHours: z.number().optional(),
});

const resourceUpdateSchema = resourceCreateSchema.partial().omit({ skillInterestId: true });

// ============================================
// SKILLS CATALOG ENDPOINTS
// ============================================

/**
 * GET /
 * Get all skills/interests with optional filters
 */
app.get('/', protect, async (c) => {
  try {
    const category = c.req.query('category');
    const difficulty = c.req.query('difficulty');
    const search = c.req.query('search');

    const skills = await skillsInterestsService.getAllSkills({
      category,
      difficulty,
      search,
    });

    return successResponse(c, skills);
  } catch (error: any) {
    console.error('Failed to get skills:', error);
    return errorResponse(c, error.message || 'Failed to fetch skills', 500);
  }
});

/**
 * POST /
 * Create new skill/interest (authenticated)
 */
app.post('/', protect, zValidator('json', skillCreateSchema), async (c) => {
  try {
    const data = c.req.valid('json');

    const skill = await skillsInterestsService.createSkill(data);

    return successResponse(c, skill);
  } catch (error: any) {
    console.error('Failed to create skill:', error);
    return errorResponse(c, error.message || 'Failed to create skill', 500);
  }
});

// ============================================
// USER SKILLS ENDPOINTS
// ============================================

/**
 * GET /my-skills
 * Get user's skills/interests
 */
app.get('/my-skills', protect, async (c) => {
  try {
    const user = c.get('user');
    const status = c.req.query('status');

    const skills = await skillsInterestsService.getUserSkills(user.id, status);

    return successResponse(c, skills);
  } catch (error: any) {
    console.error('Failed to get user skills:', error);
    return errorResponse(c, error.message || 'Failed to fetch user skills', 500);
  }
});

/**
 * GET /my-skills/stats
 * Get user's learning statistics
 */
app.get('/my-skills/stats', protect, async (c) => {
  try {
    const user = c.get('user');

    const stats = await skillsInterestsService.getUserStats(user.id);

    return successResponse(c, stats);
  } catch (error: any) {
    console.error('Failed to get user stats:', error);
    return errorResponse(c, error.message || 'Failed to fetch user stats', 500);
  }
});

/**
 * POST /my-skills
 * Add skill to user's learning list
 */
app.post('/my-skills', protect, zValidator('json', userSkillAddSchema), async (c) => {
  try {
    const user = c.get('user');
    const { skillInterestId, status } = c.req.valid('json');

    const userSkill = await skillsInterestsService.addSkillToUser(
      user.id,
      skillInterestId,
      status
    );

    return successResponse(c, {
      message: 'Skill added to your list',
      userSkill,
    });
  } catch (error: any) {
    console.error('Failed to add skill:', error);
    return errorResponse(c, error.message || 'Failed to add skill', 500);
  }
});

/**
 * POST /my-skills/add-interest
 * Add a new interest and generate an AI plan with sub-tasks
 */
app.post('/my-skills/add-interest', protect, zValidator('json', addInterestSchema), async (c) => {
  try {
    const user = c.get('user');
    const data = c.req.valid('json');

    const result = await skillsInterestsService.addInterestWithPlan(user.id, data);

    return successResponse(c, {
      message: 'Interest added with learning plan',
      ...result,
    });
  } catch (error: any) {
    console.error('Failed to add interest with plan:', error);
    return errorResponse(c, error.message || 'Failed to add interest', 500);
  }
});

/**
 * GET /my-skills/:skillInterestId/plan
 * Get the latest plan and tasks for a skill
 */
app.get('/my-skills/:skillInterestId/plan', protect, async (c) => {
  try {
    const user = c.get('user');
    const skillInterestId = c.req.param('skillInterestId');

    const plan = await skillsInterestsService.getSkillPlan(user.id, skillInterestId);
    if (!plan) {
      return errorResponse(c, 'Skill plan not found', 404);
    }

    return successResponse(c, plan);
  } catch (error: any) {
    console.error('Failed to get skill plan:', error);
    return errorResponse(c, error.message || 'Failed to fetch skill plan', 500);
  }
});

/**
 * PATCH /my-skills/tasks/:taskId
 * Update a skill task status/notes (auto-updates skill progress)
 */
app.patch('/my-skills/tasks/:taskId', protect, zValidator('json', skillTaskUpdateSchema), async (c) => {
  try {
    const user = c.get('user');
    const taskId = c.req.param('taskId');
    const data = c.req.valid('json');

    const task = await skillsInterestsService.updateSkillTask(user.id, taskId, data);

    return successResponse(c, {
      message: 'Skill task updated successfully',
      task,
    });
  } catch (error: any) {
    console.error('Failed to update skill task:', error);
    return errorResponse(c, error.message || 'Failed to update skill task', 500);
  }
});

/**
 * POST /my-skills/tasks/:taskId/schedule
 * Add a skill task to a schedule
 */
app.post(
  '/my-skills/tasks/:taskId/schedule',
  protect,
  zValidator('json', addSkillTaskToScheduleSchema),
  async (c) => {
    try {
      const user = c.get('user');
      const taskId = c.req.param('taskId');
      const data = c.req.valid('json');

      const item = await skillsInterestsService.addSkillTaskToSchedule(user.id, taskId, data);

      return successResponse(c, {
        message: 'Task added to schedule',
        scheduleItem: item,
      });
    } catch (error: any) {
      console.error('Failed to add task to schedule:', error);
      return errorResponse(c, error.message || 'Failed to add task to schedule', 500);
    }
  }
);

/**
 * PATCH /my-skills/:skillInterestId
 * Update user skill status/progress
 */
app.patch(
  '/my-skills/:skillInterestId',
  protect,
  zValidator('json', userSkillUpdateSchema),
  async (c) => {
    try {
      const user = c.get('user');
      const skillInterestId = c.req.param('skillInterestId');
      const data = c.req.valid('json');

      const userSkill = await skillsInterestsService.updateUserSkill(
        user.id,
        skillInterestId,
        data
      );

      return successResponse(c, {
        message: 'Skill updated successfully',
        userSkill,
      });
    } catch (error: any) {
      console.error('Failed to update user skill:', error);
      return errorResponse(c, error.message || 'Failed to update skill', 500);
    }
  }
);

/**
 * DELETE /my-skills/:skillInterestId
 * Remove skill from user's list
 */
app.delete('/my-skills/:skillInterestId', protect, async (c) => {
  try {
    const user = c.get('user');
    const skillInterestId = c.req.param('skillInterestId');

    await skillsInterestsService.removeSkillFromUser(user.id, skillInterestId);

    return successResponse(c, { message: 'Skill removed from your list' });
  } catch (error: any) {
    console.error('Failed to remove skill:', error);
    return errorResponse(c, error.message || 'Failed to remove skill', 500);
  }
});

// ============================================
// RESOURCES ENDPOINTS
// ============================================

/**
 * GET /:skillId/resources
 * Get resources for a skill
 */
app.get('/:skillId/resources', protect, async (c) => {
  try {
    const skillId = c.req.param('skillId');

    const resources = await skillsInterestsService.getSkillResources(skillId);

    return successResponse(c, resources);
  } catch (error: any) {
    console.error('Failed to get resources:', error);
    return errorResponse(c, error.message || 'Failed to fetch resources', 500);
  }
});

/**
 * POST /resources
 * Add resource to skill
 */
app.post('/resources', protect, zValidator('json', resourceCreateSchema), async (c) => {
  try {
    const user = c.get('user');
    const data = c.req.valid('json');

    const resource = await skillsInterestsService.addResource({
      ...data,
      userId: user.id,
    });

    return successResponse(c, {
      message: 'Resource added successfully',
      resource,
    });
  } catch (error: any) {
    console.error('Failed to add resource:', error);
    return errorResponse(c, error.message || 'Failed to add resource', 500);
  }
});

/**
 * PUT /resources/:id
 * Update resource
 */
app.put('/resources/:id', protect, zValidator('json', resourceUpdateSchema), async (c) => {
  try {
    const id = c.req.param('id');
    const data = c.req.valid('json');

    const resource = await skillsInterestsService.updateResource(id, data);

    return successResponse(c, {
      message: 'Resource updated successfully',
      resource,
    });
  } catch (error: any) {
    console.error('Failed to update resource:', error);
    return errorResponse(c, error.message || 'Failed to update resource', 500);
  }
});

/**
 * DELETE /resources/:id
 * Delete resource
 */
app.delete('/resources/:id', protect, async (c) => {
  try {
    const id = c.req.param('id');

    await skillsInterestsService.deleteResource(id);

    return successResponse(c, { message: 'Resource deleted successfully' });
  } catch (error: any) {
    console.error('Failed to delete resource:', error);
    return errorResponse(c, error.message || 'Failed to delete resource', 500);
  }
});

// ============================================
// SKILL RELATIONSHIPS ENDPOINTS
// ============================================

/**
 * GET /:skillId/related
 * Get related skills for a skill
 */
app.get('/:skillId/related', protect, async (c) => {
  try {
    const skillId = c.req.param('skillId');

    const relatedSkills = await skillsInterestsService.getRelatedSkills(skillId);

    return successResponse(c, relatedSkills);
  } catch (error: any) {
    console.error('Failed to get related skills:', error);
    return errorResponse(c, error.message || 'Failed to get related skills', 500);
  }
});

const relationshipCreateSchema = z.object({
  fromSkillId: z.string().uuid(),
  toSkillId: z.string().uuid(),
  relationshipType: z.enum(['prerequisite', 'related', 'builds_on', 'alternative']),
  description: z.string().optional(),
});

/**
 * POST /relationships
 * Create relationship between skills
 */
app.post('/relationships', protect, zValidator('json', relationshipCreateSchema), async (c) => {
  try {
    const data = c.req.valid('json');

    const relationship = await skillsInterestsService.addSkillRelationship(data);

    return successResponse(c, {
      message: 'Skill relationship created successfully',
      relationship,
    });
  } catch (error: any) {
    console.error('Failed to create relationship:', error);
    return errorResponse(c, error.message || 'Failed to create relationship', 500);
  }
});

/**
 * DELETE /relationships/:fromSkillId/:toSkillId
 * Delete relationship between skills
 */
app.delete('/relationships/:fromSkillId/:toSkillId', protect, async (c) => {
  try {
    const fromSkillId = c.req.param('fromSkillId');
    const toSkillId = c.req.param('toSkillId');

    await skillsInterestsService.deleteSkillRelationship(fromSkillId, toSkillId);

    return successResponse(c, { message: 'Relationship deleted successfully' });
  } catch (error: any) {
    console.error('Failed to delete relationship:', error);
    return errorResponse(c, error.message || 'Failed to delete relationship', 500);
  }
});

/**
 * GET /recommendations
 * Get recommended skills for user based on their current skills
 */
app.get('/recommendations', protect, async (c) => {
  try {
    const user = c.get('user');

    const recommendations = await skillsInterestsService.getRecommendations(user.id);

    return successResponse(c, recommendations);
  } catch (error: any) {
    console.error('Failed to get recommendations:', error);
    return errorResponse(c, error.message || 'Failed to get recommendations', 500);
  }
});

// ============================================
// SKILL DETAIL ENDPOINTS (placed last to avoid route conflicts)
// ============================================

/**
 * GET /:id
 * Get skill by ID
 */
app.get('/:id', protect, async (c) => {
  try {
    const id = c.req.param('id');

    const skill = await skillsInterestsService.getSkillById(id);

    if (!skill) {
      return errorResponse(c, 'Skill not found', 404);
    }

    return successResponse(c, skill);
  } catch (error: any) {
    console.error('Failed to get skill:', error);
    return errorResponse(c, error.message || 'Failed to fetch skill', 500);
  }
});

/**
 * PUT /:id
 * Update skill/interest
 */
app.put('/:id', protect, zValidator('json', skillUpdateSchema), async (c) => {
  try {
    const id = c.req.param('id');
    const data = c.req.valid('json');

    const skill = await skillsInterestsService.updateSkill(id, data);

    return successResponse(c, skill);
  } catch (error: any) {
    console.error('Failed to update skill:', error);
    return errorResponse(c, error.message || 'Failed to update skill', 500);
  }
});

/**
 * DELETE /:id
 * Delete skill/interest
 */
app.delete('/:id', protect, async (c) => {
  try {
    const id = c.req.param('id');

    await skillsInterestsService.deleteSkill(id);

    return successResponse(c, { message: 'Skill deleted successfully' });
  } catch (error: any) {
    console.error('Failed to delete skill:', error);
    return errorResponse(c, error.message || 'Failed to delete skill', 500);
  }
});

export default app;
