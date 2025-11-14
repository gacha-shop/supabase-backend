/**
 * HTTP 응답 유틸리티
 */

import { corsHeaders } from './cors.ts';

/**
 * 성공 응답 생성
 */
export function createSuccessResponse<T>(
  data: T,
  status: number = 200
): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data,
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    }
  );
}

/**
 * 에러 응답 생성
 */
export function createErrorResponse(
  error: Error | unknown,
  status: number = 400
): Response {
  const message =
    error instanceof Error ? error.message : 'An unknown error occurred';

  return new Response(
    JSON.stringify({
      success: false,
      error: {
        message,
      },
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    }
  );
}

/**
 * 유효성 검사 에러 응답 (400)
 */
export function validationErrorResponse(message: string): Response {
  return createErrorResponse(new Error(message), 400);
}

/**
 * 인증 에러 응답 (401)
 */
export function unauthorizedErrorResponse(message: string): Response {
  return createErrorResponse(new Error(message), 401);
}

/**
 * 권한 에러 응답 (403)
 */
export function forbiddenErrorResponse(message: string): Response {
  return createErrorResponse(new Error(message), 403);
}

/**
 * Not Found 에러 응답 (404)
 */
export function notFoundErrorResponse(message: string): Response {
  return createErrorResponse(new Error(message), 404);
}

/**
 * 서버 에러 응답 (500)
 */
export function serverErrorResponse(message: string): Response {
  return createErrorResponse(new Error(message), 500);
}
