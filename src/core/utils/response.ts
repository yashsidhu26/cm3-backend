import { Context } from 'hono';

/**
 * Standard API Response Wrapper
 * Ensures consistent response format across all endpoints
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    path?: string;
  };
}

/**
 * Success response helper
 */
export function successResponse<T>(c: Context, data: T, status = 200) {
  return c.json<ApiResponse<T>>(
    {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        path: c.req.path,
      },
    },
    status
  );
}

/**
 * Error response helper
 */
export function errorResponse(
  c: Context,
  message: string,
  status = 400,
  code?: string,
  details?: any
) {
  return c.json<ApiResponse>(
    {
      success: false,
      error: {
        message,
        code,
        details,
      },
      meta: {
        timestamp: new Date().toISOString(),
        path: c.req.path,
      },
    },
    status
  );
}

/**
 * Created response helper (201)
 */
export function createdResponse<T>(c: Context, data: T) {
  return successResponse(c, data, 201);
}

/**
 * No content response helper (204)
 */
export function noContentResponse(c: Context) {
  return c.body(null, 204);
}
