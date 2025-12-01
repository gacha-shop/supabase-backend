/**
 * User My Profile Edge Function
 * 현재 로그인한 사용자의 프로필 조회 및 수정
 *
 * GET /user/my-profile - 프로필 조회
 * PUT /user/my-profile - 프로필 수정
 * Authorization: Bearer <JWT_TOKEN>
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate } from '../_shared/auth/middleware.ts';
import { corsHeaders } from '../_shared/utils/cors.ts';
import {
  createSuccessResponse,
  createErrorResponse,
} from '../_shared/utils/response.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import type { GeneralUser, GeneralUserUpdateInput } from '../_shared/types/general-user.types.ts';

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // GET, PUT만 허용
    if (req.method !== 'GET' && req.method !== 'PUT') {
      return createErrorResponse(new Error('Method not allowed'), 405);
    }

    // 1. 인증 확인
    const authUser = await authenticate(req);

    // 2. general_user인지 확인
    if (authUser.user_type !== 'general') {
      return createErrorResponse(new Error('Only general users can access this endpoint'), 403);
    }

    // 3. Supabase 클라이언트 생성 (Service Role)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // GET: 프로필 조회
    if (req.method === 'GET') {
      const { data: user, error } = await supabase
        .from('general_users')
        .select('*')
        .eq('id', authUser.id)
        .eq('status', 'active')
        .single();

      if (error || !user) {
        return createErrorResponse(new Error('User profile not found'), 404);
      }

      return createSuccessResponse({ user: user as GeneralUser });
    }

    // PUT: 프로필 수정
    if (req.method === 'PUT') {
      const body = await req.json();

      // 수정 가능한 필드만 허용
      const updateData: GeneralUserUpdateInput = {};

      if (body.nickname !== undefined) {
        // 닉네임 길이 검증
        if (body.nickname.length < 2 || body.nickname.length > 20) {
          return createErrorResponse(
            new Error('Nickname must be between 2 and 20 characters'),
            400
          );
        }
        updateData.nickname = body.nickname;
      }

      if (body.full_name !== undefined) {
        updateData.full_name = body.full_name;
      }

      if (body.avatar_url !== undefined) {
        updateData.avatar_url = body.avatar_url;
      }

      if (body.bio !== undefined) {
        updateData.bio = body.bio;
      }

      // last_active_at 자동 업데이트
      updateData.last_active_at = new Date().toISOString();

      // 수정 실행
      const { data: updatedUser, error: updateError } = await supabase
        .from('general_users')
        .update(updateData)
        .eq('id', authUser.id)
        .select()
        .single();

      if (updateError) {
        console.error('Update error:', updateError);

        // 닉네임 중복 에러 처리 (PGRST: unique constraint violation)
        if (updateError.message?.includes('unique') || updateError.code === '23505') {
          return createErrorResponse(new Error('Nickname is already taken'), 409);
        }

        return createErrorResponse(new Error('Failed to update profile'), 500);
      }

      return createSuccessResponse({ user: updatedUser as GeneralUser });
    }

    // 여기 도달하면 안 됨
    return createErrorResponse(new Error('Invalid request'), 400);
  } catch (error) {
    console.error('My profile error:', error);

    // 인증 에러
    if (error instanceof Error && error.message.includes('authorization')) {
      return createErrorResponse(error, 401);
    }

    return createErrorResponse(error, 500);
  }
});
