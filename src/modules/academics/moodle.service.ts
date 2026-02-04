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
    this.baseUrl = baseUrl || process.env.MOODLE_BASE_URL || 'https://cms.bits-pilani.ac.in';
  }

  /**
   * Authenticate with Moodle and retrieve access token
   * 
   * @param username - Moodle username (BITS ID)
   * @param password - Moodle password
   * @returns Authentication token and user ID
   * 
   * NOTE: This is a placeholder implementation.
   * In production, you'll need to:
   * 1. Use the actual Moodle web service endpoint (e.g., /login/token.php)
   * 2. Handle proper error codes from Moodle
   * 3. Implement token refresh logic
   */
  async authenticate(username: string, password: string): Promise<MoodleAuthResponse> {
    try {
      console.log(`[Moodle] Authenticating user: ${username}`);

      // Placeholder: Replace with actual Moodle authentication
      const response = await fetch(`${this.baseUrl}/login/token.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          username,
          password,
          service: 'moodle_mobile_app', // Moodle web service name
        }),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new MoodleError(
            'Invalid Moodle credentials',
            'INVALID_CREDENTIALS',
            401
          );
        }
        throw new MoodleError(
          'Failed to authenticate with Moodle',
          'AUTH_FAILED',
          response.status
        );
      }

      const data = await response.json();

      // Moodle returns error in response body even with 200 status
      if (data.error) {
        throw new MoodleError(
          data.error,
          'MOODLE_API_ERROR',
          401
        );
      }

      // Mock response for development
      // TODO: Remove this when implementing actual Moodle integration
      const mockResponse: MoodleAuthResponse = {
        token: data.token || 'mock_token_' + Date.now(),
        userId: data.userid || username,
      };

      console.log('[Moodle] Authentication successful');
      return mockResponse;

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
   * NOTE: This is a placeholder implementation.
   * In production, you'll need to:
   * 1. Use core_enrol_get_users_courses web service function
   * 2. Parse actual Moodle response structure
   * 3. Handle pagination if user has many courses
   */
  async fetchCourses(token: string): Promise<MoodleCourse[]> {
    try {
      console.log('[Moodle] Fetching courses');

      // Placeholder: Replace with actual Moodle API call
      const response = await fetch(
        `${this.baseUrl}/webservice/rest/server.php?` +
        new URLSearchParams({
          wstoken: token,
          wsfunction: 'core_enrol_get_users_courses',
          moodlewsrestformat: 'json',
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

      const data = await response.json();

      // Check for Moodle API errors
      if (data.exception) {
        throw new MoodleError(
          data.message || 'Moodle API error',
          'MOODLE_API_ERROR',
          400
        );
      }

      // Mock courses for development
      // TODO: Remove this when implementing actual Moodle integration
      const mockCourses: MoodleCourse[] = [
        {
          id: 'moodle_101',
          shortname: 'CS F111',
          fullname: 'Computer Programming',
          summary: 'Introduction to programming using Python',
          teachers: ['Dr. John Doe'],
        },
        {
          id: 'moodle_102',
          shortname: 'MATH F112',
          fullname: 'Mathematics II',
          summary: 'Calculus and Linear Algebra',
          teachers: ['Dr. Jane Smith'],
        },
        {
          id: 'moodle_103',
          shortname: 'PHY F111',
          fullname: 'Mechanics',
          summary: 'Classical mechanics and thermodynamics',
          teachers: ['Dr. Robert Brown'],
        },
      ];

      console.log(`[Moodle] Fetched ${mockCourses.length} courses`);
      return mockCourses;

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
   * NOTE: This is a placeholder implementation.
   * In production, use core_course_get_contents web service function
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

      const data = await response.json();

      if (data.exception) {
        throw new MoodleError(
          data.message || 'Moodle API error',
          'MOODLE_API_ERROR',
          400
        );
      }

      // Mock resources for development
      const mockResources: MoodleResource[] = [
        {
          id: `res_${courseId}_1`,
          name: 'Lecture 1 - Introduction.pdf',
          type: 'pdf',
          url: `${this.baseUrl}/mod/resource/view.php?id=12345`,
          filesize: 2048576, // 2MB
          uploadedby: 'Dr. John Doe',
        },
        {
          id: `res_${courseId}_2`,
          name: 'Week 2 Slides.pptx',
          type: 'slide',
          url: `${this.baseUrl}/mod/resource/view.php?id=12346`,
          filesize: 5242880, // 5MB
        },
      ];

      console.log(`[Moodle] Fetched ${mockResources.length} resources`);
      return mockResources;

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
   * Validate Moodle token
   * Checks if the token is still valid
   */
  async validateToken(token: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/webservice/rest/server.php?` +
        new URLSearchParams({
          wstoken: token,
          wsfunction: 'core_webservice_get_site_info',
          moodlewsrestformat: 'json',
        }),
        {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        }
      );

      if (!response.ok) return false;

      const data = await response.json();
      return !data.exception;

    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const moodleClient = new MoodleClient();
