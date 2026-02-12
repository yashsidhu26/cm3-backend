/**
 * StudyDeck Routes
 * REST API endpoints for StudyDeck integration
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { protect } from '../../core/middleware/auth';
import { studydeckService } from './studydeck.service';
import {
  studydeckTokenSchema,
  courseIdSchema,
  folderIdSchema,
  searchResourcesSchema,
} from './studydeck.schema';
import { successResponse, errorResponse } from '../../core/utils/response';

const studydeckRoutes = new Hono();

/**
 * POST /api/studydeck/token
 * Save/Update StudyDeck JWT token for the authenticated user
 */
studydeckRoutes.post('/token', protect, zValidator('json', studydeckTokenSchema), async (c) => {
  try {
    const user = c.get('user');
    const { jwtToken } = c.req.valid('json');

    await studydeckService.saveUserToken(user.id, jwtToken);

    return successResponse(c, { message: 'StudyDeck token saved successfully' });
  } catch (error: any) {
    console.error('[StudyDeck] Error saving token:', error);
    return errorResponse(c, 'Failed to save StudyDeck token', 500);
  }
});

/**
 * GET /api/studydeck/folders/:courseStaticId
 * Get folders for a specific course
 */
studydeckRoutes.get('/folders/:courseStaticId', protect, async (c) => {
  try {
    const user = c.get('user');
    const courseStaticId = c.req.param('courseStaticId');

    const jwtToken = await studydeckService.getUserToken(user.id);
    if (!jwtToken) {
      return errorResponse(
        c,
        'StudyDeck token not found. Please authenticate with StudyDeck first.',
        401
      );
    }

    const folders = await studydeckService.getCourseFolders(courseStaticId, jwtToken);

    return successResponse(c, {
      courseStaticId,
      folders,
      count: folders.length,
    });
  } catch (error: any) {
    console.error('[StudyDeck] Error fetching folders:', error);
    return errorResponse(c, 'Failed to fetch course folders', 500);
  }
});

/**
 * GET /api/studydeck/documents/:folderStaticId
 * Get documents from a specific folder
 */
studydeckRoutes.get('/documents/:folderStaticId', protect, async (c) => {
  try {
    const user = c.get('user');
    const folderStaticId = c.req.param('folderStaticId');

    const jwtToken = await studydeckService.getUserToken(user.id);
    if (!jwtToken) {
      return errorResponse(
        c,
        'StudyDeck token not found. Please authenticate with StudyDeck first.',
        401
      );
    }

    const documents = await studydeckService.getFolderDocuments(folderStaticId, jwtToken);

    return successResponse(c, {
      folderStaticId,
      documents,
      count: documents.length,
    });
  } catch (error: any) {
    console.error('[StudyDeck] Error fetching documents:', error);
    return errorResponse(c, 'Failed to fetch folder documents', 500);
  }
});

/**
 * POST /api/studydeck/search
 * Search for resources by course code and type
 */
studydeckRoutes.post('/search', protect, zValidator('json', searchResourcesSchema), async (c) => {
  try {
    const user = c.get('user');
    const { courseCode, resourceType, limit } = c.req.valid('json');

    const jwtToken = await studydeckService.getUserToken(user.id);
    if (!jwtToken) {
      return errorResponse(
        c,
        'StudyDeck token not found. Please authenticate with StudyDeck first.',
        401
      );
    }

    const results = await studydeckService.searchResources(
      courseCode,
      resourceType as any,
      jwtToken,
      limit
    );

    return successResponse(c, {
      courseCode,
      resourceType,
      ...results,
    });
  } catch (error: any) {
    console.error('[StudyDeck] Error searching resources:', error);
    return errorResponse(c, 'Failed to search resources', 500);
  }
});

/**
 * GET /api/studydeck/status
 * Check if user has StudyDeck token configured
 */
studydeckRoutes.get('/status', protect, async (c) => {
  try {
    const user = c.get('user');
    const jwtToken = await studydeckService.getUserToken(user.id);

    return successResponse(c, {
      connected: !!jwtToken,
      message: jwtToken
        ? 'StudyDeck is connected'
        : 'StudyDeck token not configured. Please authenticate.',
    });
  } catch (error: any) {
    console.error('[StudyDeck] Error checking status:', error);
    return errorResponse(c, 'Failed to check StudyDeck status', 500);
  }
});

export default studydeckRoutes;
