/**
 * General User My Submissions List
 * 일반 유저가 자신이 제보한 목록을 조회하는 Edge Function
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate } from '../_shared/auth/middleware.ts';
import { UserSubmissionService } from '../_shared/services/user-submission.service.ts';
import {
  createErrorResponse,
  createSuccessResponse,
  corsHeaders,
} from '../_shared/utils/errors.ts';

serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders(),
    });
  }

  try {
    // 1. 인증
    const user = await authenticate(req);

    // 2. URL 파라미터 추출
    const url = new URL(req.url);
    const params = {
      page: parseInt(url.searchParams.get('page') || '1'),
      limit: parseInt(url.searchParams.get('limit') || '20'),
      status: url.searchParams.get('status') as 'pending' | 'approved' | 'rejected' | undefined,
    };

    // 3. Service 레이어 호출
    const service = new UserSubmissionService(user);
    const result = await service.getMySubmissions(params);

    // 4. 성공 응답
    return createSuccessResponse(result);
  } catch (error) {
    // 5. 에러 처리
    return createErrorResponse(error);
  }
});

/* ========================================
   🔥 자체 서버 마이그레이션 시 (Express)
   ======================================== */

/*
// src/routes/user/submissions.ts

router.get('/user/shops/my-submissions', authenticate, async (req, res, next) => {
  try {
    const service = new UserSubmissionService(req.user);
    const result = await service.getMySubmissions(req.query);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});
*/
