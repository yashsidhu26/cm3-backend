import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { Hono } from 'hono';
import academicsRoutes from './academics.routes';
import { academicsService } from './academics.service';

const mockUser = { id: 'user-123', email: 'test@example.com', name: 'Test User' };
const courseId = '11111111-1111-1111-1111-111111111111';

function createAuthedApp() {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('user', mockUser as any);
    await next();
  });
  app.route('/academics', academicsRoutes);
  return app;
}

function createAnonApp() {
  const app = new Hono();
  app.route('/academics', academicsRoutes);
  return app;
}

describe('academics progress routes', () => {
  const originalMethods = {
    getUserCourseProgress: academicsService.getUserCourseProgress.bind(academicsService),
    updateUserCourseProgress: academicsService.updateUserCourseProgress.bind(academicsService),
  };

  beforeEach(() => {
    Object.assign(academicsService, originalMethods);
  });

  describe('Authentication Requirements', () => {
    const cases = [
      { method: 'GET', path: '/academics/progress' },
      { method: 'PUT', path: `/academics/progress/${courseId}` },
    ];

    for (const testCase of cases) {
      test(`${testCase.method} ${testCase.path} returns 401`, async () => {
        const anonApp = createAnonApp();
        const res = await anonApp.request(testCase.path, { method: testCase.method });
        expect(res.status).toBe(401);
      });
    }
  });

  test('GET /academics/progress returns course progress', async () => {
    const authApp = createAuthedApp();
    const mockGetProgress = mock(() => Promise.resolve([
      {
        course: { id: courseId, code: 'CS F111', name: 'Computer Programming' },
        enrollment: { semester: 'fall', year: '2025' },
        progress: { status: 'in_progress', progress: 40 },
      },
    ]));
    academicsService.getUserCourseProgress = mockGetProgress as any;

    const res = await authApp.request('/academics/progress');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.courses).toHaveLength(1);
    expect(mockGetProgress).toHaveBeenCalledWith(mockUser.id, undefined);
  });

  test('PUT /academics/progress/:courseId updates progress', async () => {
    const authApp = createAuthedApp();
    const payload = { status: 'completed', progress: 100 };
    const mockUpdate = mock(() => Promise.resolve({ id: 'progress-1', ...payload }));
    academicsService.updateUserCourseProgress = mockUpdate as any;

    const res = await authApp.request(`/academics/progress/${courseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(mockUser.id, courseId, expect.objectContaining(payload));
  });

  test('PUT /academics/progress/:courseId returns 400 for invalid courseId', async () => {
    const authApp = createAuthedApp();
    const res = await authApp.request('/academics/progress/not-a-uuid', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ progress: 10 }),
    });

    expect(res.status).toBe(400);
  });
});
