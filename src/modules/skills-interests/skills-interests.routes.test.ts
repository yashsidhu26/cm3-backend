import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { Hono } from 'hono';
import skillsInterestsRoutes from './skills-interests.routes';
import { skillsInterestsService } from './skills-interests.service';

const mockUser = { id: 'user-123', email: 'test@example.com', name: 'Test User' };
const skillId = '11111111-1111-1111-1111-111111111111';
const skillId2 = '22222222-2222-2222-2222-222222222222';
const resourceId = '33333333-3333-3333-3333-333333333333';
const taskId = '44444444-4444-4444-4444-444444444444';

function createAuthedApp() {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('user', mockUser);
    await next();
  });
  app.route('/skills', skillsInterestsRoutes);
  return app;
}

function createAnonApp() {
  const app = new Hono();
  app.route('/skills', skillsInterestsRoutes);
  return app;
}

describe('skills-interests.routes', () => {
  let app: Hono;
  const originalMethods = {
    getAllSkills: skillsInterestsService.getAllSkills.bind(skillsInterestsService),
    getSkillById: skillsInterestsService.getSkillById.bind(skillsInterestsService),
    createSkill: skillsInterestsService.createSkill.bind(skillsInterestsService),
    updateSkill: skillsInterestsService.updateSkill.bind(skillsInterestsService),
    deleteSkill: skillsInterestsService.deleteSkill.bind(skillsInterestsService),
    getUserSkills: skillsInterestsService.getUserSkills.bind(skillsInterestsService),
    getUserStats: skillsInterestsService.getUserStats.bind(skillsInterestsService),
    addSkillToUser: skillsInterestsService.addSkillToUser.bind(skillsInterestsService),
    updateUserSkill: skillsInterestsService.updateUserSkill.bind(skillsInterestsService),
    removeSkillFromUser: skillsInterestsService.removeSkillFromUser.bind(skillsInterestsService),
    getSkillResources: skillsInterestsService.getSkillResources.bind(skillsInterestsService),
    addResource: skillsInterestsService.addResource.bind(skillsInterestsService),
    updateResource: skillsInterestsService.updateResource.bind(skillsInterestsService),
    deleteResource: skillsInterestsService.deleteResource.bind(skillsInterestsService),
    getRelatedSkills: skillsInterestsService.getRelatedSkills.bind(skillsInterestsService),
    addSkillRelationship: skillsInterestsService.addSkillRelationship.bind(skillsInterestsService),
    deleteSkillRelationship: skillsInterestsService.deleteSkillRelationship.bind(skillsInterestsService),
    getRecommendations: skillsInterestsService.getRecommendations.bind(skillsInterestsService),
    addInterestWithPlan: skillsInterestsService.addInterestWithPlan.bind(skillsInterestsService),
    getSkillPlan: skillsInterestsService.getSkillPlan.bind(skillsInterestsService),
    updateSkillTask: skillsInterestsService.updateSkillTask.bind(skillsInterestsService),
    addSkillTaskToSchedule: skillsInterestsService.addSkillTaskToSchedule.bind(skillsInterestsService),
  };

  beforeEach(() => {
    app = new Hono();
    app.route('/skills', skillsInterestsRoutes);
    Object.assign(skillsInterestsService, originalMethods);
  });

  describe('Authentication Requirements', () => {
    const cases = [
      { method: 'GET', path: '/skills' },
      { method: 'GET', path: `/skills/${skillId}` },
      { method: 'POST', path: '/skills' },
      { method: 'PUT', path: `/skills/${skillId}` },
      { method: 'DELETE', path: `/skills/${skillId}` },
      { method: 'GET', path: '/skills/my-skills' },
      { method: 'GET', path: '/skills/my-skills/stats' },
      { method: 'POST', path: '/skills/my-skills' },
      { method: 'POST', path: '/skills/my-skills/add-interest' },
      { method: 'GET', path: `/skills/my-skills/${skillId}/plan` },
      { method: 'PATCH', path: `/skills/my-skills/tasks/${taskId}` },
      { method: 'POST', path: `/skills/my-skills/tasks/${taskId}/schedule` },
      { method: 'PATCH', path: `/skills/my-skills/${skillId}` },
      { method: 'DELETE', path: `/skills/my-skills/${skillId}` },
      { method: 'GET', path: `/skills/${skillId}/resources` },
      { method: 'POST', path: '/skills/resources' },
      { method: 'PUT', path: `/skills/resources/${resourceId}` },
      { method: 'DELETE', path: `/skills/resources/${resourceId}` },
      { method: 'GET', path: `/skills/${skillId}/related` },
      { method: 'POST', path: '/skills/relationships' },
      { method: 'DELETE', path: `/skills/relationships/${skillId}/${skillId2}` },
      { method: 'GET', path: '/skills/recommendations' },
    ];

    for (const testCase of cases) {
      test(`${testCase.method} ${testCase.path} returns 401`, async () => {
        const anonApp = createAnonApp();
        const res = await anonApp.request(testCase.path, { method: testCase.method });
        expect(res.status).toBe(401);
        const body = (await res.json()) as any;
        expect(body.error.code).toBe('UNAUTHORIZED');
      });
    }
  });

  describe('Skills Catalog', () => {
    test('GET /skills returns skills list', async () => {
      const authApp = createAuthedApp();
      const mockGetAllSkills = mock(() => Promise.resolve([{ id: skillId, name: 'TypeScript' }]));
      skillsInterestsService.getAllSkills = mockGetAllSkills as any;

      const res = await authApp.request('/skills');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(mockGetAllSkills).toHaveBeenCalledWith({ category: undefined, difficulty: undefined, search: undefined });
    });

    test('GET /skills/:id returns 404 when missing', async () => {
      const authApp = createAuthedApp();
      const mockGetSkillById = mock(() => Promise.resolve(null));
      skillsInterestsService.getSkillById = mockGetSkillById as any;

      const res = await authApp.request(`/skills/${skillId}`);
      expect(res.status).toBe(404);
    });

    test('POST /skills creates skill', async () => {
      const authApp = createAuthedApp();
      const payload = { name: 'TypeScript', category: 'programming' };
      const mockCreateSkill = mock(() => Promise.resolve({ id: skillId, ...payload }));
      skillsInterestsService.createSkill = mockCreateSkill as any;

      const res = await authApp.request('/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data.id).toBe(skillId);
      expect(mockCreateSkill).toHaveBeenCalledWith(payload);
    });

    test('PUT /skills/:id updates skill', async () => {
      const authApp = createAuthedApp();
      const payload = { description: 'Updated' };
      const mockUpdateSkill = mock(() => Promise.resolve({ id: skillId, ...payload }));
      skillsInterestsService.updateSkill = mockUpdateSkill as any;

      const res = await authApp.request(`/skills/${skillId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(200);
      expect(mockUpdateSkill).toHaveBeenCalledWith(skillId, payload);
    });

    test('DELETE /skills/:id deletes skill', async () => {
      const authApp = createAuthedApp();
      const mockDeleteSkill = mock(() => Promise.resolve());
      skillsInterestsService.deleteSkill = mockDeleteSkill as any;

      const res = await authApp.request(`/skills/${skillId}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(mockDeleteSkill).toHaveBeenCalledWith(skillId);
    });
  });

  describe('Skill Plans & Tasks', () => {
    test('POST /skills/my-skills/add-interest creates plan', async () => {
      const authApp = createAuthedApp();
      const payload = { interest: 'Web Development', status: 'learning' };
      const mockAdd = mock(() =>
        Promise.resolve({
          skill: { id: skillId, name: 'Web Development' },
          userSkill: { id: 'us-1' },
          plan: { id: 'plan-1' },
          tasks: [{ id: taskId, title: 'Learn HTML' }],
        })
      );
      skillsInterestsService.addInterestWithPlan = mockAdd as any;

      const res = await authApp.request('/skills/my-skills/add-interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(mockAdd).toHaveBeenCalledWith(mockUser.id, payload);
    });

    test('GET /skills/my-skills/:skillInterestId/plan returns plan', async () => {
      const authApp = createAuthedApp();
      const mockGet = mock(() =>
        Promise.resolve({
          plan: { id: 'plan-1' },
          tasks: [{ id: taskId }],
        })
      );
      skillsInterestsService.getSkillPlan = mockGet as any;

      const res = await authApp.request(`/skills/my-skills/${skillId}/plan`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(mockGet).toHaveBeenCalledWith(mockUser.id, skillId);
    });

    test('PATCH /skills/my-skills/tasks/:taskId updates task', async () => {
      const authApp = createAuthedApp();
      const payload = { status: 'completed' };
      const mockUpdate = mock(() => Promise.resolve({ id: taskId, status: 'completed' }));
      skillsInterestsService.updateSkillTask = mockUpdate as any;

      const res = await authApp.request(`/skills/my-skills/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(mockUser.id, taskId, payload);
    });

    test('POST /skills/my-skills/tasks/:taskId/schedule adds schedule item', async () => {
      const authApp = createAuthedApp();
      const payload = {
        scheduleId: '55555555-5555-5555-5555-555555555555',
        startDateTime: new Date().toISOString(),
        endDateTime: new Date(Date.now() + 3600000).toISOString(),
      };
      const mockAdd = mock(() => Promise.resolve({ id: 'sched-item-1' }));
      skillsInterestsService.addSkillTaskToSchedule = mockAdd as any;

      const res = await authApp.request(`/skills/my-skills/tasks/${taskId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(mockAdd).toHaveBeenCalledWith(mockUser.id, taskId, payload);
    });
  });

  describe('User Skills', () => {
    test('GET /skills/my-skills returns user skills', async () => {
      const authApp = createAuthedApp();
      const mockGetUserSkills = mock(() => Promise.resolve([{ id: 'us1' }]));
      skillsInterestsService.getUserSkills = mockGetUserSkills as any;

      const res = await authApp.request('/skills/my-skills');
      expect(res.status).toBe(200);
      expect(mockGetUserSkills).toHaveBeenCalledWith(mockUser.id, undefined);
    });

    test('GET /skills/my-skills/stats returns stats', async () => {
      const authApp = createAuthedApp();
      const mockGetUserStats = mock(() => Promise.resolve({ totalSkills: 3 }));
      skillsInterestsService.getUserStats = mockGetUserStats as any;

      const res = await authApp.request('/skills/my-skills/stats');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data.totalSkills).toBe(3);
      expect(mockGetUserStats).toHaveBeenCalledWith(mockUser.id);
    });

    test('POST /skills/my-skills adds user skill', async () => {
      const authApp = createAuthedApp();
      const payload = { skillInterestId: skillId, status: 'learning' };
      const mockAddSkill = mock(() => Promise.resolve({ id: 'user-skill-1' }));
      skillsInterestsService.addSkillToUser = mockAddSkill as any;

      const res = await authApp.request('/skills/my-skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(200);
      expect(mockAddSkill).toHaveBeenCalledWith(mockUser.id, skillId, 'learning');
    });

    test('PATCH /skills/my-skills/:id updates user skill', async () => {
      const authApp = createAuthedApp();
      const payload = { status: 'completed', progress: 100 };
      const mockUpdateSkill = mock(() => Promise.resolve({ id: 'user-skill-1' }));
      skillsInterestsService.updateUserSkill = mockUpdateSkill as any;

      const res = await authApp.request(`/skills/my-skills/${skillId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(200);
      expect(mockUpdateSkill).toHaveBeenCalledWith(mockUser.id, skillId, payload);
    });

    test('DELETE /skills/my-skills/:id removes user skill', async () => {
      const authApp = createAuthedApp();
      const mockRemoveSkill = mock(() => Promise.resolve());
      skillsInterestsService.removeSkillFromUser = mockRemoveSkill as any;

      const res = await authApp.request(`/skills/my-skills/${skillId}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(mockRemoveSkill).toHaveBeenCalledWith(mockUser.id, skillId);
    });
  });

  describe('Resources', () => {
    test('GET /skills/:id/resources returns resources', async () => {
      const authApp = createAuthedApp();
      const mockGetResources = mock(() => Promise.resolve([{ id: resourceId }]));
      skillsInterestsService.getSkillResources = mockGetResources as any;

      const res = await authApp.request(`/skills/${skillId}/resources`);
      expect(res.status).toBe(200);
      expect(mockGetResources).toHaveBeenCalledWith(skillId);
    });

    test('POST /skills/resources adds resource', async () => {
      const authApp = createAuthedApp();
      const payload = { skillInterestId: skillId, title: 'Doc', type: 'documentation' };
      const mockAddResource = mock(() => Promise.resolve({ id: resourceId }));
      skillsInterestsService.addResource = mockAddResource as any;

      const res = await authApp.request('/skills/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(200);
      expect(mockAddResource).toHaveBeenCalledWith({ ...payload, userId: mockUser.id });
    });

    test('PUT /skills/resources/:id updates resource', async () => {
      const authApp = createAuthedApp();
      const payload = { title: 'Updated', type: 'article' };
      const mockUpdateResource = mock(() => Promise.resolve({ id: resourceId }));
      skillsInterestsService.updateResource = mockUpdateResource as any;

      const res = await authApp.request(`/skills/resources/${resourceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(200);
      expect(mockUpdateResource).toHaveBeenCalledWith(resourceId, payload);
    });

    test('DELETE /skills/resources/:id deletes resource', async () => {
      const authApp = createAuthedApp();
      const mockDeleteResource = mock(() => Promise.resolve());
      skillsInterestsService.deleteResource = mockDeleteResource as any;

      const res = await authApp.request(`/skills/resources/${resourceId}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(mockDeleteResource).toHaveBeenCalledWith(resourceId);
    });
  });

  describe('Relationships & Recommendations', () => {
    test('GET /skills/:id/related returns related skills', async () => {
      const authApp = createAuthedApp();
      const mockGetRelated = mock(() => Promise.resolve([{ id: skillId2 }]));
      skillsInterestsService.getRelatedSkills = mockGetRelated as any;

      const res = await authApp.request(`/skills/${skillId}/related`);
      expect(res.status).toBe(200);
      expect(mockGetRelated).toHaveBeenCalledWith(skillId);
    });

    test('POST /skills/relationships creates relationship', async () => {
      const authApp = createAuthedApp();
      const payload = { fromSkillId: skillId, toSkillId: skillId2, relationshipType: 'related' };
      const mockAddRel = mock(() => Promise.resolve({ id: 'rel-1' }));
      skillsInterestsService.addSkillRelationship = mockAddRel as any;

      const res = await authApp.request('/skills/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(200);
      expect(mockAddRel).toHaveBeenCalledWith(payload);
    });

    test('DELETE /skills/relationships/:from/:to deletes relationship', async () => {
      const authApp = createAuthedApp();
      const mockDeleteRel = mock(() => Promise.resolve());
      skillsInterestsService.deleteSkillRelationship = mockDeleteRel as any;

      const res = await authApp.request(`/skills/relationships/${skillId}/${skillId2}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(mockDeleteRel).toHaveBeenCalledWith(skillId, skillId2);
    });

    test('GET /skills/recommendations returns recommendations', async () => {
      const authApp = createAuthedApp();
      const mockGetRecs = mock(() => Promise.resolve([{ id: skillId2 }]));
      skillsInterestsService.getRecommendations = mockGetRecs as any;

      const res = await authApp.request('/skills/recommendations');
      expect(res.status).toBe(200);
      expect(mockGetRecs).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('Validation', () => {
    test('POST /skills/my-skills rejects invalid payload', async () => {
      const authApp = createAuthedApp();
      const res = await authApp.request('/skills/my-skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillInterestId: 'not-a-uuid' }),
      });
      expect(res.status).toBe(400);
    });
  });
});
