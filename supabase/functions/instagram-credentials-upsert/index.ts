/**
 * Instagram Credentials Upsert
 * Super Admin이 Instagram Access Token을 업데이트하는 Edge Function
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { authenticate, requireRole } from "../_shared/auth/middleware.ts";
import {
  createErrorResponse,
  createSuccessResponse,
  corsHeaders,
  ValidationError,
} from "../_shared/utils/errors.ts";

interface UpsertCredentialRequest {
  access_token: string;
  user_id: string;
  expires_in?: number; // 초 단위 (기본: 3600 = 1시간, 수동 발급 토큰)
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  try {
    // 1. 인증 및 super_admin 권한 체크
    const user = await authenticate(req);
    requireRole(user, ["super_admin"]);

    // 2. Request body 파싱
    if (req.method !== "POST") {
      throw new ValidationError("Only POST method is allowed");
    }

    const body: UpsertCredentialRequest = await req.json();

    if (!body.access_token || !body.user_id) {
      throw new ValidationError("access_token and user_id are required");
    }

    // 3. Supabase 클라이언트 생성
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 4. 기존 활성 credential 비활성화
    const { error: deactivateError } = await supabase
      .from("instagram_credentials")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("is_active", true);

    if (deactivateError) {
      throw deactivateError;
    }

    // 5. 만료 시각 계산 (기본 1시간 - 수동 발급 토큰)
    const expiresIn = body.expires_in || 3600; // 1시간 = 3600초
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 6. 새 credential 추가
    const { data: credential, error: insertError } = await supabase
      .from("instagram_credentials")
      .insert({
        access_token: body.access_token,
        user_id: body.user_id,
        token_type: "user",
        expires_at: expiresAt,
        is_active: true,
        created_by: user.id,
      })
      .select("id, user_id, expires_at, is_active, created_at")
      .single();

    if (insertError) {
      throw insertError;
    }

    return createSuccessResponse({
      success: true,
      credential,
    });
  } catch (error) {
    return createErrorResponse(error);
  }
});
