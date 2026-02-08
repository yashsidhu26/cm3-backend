/**
 * Moodle Service
 * Handles integration with Moodle LMS API
 * 
 * This service provides methods to authenticate with Moodle
 * and fetch course data for synchronization.
 */

/**
 * Moodle API Response Types
 */
export interface MoodleAuthResponse {
  token: string;
  userId: string;
}

export interface MoodleSiteInfo {
  sitename: string;
  username: string;
  firstname: string;
  lastname: string;
  fullname: string;
  lang: string;
  userid: number;
  siteurl: string;
  userpictureurl: string;
  useremail?: string;
}

export interface MoodleCourse {
  id: string;
  shortname: string; // Course code (e.g., "CS F111")
  fullname: string; // Course name
  summary?: string; // Course description
  teachers?: string[]; // List of professor names
}

export interface MoodleResource {
  id: string;
  name: string;
  type: 'pdf' | 'slide' | 'video' | 'link' | 'assignment' | 'other';
  url: string;
  filesize?: number;
  uploadedby?: string;
}

/**
 * Custom Moodle Errors
 */
export class MoodleError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'MoodleError';
  }
}

/**
 * Moodle Client
 * Handles all communication with Moodle LMS
 */
export class MoodleClient {
  private baseUrl: string;
  private timeout: number = 30000; // 30 seconds

  constructor(baseUrl?: string) {
    // Use environment variable or default to BITS Pilani Moodle
    this.baseUrl = baseUrl || process.env.MOODLE_BASE_URL || 'https://nalanda.bits-pilani.ac.in';
  }

