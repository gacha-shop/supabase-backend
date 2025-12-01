/**
 * User Auth Callback Edge Function
 * 소셜 로그인 후 general_users 생성 또는 조회
 *
 * POST /user/auth-callback
 * Authorization: Bearer <JWT_TOKEN>
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/utils/cors.ts';
import {
  createSuccessResponse,
  createErrorResponse,
} from '../_shared/utils/response.ts';
import type { GeneralUser } from '../_shared/types/general-user.types.ts';

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

    // 1. JWT 토큰 검증
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return createErrorResponse(new Error('Missing or invalid authorization header'), 401);
    }

    const token = authHeader.replace('Bearer ', '');

    // 2. Supabase 클라이언트 생성
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 3. JWT로 사용자 조회
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return createErrorResponse(new Error('Invalid or expired token'), 401);
    }

    // 4. provider 및 provider_id 추출
    const provider = user.app_metadata?.provider as 'kakao' | 'google' | 'apple' || null;
    const providerId = user.user_metadata?.provider_id || user.id;

    // 5. general_users UPSERT (race condition 방지)
    const tempNickname = `user_${user.id.substring(0, 8)}`;

    const { data: generalUser, error: upsertError } = await supabase
      .from('general_users')
      .upsert(
        {
          id: user.id,
          email: user.email!,
          nickname: tempNickname,
          avatar_url: '/avatars/default.png',
          provider,
          provider_id: providerId,
          status: 'active',
          last_active_at: new Date().toISOString(),
        },
        {
          onConflict: 'id',
          ignoreDuplicates: false,
        }
      )
      .select()
      .single();

    if (upsertError) {
      console.error('Upsert error:', upsertError);
      return createErrorResponse(new Error('Failed to create or update user'), 500);
    }

    // 6. 신규 사용자인지 확인 (nickname이 임시 닉네임이면 신규)
    const isNewUser = generalUser.nickname?.startsWith('user_') || false;

    return createSuccessResponse({
      user: generalUser as GeneralUser,
      isNewUser,
    });
  } catch (error) {
    console.error('Auth callback error:', error);
    return createErrorResponse(error, 500);
  }
});
