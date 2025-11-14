/**
 * Admin Review Submission
 * 어드민이 유저 제보를 검토(승인/반려)하는 Edge Function
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate } from '../_shared/auth/middleware.ts';
import { UserSubmissionService } from '../_shared/services/user-submission.service.ts';
import {
  createErrorResponse,
  createSuccessResponse,
  corsHeaders,
} from '../_shared/utils/errors.ts';
import type { UserSubmissionReviewInput } from '../_shared/types/user-submission.types.ts';

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

    // 2. URL에서 submission ID 추출
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const submissionId = pathParts[pathParts.length - 1];

    if (!submissionId) {
      throw new Error('Missing submission ID');
    }

    // 3. Body 파싱
    const body: UserSubmissionReviewInput = await req.json();

    // 4. Service 레이어 호출 (핵심 비즈니스 로직 - 재사용 가능!)
    const service = new UserSubmissionService(user);
    const result = await service.reviewSubmission(submissionId, body);

    // 5. 성공 응답
    return createSuccessResponse(result);
  } catch (error) {
    // 6. 에러 처리
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

router.put('/admin/submissions/:id/review', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const service = new UserSubmissionService(req.user); // 똑같은 인터페이스!
    const result = await service.reviewSubmission(req.params.id, req.body);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
*/