  /**
   * Authenticate with Moodle and retrieve access token
   * 
   * @param username - Moodle username (BITS ID)
   * @param password - Moodle password
   * @returns Authentication token and user ID
   * 
   */
  async authenticate(username: string, password: string): Promise<MoodleAuthResponse> {
    try {
      console.log(`[Moodle] Authenticating user: ${username}`);

      const response = await fetch(`${this.baseUrl}/login/token.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          username,
          password,
          service: 'moodle_mobile_app',
        }),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new MoodleError(
          'Failed to authenticate with Moodle',
          'AUTH_FAILED',
          response.status
        );
      }

      const data = await response.json() as any;

      // Moodle returns error in response body even with 200 status
      if (data.error) {
        if (data.errorcode === 'invalidlogin') {
          throw new MoodleError(
            'Invalid username or password',
            'INVALID_CREDENTIALS',
            401
          );
        }
        throw new MoodleError(
          data.error,
          'MOODLE_API_ERROR',
          400
        );
      }

      console.log('[Moodle] Authentication successful');

      // We don't get the user ID in the token response, only the token
      // We need to make another call to get site info to get the user ID
      const siteInfo = await this.getSiteInfo(data.token);

      return {
        token: data.token,
        userId: siteInfo.userid.toString(),
      };

    } catch (error: any) {
      if (error instanceof MoodleError) {
        throw error;
      }

      // Handle network errors
      if (error.name === 'AbortError') {
        throw new MoodleError(
          'Moodle request timed out',
          'TIMEOUT',
          408
        );
      }

      throw new MoodleError(
        `Moodle authentication failed: ${error.message}`,
        'NETWORK_ERROR',
        500
      );
    }
  }

  /**
   * Fetch all courses for authenticated user
   * 
   * @param token - Moodle authentication token
   * @returns List of enrolled courses
   * 
   */
  async fetchCourses(token: string, userId: string): Promise<MoodleCourse[]> {
    try {
      console.log(`[Moodle] Fetching courses for user: ${userId}`);

      const response = await fetch(
        `${this.baseUrl}/webservice/rest/server.php?` +
        new URLSearchParams({
          wstoken: token,
          wsfunction: 'core_enrol_get_users_courses',
          moodlewsrestformat: 'json',
          userid: userId,
        }),
        {
          method: 'GET',
          signal: AbortSignal.timeout(this.timeout),
        }
      );

      if (!response.ok) {
        throw new MoodleError(
          'Failed to fetch courses from Moodle',
          'FETCH_FAILED',
          response.status
        );
      }

      const data = await response.json() as any;

      // Check for Moodle API errors
      if (data.exception) {
        throw new MoodleError(
          data.message || 'Moodle API error',
          'MOODLE_API_ERROR',
          400
        );
      }

      // Parse real Moodle response: array of course objects
      const courses: MoodleCourse[] = (Array.isArray(data) ? data : []).map((course: any) => ({
        id: String(course.id),
        shortname: course.shortname || '',
        fullname: course.fullname || '',
        summary: course.summary ? course.summary.replace(/<[^>]*>/g, '').trim() : undefined,
      }));

      console.log(`[Moodle] Fetched ${courses.length} courses`);
      return courses;

    } catch (error: any) {
      if (error instanceof MoodleError) {
        throw error;
      }

      if (error.name === 'AbortError') {
        throw new MoodleError(
          'Moodle request timed out',
          'TIMEOUT',
          408
        );
      }

      throw new MoodleError(
        `Failed to fetch courses: ${error.message}`,
        'NETWORK_ERROR',
        500
      );
    }
  }

  /**
   * Fetch resources for a specific course
   * 
   * @param token - Moodle authentication token
   * @param courseId - Moodle course ID
   * @returns List of course resources
   * 
   */
  async fetchCourseResources(token: string, courseId: string): Promise<MoodleResource[]> {
    try {
      console.log(`[Moodle] Fetching resources for course: ${courseId}`);

      const response = await fetch(
        `${this.baseUrl}/webservice/rest/server.php?` +
        new URLSearchParams({
          wstoken: token,
          wsfunction: 'core_course_get_contents',
          courseid: courseId,
          moodlewsrestformat: 'json',
        }),
        {
          method: 'GET',
          signal: AbortSignal.timeout(this.timeout),
        }
      );

      if (!response.ok) {
        throw new MoodleError(
          'Failed to fetch course resources',
          'FETCH_FAILED',
          response.status
        );
      }

      const data = await response.json() as any;

      if (data.exception) {
        throw new MoodleError(
          data.message || 'Moodle API error',
          'MOODLE_API_ERROR',
          400
        );
      }

      // Parse real Moodle response: array of sections, each with modules[], each module with contents[]
      const resources: MoodleResource[] = [];
      const sections = Array.isArray(data) ? data : [];

      for (const section of sections) {
        const modules = Array.isArray(section.modules) ? section.modules : [];
        for (const mod of modules) {
          const contents = Array.isArray(mod.contents) ? mod.contents : [];
          if (contents.length > 0) {
            // Module has file contents — create a resource per content file
            for (const content of contents) {
              const fileurl = content.fileurl
                ? `${content.fileurl}${content.fileurl.includes('?') ? '&' : '?'}token=${token}`
                : '';
              resources.push({
                id: String(mod.id),
                name: content.filename || mod.name || 'Unnamed',
                type: this.mapResourceType(mod.modname, content.mimetype),
                url: fileurl,
                filesize: content.filesize || undefined,
              });
            }
          } else if (mod.url) {
            // Module without file contents (e.g., assignment, URL, forum)
            resources.push({
              id: String(mod.id),
              name: mod.name || 'Unnamed',
              type: this.mapResourceType(mod.modname),
              url: mod.url,
            });
          }
        }
      }

      console.log(`[Moodle] Fetched ${resources.length} resources`);
      return resources;

    } catch (error: any) {
      if (error instanceof MoodleError) {
        throw error;
      }

      throw new MoodleError(
        `Failed to fetch resources: ${error.message}`,
        'NETWORK_ERROR',
        500
      );
    }
  }

  /**
   * Map Moodle module name and mimetype to our resource type enum
   */
  private mapResourceType(modname?: string, mimetype?: string): MoodleResource['type'] {
    if (mimetype) {
      if (mimetype === 'application/pdf') return 'pdf';
      if (mimetype.includes('presentation') || mimetype.includes('powerpoint')) return 'slide';
      if (mimetype.startsWith('video/')) return 'video';
    }
    if (modname) {
      if (modname === 'assign') return 'assignment';
      if (modname === 'url') return 'link';
      if (modname === 'resource' || modname === 'folder') return 'other';
    }
    return 'other';
  }

  /**
   * Get site info to retrieve user ID
   */
  async getSiteInfo(token: string): Promise<MoodleSiteInfo> {
    const response = await fetch(
      `${this.baseUrl}/webservice/rest/server.php?` +
      new URLSearchParams({
        wstoken: token,
        wsfunction: 'core_webservice_get_site_info',
        moodlewsrestformat: 'json',
      }),
      {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeout),
      }
    );

    if (!response.ok) {
      throw new MoodleError('Failed to get site info', 'SITE_INFO_FAILED', response.status);
    }

    const data = await response.json() as any;
    if (data.exception) {
      throw new MoodleError(data.message, 'MOODLE_API_ERROR', 400);
    }

    return data as MoodleSiteInfo;
  }

  /**
   * Fetch notifications from Moodle works
   */
  async fetchNotifications(token: string, userId: string): Promise<any[]> {
    try {
      // Fetch popup notifications
      const response = await fetch(
        `${this.baseUrl}/webservice/rest/server.php?` +
        new URLSearchParams({
          wstoken: token,
          wsfunction: 'message_popup_get_popup_notifications',
          moodlewsrestformat: 'json',
          useridto: userId,
        }),
        {
          method: 'GET',
          signal: AbortSignal.timeout(this.timeout),
        }
      );

      if (!response.ok) return [];

      const data = await response.json() as any;
      if (data.exception) return [];

      return data.notifications || [];

    } catch (error) {
      console.error('[Moodle] Failed to fetch notifications:', error);
      return [];
    }
  }

  /**
   * Validate Moodle token
   * Checks if the token is still valid
   */
  async validateToken(token: string): Promise<boolean> {
    try {
      await this.getSiteInfo(token);
      return true;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const moodleClient = new MoodleClient();
