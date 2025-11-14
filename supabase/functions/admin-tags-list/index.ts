/**
 * Admin Tags List
 * Admin/Super Admin이 태그 목록을 조회하는 Edge Function
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, requireAdmin } from "../_shared/auth/middleware.ts";
import { TagService } from "../_shared/services/tag.service.ts";
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
    const user = await authenticate(req);
    requireAdmin(user);

    const service = new TagService(user);
    const tags = await service.listTags();

    return createSuccessResponse(tags);
  } catch (error) {
    return createErrorResponse(error);
  }
});
