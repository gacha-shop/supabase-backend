/**
 * Admin Shop Update
 * Admin/Super Admin이 매장 정보를 수정하는 Edge Function
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate } from '../_shared/auth/middleware.ts';
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

    // URL에서 shop_id 추출
    const url = new URL(req.url);
    const shopId = url.searchParams.get('id');

    if (!shopId) {
      throw new Error('Shop ID is required');
    }

    const body: ShopUpdateInput = await req.json();

    const service = new ShopService(user);
    const shop = await service.updateShop(shopId, body);

    return createSuccessResponse(shop);
  } catch (error) {
    return createErrorResponse(error);
  }
});
