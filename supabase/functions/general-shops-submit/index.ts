/**
 * General User Shop Submit
 * 일반 유저가 샵을 제보하는 Edge Function
 *
 * 이 파일은 얇은 HTTP 핸들러 (10% - 마이그레이션 시 교체)
 * 비즈니스 로직은 UserSubmissionService에 있음 (90% - 재사용 가능!)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate } from '../_shared/auth/middleware.ts';
import { UserSubmissionService } from '../_shared/services/user-submission.service.ts';
import {
  createErrorResponse,
  createSuccessResponse,
  corsHeaders,
} from '../_shared/utils/errors.ts';
import type { UserSubmissionCreateInput } from '../_shared/types/user-submission.types.ts';

serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders(),
    });
  }

  try {
    // 1. 인증 (general_user만 허용)
    const user = await authenticate(req);

    // 2. Body 파싱
    const body: UserSubmissionCreateInput = await req.json();

    // 3. 메타데이터 추출
    const metadata = {
      ip_address: req.headers.get('x-forwarded-for') ||
                  req.headers.get('cf-connecting-ip') ||
                  undefined,
      user_agent: req.headers.get('user-agent') || undefined,
    };

    // 4. Service 레이어 호출 (핵심 비즈니스 로직 - 재사용 가능!)
    const service = new UserSubmissionService(user);
    const result = await service.submitShop(body, metadata);

    // 5. 성공 응답
    return createSuccessResponse(result, 201);
  } catch (error) {
    // 6. 에러 처리
    return createErrorResponse(error);
  }
});

/* ========================================
   🔥 자체 서버 마이그레이션 시 (Express)
   ======================================== */

/*
// src/routes/user/submissions.ts

import { Router } from 'express';
import { UserSubmissionService } from '../../services/user-submission.service'; // 똑같은 파일!
import { authenticate } from '../../middleware/auth';
import { errorHandler } from '../../middleware/errors';

const router = Router();

router.post('/user/shops/submit', authenticate, async (req, res, next) => {
  try {
    const service = new UserSubmissionService(req.user); // 똑같은 인터페이스!
    const result = await service.submitShop(req.body, {
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
*/
