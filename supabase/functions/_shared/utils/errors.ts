/**
 * 에러 처리 유틸리티
 */

import type { ApiError, ApiResponse } from '../types/api.types.ts';

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

/**
 * 에러를 HTTP Response로 변환
 */
export function createErrorResponse(error: unknown): Response {
  console.error('Error occurred:', error);

  let statusCode = 500;
  let message = 'Internal server error';
  let code = 'INTERNAL_ERROR';

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = error.message;
    code = error.code || 'APP_ERROR';
  } else if (error instanceof Error) {
    message = error.message;
  }

  const response: ApiResponse = {
    success: false,
    error: message,
  };

  return new Response(JSON.stringify(response), {
    status: statusCode,
    headers: jsonHeaders(),
  });
}

/**
 * 성공 응답 생성
 */
export function createSuccessResponse<T>(
  data: T,
  statusCode: number = 200
): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
  };

  return new Response(JSON.stringify(response), {
    status: statusCode,
    headers: jsonHeaders(),
  });
}

/**
 * JSON 응답 헤더
 */
export function jsonHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...corsHeaders(),
  };
}

/**
 * CORS 헤더
 */
export function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  };
}
