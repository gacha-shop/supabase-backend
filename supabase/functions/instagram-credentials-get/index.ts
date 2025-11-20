/**
 * Instagram Credentials Get
 * Admin이 현재 활성 Instagram Credential 정보 조회 (토큰 제외)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { authenticate, requireAdmin } from "../_shared/auth/middleware.ts";
import {
  createErrorResponse,
  createSuccessResponse,
  corsHeaders,
  NotFoundError,
} from "../_shared/utils/errors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  try {
    // 1. 인증 및 admin 권한 체크
    const user = await authenticate(req);
    requireAdmin(user);

    // 2. Supabase 클라이언트 생성
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 3. 활성 credential 조회 (access_token 제외)
    const { data: credential, error } = await supabase
      .from("instagram_credentials")
      .select("user_id, expires_at, is_active, created_at")
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!credential) {
      throw new NotFoundError("No active Instagram credential found");
    }

    // 4. 만료까지 남은 시간 계산
    const expiresAt = new Date(credential.expires_at);
    const now = new Date();
    const minutesRemaining = Math.ceil(
      (expiresAt.getTime() - now.getTime()) / (1000 * 60)
    );
    const isExpiringSoon = minutesRemaining <= 10; // 10분 이내 만료 경고

    return createSuccessResponse({
      user_id: credential.user_id,
      expires_at: credential.expires_at,
      minutes_remaining: minutesRemaining,
      is_expiring_soon: isExpiringSoon,
      created_at: credential.created_at,
    });
  } catch (error) {
    return createErrorResponse(error);
  }
});
