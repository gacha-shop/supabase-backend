/**
 * Owner Shops Update
 * Owner가 본인 소유 매장 정보를 수정하는 Edge Function
 * 제한된 필드만 수정 가능 (description, phone, business_hours, etc.)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate, requireOwner } from '../_shared/auth/middleware.ts';
import { ShopService } from '../_shared/services/shop.service.ts';
import {
  createErrorResponse,
  createSuccessResponse,
  corsHeaders,
} from '../_shared/utils/errors.ts';
import type { ShopUpdateInput } from '../_shared/types/shop.types.ts';

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

    const body: ShopUpdateInput = await req.json();

    const service = new ShopService(user);

    // updateMyShop은 소유권 검증 + 허용된 필드만 수정
    const shop = await service.updateMyShop(shopId, body);

    return createSuccessResponse(shop);
  } catch (error) {
    return createErrorResponse(error);
  }
});
