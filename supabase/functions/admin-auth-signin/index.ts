/**
 * Auth Signin Edge Function
 * 로그인: Supabase Auth (JWT 검증) + 비즈니스 로직 (권한 체크, Audit)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { AuthService } from '../_shared/services/auth.service.ts';
import { corsHeaders } from '../_shared/utils/cors.ts';
import {
  createSuccessResponse,
  createErrorResponse,
} from '../_shared/utils/response.ts';

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // POST만 허용
    if (req.method !== 'POST') {
      return createErrorResponse(new Error('Method not allowed'), 405);
    }

    // Request body 파싱
    const body = await req.json();

    // AuthService로 로그인 처리
    const authService = new AuthService();
    const result = await authService.signIn(body);

    return createSuccessResponse(result, 200);
  } catch (error) {
    console.error('Sign in error:', error);
    return createErrorResponse(error, 401);
  }
});
