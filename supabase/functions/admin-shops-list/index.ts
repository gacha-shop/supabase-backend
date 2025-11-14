/**
 * Admin Shop List
 * Admin/Super Admin이 매장 목록을 조회하는 Edge Function
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, requireAdmin } from "../_shared/auth/middleware.ts";
import { ShopService } from "../_shared/services/shop.service.ts";
import {
  createErrorResponse,
  createSuccessResponse,
  corsHeaders,
} from "../_shared/utils/errors.ts";
import type { ShopListFilters } from "../_shared/types/shop.types.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  try {
    const user = await authenticate(req);
    requireAdmin(user);

    // Query parameters 파싱
    const url = new URL(req.url);
    const filters: ShopListFilters = {
      verificationStatus: url.searchParams.get("status") as any,
      page: parseInt(url.searchParams.get("page") || "1"),
      limit: parseInt(url.searchParams.get("limit") || "20"),
    };

    const service = new ShopService(user);
    const result = await service.listShops(filters);

    return createSuccessResponse(result);
  } catch (error) {
    return createErrorResponse(error);
  }
});
