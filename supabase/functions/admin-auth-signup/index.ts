/**
 * Auth Signup Edge Function
 * 회원가입: Supabase Auth (JWT 발급) + 비즈니스 로직 (검증, Audit, 이메일)
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

    // AuthService로 회원가입 처리
    const authService = new AuthService();
    const result = await authService.signUp(body);

    return createSuccessResponse(result, 201);
  } catch (error) {
    console.error('Sign up error:', error);
    return createErrorResponse(error, 400);
  }
});
