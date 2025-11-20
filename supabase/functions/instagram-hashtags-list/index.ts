/**
 * Instagram Hashtags List
 * Admin이 등록된 해시태그 목록을 조회하는 Edge Function
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { authenticate, requireAdmin } from "../_shared/auth/middleware.ts";
import {
  createErrorResponse,
  createSuccessResponse,
  corsHeaders,
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

    // 3. 해시태그 목록 조회 (최신순)
    const { data: hashtags, error } = await supabase
      .from("instagram_hashtags")
      .select("id, keyword, hashtag_id, is_active, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    // 4. 7일 이내 등록된 해시태그 개수 계산
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const within7Days = hashtags.filter(
      (h) => new Date(h.created_at) > sevenDaysAgo
    );

    return createSuccessResponse({
      hashtags,
      total: hashtags.length,
      within_7_days_count: within7Days.length,
      limit_info: {
        max_hashtags_per_7_days: 30,
        current_count: within7Days.length,
        remaining: Math.max(0, 30 - within7Days.length),
      },
    });
  } catch (error) {
    return createErrorResponse(error);
  }
});
