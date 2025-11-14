/**
 * Admin Shop Delete
 * Admin/Super Admin이 매장을 삭제(soft delete)하는 Edge Function
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate } from '../_shared/auth/middleware.ts';
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

    const url = new URL(req.url);
    const shopId = url.searchParams.get('id');

    if (!shopId) {
      throw new Error('Shop ID is required');
    }

    const service = new ShopService(user);
    await service.deleteShop(shopId);

    return createSuccessResponse({ message: 'Shop deleted successfully' });
  } catch (error) {
    return createErrorResponse(error);
  }
});
