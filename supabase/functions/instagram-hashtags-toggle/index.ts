/**
 * Instagram Hashtags Toggle
 * Admin이 해시태그 활성화/비활성화를 토글하는 Edge Function
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { authenticate, requireAdmin } from "../_shared/auth/middleware.ts";
import {
  createErrorResponse,
  createSuccessResponse,
  corsHeaders,
  ValidationError,
  NotFoundError,
} from "../_shared/utils/errors.ts";

interface ToggleHashtagRequest {
  hashtag_id: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  try {
    // 1. 인증 및 admin 권한 체크
    const user = await authenticate(req);
    requireAdmin(user);

    // 2. Request body 파싱
    if (req.method !== "PATCH") {
      throw new ValidationError("Only PATCH method is allowed");
    }

    const body: ToggleHashtagRequest = await req.json();

    if (!body.hashtag_id) {
      throw new ValidationError("hashtag_id is required");
    }

    // 3. Supabase 클라이언트 생성
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 4. 현재 해시태그 조회
    const { data: currentHashtag, error: fetchError } = await supabase
      .from("instagram_hashtags")
      .select("id, keyword, is_active")
      .eq("id", body.hashtag_id)
      .maybeSingle();

    if (fetchError) {
      throw fetchError;
    }

    if (!currentHashtag) {
      throw new NotFoundError("Hashtag not found");
    }

    // 5. is_active 토글
    const newIsActive = !currentHashtag.is_active;

    const { data: updatedHashtag, error: updateError } = await supabase
      .from("instagram_hashtags")
      .update({
        is_active: newIsActive,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.hashtag_id)
      .select("id, keyword, hashtag_id, is_active, updated_at")
      .single();

    if (updateError) {
      throw updateError;
    }

    return createSuccessResponse(updatedHashtag);
  } catch (error) {
    return createErrorResponse(error);
  }
});
