/**
 * Admin Shop Create
 * Admin/Super Admin이 매장을 생성하는 Edge Function
 *
 * 이 파일은 얇은 HTTP 핸들러 (10% - 마이그레이션 시 교체)
 * 비즈니스 로직은 ShopService에 있음 (90% - 재사용 가능!)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate } from '../_shared/auth/middleware.ts';
import { ShopService } from '../_shared/services/shop.service.ts';
import {
  createErrorResponse,
  createSuccessResponse,
  corsHeaders,
} from '../_shared/utils/errors.ts';
import type { ShopCreateInput } from '../_shared/types/shop.types.ts';

serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders(),
    });
  }

  try {
    // 1. 인증 & 권한 체크
    const user = await authenticate(req);

    // 2. Body 파싱
    const body: ShopCreateInput = await req.json();

    // 3. Service 레이어 호출 (핵심 비즈니스 로직 - 재사용 가능!)
    const service = new ShopService(user);
    const shop = await service.createShop(body);

    // 4. 성공 응답
    return createSuccessResponse(shop, 201);
  } catch (error) {
    // 5. 에러 처리
    return createErrorResponse(error);
  }
});

/* ========================================
   🔥 자체 서버 마이그레이션 시 (Express)
   ======================================== */

/*
// src/routes/admin/shops.ts

import { Router } from 'express';
import { ShopService } from '../../services/shop.service'; // 똑같은 파일!
import { authenticate } from '../../middleware/auth';
import { errorHandler } from '../../middleware/errors';

const router = Router();

router.post('/admin/shops', authenticate, async (req, res, next) => {
  try {
    const service = new ShopService(req.user); // 똑같은 인터페이스!
    const shop = await service.createShop(req.body);

    res.status(201).json({ success: true, data: shop });
  } catch (error) {
    next(error);
  }
});

export default router;
*/
