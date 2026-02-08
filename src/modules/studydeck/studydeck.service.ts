/**
 * StudyDeck Service
 * Handles all StudyDeck API interactions
 */

import { db } from '../../core/database/client';
import { studydeckTokens } from './studydeck.schema';
import { eq } from 'drizzle-orm';
import { encrypt, decrypt } from '../../core/utils/encryption';

const STUDYDECK_BASE_URL = 'https://studydeck.bits-sutechteam.org/back/studyzone';

interface StudyDeckFolder {
  static_id: string;
  name: string;
  uploaded_by: string;
  doc_types: string[];
  is_bookmarked?: boolean;
}

interface StudyDeckDocument {
  static_id: string;
  uploaded_at: string;
  file: string;
  name: string;
  doc_type: string;
}

interface ParsedFolder {
  folderId: string;
  name: string;
  uploadedBy: string;
  types: string;
}

interface ParsedDocument {
  name: string;
  downloadUrl: string;
  uploadedAt: string;
  docType: string;
}

class StudyDeckService {
  /**
   * Get StudyDeck JWT token for a user
   */
  async getUserToken(userId: string): Promise<string | null> {
    const [tokenRecord] = await db
      .select()
      .from(studydeckTokens)
      .where(eq(studydeckTokens.userId, userId))
      .limit(1);

    if (!tokenRecord) return null;

    // Decrypt the JWT token
    return decrypt(tokenRecord.encryptedToken);
  }

  /**
   * Save/Update StudyDeck JWT token for a user
   */
  async saveUserToken(userId: string, jwtToken: string): Promise<void> {
    const encryptedToken = encrypt(jwtToken);

    const existing = await db
      .select()
      .from(studydeckTokens)
      .where(eq(studydeckTokens.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      // Update existing token
      await db
        .update(studydeckTokens)
        .set({ encryptedToken, updatedAt: new Date() })
        .where(eq(studydeckTokens.userId, userId));
    } else {
      // Insert new token
      await db.insert(studydeckTokens).values({
        userId,
        encryptedToken,
      });
    }
  }

  /**
   * Get list of folders for a specific course
   */
  async getCourseFolders(courseStaticId: string, jwtToken: string): Promise<ParsedFolder[]> {
    const url = `${STUDYDECK_BASE_URL}/folder/?course_static_id=${courseStaticId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Host: 'studydeck.bits-sutechteam.org',
        Cookie: `jwt=${jwtToken}`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        Referer: 'https://studydeck.bits-sutechteam.org/resources',
        Accept: 'application/json, text/plain, */*',
      },
    });

    if (!response.ok) {
      throw new Error(`StudyDeck API error: ${response.status} ${response.statusText}`);
    }

    const folders: StudyDeckFolder[] = (await response.json()) as any;

    // Parse folders into clean format
    return folders.map((folder) => ({
      folderId: folder.static_id,
      name: folder.name || 'Untitled Folder', // Default for empty names
      uploadedBy: folder.uploaded_by,
      types: folder.doc_types.join(', '), // Convert array to comma-separated string
    }));
  }

  /**
   * Get documents from a specific folder
   */
  async getFolderDocuments(
    folderStaticId: string,
    jwtToken: string
  ): Promise<ParsedDocument[]> {
    const url = `${STUDYDECK_BASE_URL}/document/?folder_static_id=${folderStaticId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Host: 'studydeck.bits-sutechteam.org',
        Cookie: `jwt=${jwtToken}`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        Referer: 'https://studydeck.bits-sutechteam.org/resources',
        Accept: 'application/json, text/plain, */*',
      },
    });

    if (!response.ok) {
      throw new Error(`StudyDeck API error: ${response.status} ${response.statusText}`);
    }

    const documents: StudyDeckDocument[] = (await response.json()) as any;

    // Parse documents into clean format
    return documents.map((doc) => ({
      name: doc.name,
      downloadUrl: doc.file,
      uploadedAt: this.formatDate(doc.uploaded_at),
      docType: doc.doc_type,
    }));
  }

  /**
   * Search for resources by course code and type
   * This combines folder and document fetching
   */
  async searchResources(
    courseCode: string,
    resourceType: 'slides' | 'papers' | 'notes' | 'all',
    jwtToken: string,
    limit: number = 20
  ): Promise<{
    folders: ParsedFolder[];
    documents: ParsedDocument[];
  }> {
    // First, we need to map course code to courseStaticId
    // For now, we'll need to get this from the academics service
    // This is a simplified version - you may need to enhance this
    const courseStaticId = await this.getCourseStaticId(courseCode);

    if (!courseStaticId) {
      return { folders: [], documents: [] };
    }

    // Get folders for the course
    const folders = await this.getCourseFolders(courseStaticId, jwtToken);

    // Filter folders by resource type if specified
    let filteredFolders = folders;
    if (resourceType !== 'all') {
      const typeMap = {
        slides: 'Slide',
        papers: 'Paper',
        notes: 'Note',
      };
      const targetType = typeMap[resourceType];
      filteredFolders = folders.filter((f) => f.types.includes(targetType));
    }

    // Limit results
    filteredFolders = filteredFolders.slice(0, limit);

    // Get documents from the first few folders
    const documents: ParsedDocument[] = [];
    for (const folder of filteredFolders.slice(0, 5)) {
      try {
        const docs = await this.getFolderDocuments(folder.folderId, jwtToken);
        documents.push(...docs);
      } catch (error) {
        console.error(`Error fetching documents from folder ${folder.folderId}:`, error);
      }
    }

    return {
      folders: filteredFolders,
      documents: documents.slice(0, limit),
    };
  }

  /**
   * Helper: Format date to DD/MM/YYYY
   */
  private formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch (error) {
      return dateString;
    }
  }

  /**
   * Helper: Get course static ID from course code
   * Queries the courses table to get the StudyDeck static ID
   */
  private async getCourseStaticId(courseCode: string): Promise<string | null> {
    try {
      const { db } = await import('../../core/database/client');
      const { courses } = await import('../academics/academics.schema');
      const { eq } = await import('drizzle-orm');

      // Query courses table for the staticId
      const [course] = await db
        .select({ staticId: courses.staticId })
        .from(courses)
        .where(eq(courses.code, courseCode))
        .limit(1);

      if (!course || !course.staticId) {
        console.warn(`[StudyDeck] No static ID found for course: ${courseCode}`);
        return null;
      }

      return course.staticId;
    } catch (error) {
      console.error(`[StudyDeck] Error getting static ID for ${courseCode}:`, error);
      return null;
    }
  }
}

export const studydeckService = new StudyDeckService();
