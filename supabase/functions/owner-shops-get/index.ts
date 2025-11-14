/**
 * Owner Shops Get
 * Owner가 본인 소유 매장의 상세 정보를 조회하는 Edge Function
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate, requireOwner } from '../_shared/auth/middleware.ts';
import { ShopService } from '../_shared/services/shop.service.ts';
import {
  createErrorResponse,
  createSuccessResponse,
  corsHeaders,
} from '../_shared/utils/errors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const user = await authenticate(req);
    requireOwner(user);

    // URL에서 shop_id 추출
    const url = new URL(req.url);
    const shopId = url.searchParams.get('id');

    if (!shopId) {
      throw new Error('Shop ID is required');
    }

    const service = new ShopService(user);

    // 소유권 검증 후 조회
    // verifyOwnership이 실패하면 ForbiddenError를 던짐
    const shop = await service.getMyShop(shopId);

    return createSuccessResponse(shop);
  } catch (error) {
    return createErrorResponse(error);
  }
});
