/**
 * Admin Submissions List
 * 어드민이 모든 제보 목록을 조회하는 Edge Function
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
    // 1. 인증 & 권한 체크 (admin, super_admin만 허용)
    const user = await authenticate(req);

    // 2. URL 파라미터 추출
    const url = new URL(req.url);
    const params = {
      page: parseInt(url.searchParams.get('page') || '1'),
      limit: parseInt(url.searchParams.get('limit') || '20'),
      status: url.searchParams.get('status') as 'pending' | 'approved' | 'rejected' | undefined,
      search: url.searchParams.get('search') || undefined,
    };

    // 3. Service 레이어 호출 (핵심 비즈니스 로직 - 재사용 가능!)
    const service = new UserSubmissionService(user);
    const result = await service.getAllSubmissions(params);

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
// src/routes/admin/submissions.ts

import { Router } from 'express';
import { UserSubmissionService } from '../../services/user-submission.service'; // 똑같은 파일!
import { authenticate, requireAdmin } from '../../middleware/auth';

const router = Router();

router.get('/admin/submissions', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const service = new UserSubmissionService(req.user); // 똑같은 인터페이스!
    const result = await service.getAllSubmissions(req.query);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
*/
