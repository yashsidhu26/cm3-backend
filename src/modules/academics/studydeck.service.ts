/**
 * StudyDeck Service
 * Handles integration with StudyDeck API for fetching course sections and schedules
 */

export interface StudyDeckClassTiming {
  day: string;
  starttime: string;
  endtime: string;
}

export interface StudyDeckSection {
  type: string;
  section_number: number;
  teachers: string[];
  room_no: string;
  classes: StudyDeckClassTiming[];
}

export interface ParsedSection {
  sectionType: string;
  sectionNumber: number;
  instructors: string[];
  roomNumber: string;
  schedule: string[]; // Formatted strings like "Monday 09:00-09:50"
}

export interface ParsedSectionDetail {
  sectionType: string;
  sectionNumber: number;
  instructors: string[];
  roomNumber: string;
  timings: {
    dayOfWeek: string;
    startTime: string; // HH:MM format
    endTime: string;   // HH:MM format
  }[];
}

/**
 * Custom StudyDeck Error
 */
export class StudyDeckError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'StudyDeckError';
  }
}

/**
 * StudyDeck Client
 * Handles communication with StudyDeck API
 */
export class StudyDeckService {
  private baseUrl: string = 'https://studydeck.bits-sutechteam.org';
  private timeout: number = 30000;
  private jwtToken: string;

  constructor() {
    // Get StudyDeck JWT token from environment
    this.jwtToken = process.env.STUDYDECK_JWT_TOKEN || '';
    if (!this.jwtToken) {
      console.warn('[StudyDeck] WARNING: STUDYDECK_JWT_TOKEN not set in .env');
    }
  }

  /**
   * Get course sections from StudyDeck API
   *
   * @param courseStaticId - Static ID from all_courses.json
   * @param jwtToken - Optional JWT token (uses env token if not provided)
   * @returns List of parsed section details
   */
  async getCourseSections(
    courseStaticId: string,
    jwtToken?: string
  ): Promise<ParsedSectionDetail[]> {
    const token = jwtToken || this.jwtToken;

    if (!token) {
      throw new StudyDeckError(
        'StudyDeck JWT token not configured. Set STUDYDECK_JWT_TOKEN in .env',
        'TOKEN_MISSING',
        500
      );
    }
    try {
      console.log(`[StudyDeck] Fetching sections for course: ${courseStaticId}`);

      const url = `${this.baseUrl}/back/courses/sections/list/?course_static_id=${courseStaticId}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Host': 'studydeck.bits-sutechteam.org',
          'Cookie': `jwt=${token}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
          'Referer': 'https://studydeck.bits-sutechteam.org/creator',
          'Accept': 'application/json, text/plain, */*',
        },
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new StudyDeckError(
          `Failed to fetch course sections: HTTP ${response.status}`,
          'FETCH_FAILED',
          response.status
        );
      }

      const data = await response.json() as StudyDeckSection[];

      if (!Array.isArray(data)) {
        throw new StudyDeckError(
          'Invalid response format from StudyDeck API',
          'INVALID_RESPONSE',
          500
        );
      }

      // Parse and format the sections
      const parsedSections = this.parseSections(data);

      console.log(`[StudyDeck] Fetched ${parsedSections.length} sections`);
      return parsedSections;

    } catch (error: any) {
      if (error instanceof StudyDeckError) {
        throw error;
      }

      if (error.name === 'AbortError') {
        throw new StudyDeckError(
          'StudyDeck request timed out',
          'TIMEOUT',
          408
        );
      }

      throw new StudyDeckError(
        `Failed to fetch course sections: ${error.message}`,
        'NETWORK_ERROR',
        500
      );
    }
  }

  /**
   * Parse raw StudyDeck sections into structured format
   *
   * @param sections - Raw sections from API
   * @returns Parsed section details with formatted timings
   */
  private parseSections(sections: StudyDeckSection[]): ParsedSectionDetail[] {
    return sections.map(section => ({
      sectionType: section.type || 'Unknown',
      sectionNumber: section.section_number,
      instructors: section.teachers || [],
      roomNumber: section.room_no || '',
      timings: this.parseTimings(section.classes || []),
    }));
  }

  /**
   * Parse class timings into structured format
   *
   * @param classes - Raw class timings
   * @returns Formatted timing objects
   */
  private parseTimings(classes: StudyDeckClassTiming[]): ParsedSectionDetail['timings'] {
    return classes.map(cls => ({
      dayOfWeek: this.normalizeDayOfWeek(cls.day),
      startTime: this.formatTime(cls.starttime),
      endTime: this.formatTime(cls.endtime),
    }));
  }

  /**
   * Normalize day of week to standard format
   */
  private normalizeDayOfWeek(day: string): string {
    const dayMap: Record<string, string> = {
      'mon': 'Monday',
      'tue': 'Tuesday',
      'wed': 'Wednesday',
      'thu': 'Thursday',
      'fri': 'Friday',
      'sat': 'Saturday',
      'sun': 'Sunday',
    };

    const normalized = day.toLowerCase().substring(0, 3);
    return dayMap[normalized] || day;
  }

  /**
   * Format time from HH:MM:SS to HH:MM
   */
  private formatTime(time: string): string {
    if (!time) return '';
    // Remove seconds if present (09:00:00 -> 09:00)
    return time.substring(0, 5);
  }

  /**
   * Format schedule for display (backward compatibility)
   *
   * @param sections - Parsed sections
   * @returns Sections with formatted schedule strings
   */
  static formatScheduleStrings(sections: ParsedSectionDetail[]): ParsedSection[] {
    return sections.map(section => ({
      ...section,
      schedule: section.timings.map(
        timing => `${timing.dayOfWeek} ${timing.startTime}-${timing.endTime}`
      ),
    }));
  }
}

// Export singleton instance
export const studyDeckService = new StudyDeckService();
