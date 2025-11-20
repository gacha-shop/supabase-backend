/**
 * Instagram Hashtags Search
 * Admin이 해시태그 키워드로 Instagram API를 호출하여 해시태그를 등록하는 Edge Function
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

interface SearchHashtagRequest {
  keyword: string;
}

interface InstagramHashtagSearchResponse {
  data: Array<{
    id: string;
  }>;
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
    if (req.method !== "POST") {
      throw new ValidationError("Only POST method is allowed");
    }

    const body: SearchHashtagRequest = await req.json();

    if (!body.keyword || body.keyword.trim() === "") {
      throw new ValidationError("keyword is required");
    }

    const keyword = body.keyword.trim();

    // 3. Supabase 클라이언트 생성
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 4. 활성 Instagram credential 조회
    const { data: credential, error: credError } = await supabase
      .from("instagram_credentials")
      .select("access_token, user_id")
      .eq("is_active", true)
      .maybeSingle();

    if (credError) {
      throw credError;
    }

    if (!credential) {
      throw new NotFoundError(
        "No active Instagram credential found. Please configure Instagram credentials first."
      );
    }

    // 5. Instagram API 호출
    const instagramApiUrl = `https://graph.facebook.com/v24.0/ig_hashtag_search?user_id=${
      credential.user_id
    }&q=${encodeURIComponent(keyword)}&access_token=${credential.access_token}`;

    const instagramResponse = await fetch(instagramApiUrl);

    if (!instagramResponse.ok) {
      const errorData = await instagramResponse.json();
      throw new ValidationError(
        `Instagram API error: ${errorData.error?.message || "Unknown error"}`
      );
    }

    const instagramData: InstagramHashtagSearchResponse =
      await instagramResponse.json();

    if (!instagramData.data || instagramData.data.length === 0) {
      throw new NotFoundError(`No hashtag found for keyword: ${keyword}`);
    }

    const hashtagId = instagramData.data[0].id;

    // 6. 중복 체크 (키워드 기반)
    const { data: existingByKeyword } = await supabase
      .from("instagram_hashtags")
      .select("id, keyword, is_active")
      .eq("keyword", keyword)
      .maybeSingle();

    if (existingByKeyword) {
      throw new ValidationError(
        `Hashtag with keyword "${keyword}" already exists. Please use a different keyword.`
      );
    }

    // 7. 중복 체크 (hashtag_id 기반)
    const { data: existingById } = await supabase
      .from("instagram_hashtags")
      .select("id, keyword, is_active")
      .eq("hashtag_id", hashtagId)
      .maybeSingle();

    if (existingById) {
      throw new ValidationError(
        `This hashtag is already registered with keyword "${existingById.keyword}".`
      );
    }

    // 8. DB에 저장
    const { data: newHashtag, error: insertError } = await supabase
      .from("instagram_hashtags")
      .insert({
        keyword,
        hashtag_id: hashtagId,
        is_active: true,
        created_by: user.id,
      })
      .select("id, keyword, hashtag_id, is_active, created_at")
      .single();

    if (insertError) {
      throw insertError;
    }

    return createSuccessResponse(newHashtag);
  } catch (error) {
    return createErrorResponse(error);
  }
});
