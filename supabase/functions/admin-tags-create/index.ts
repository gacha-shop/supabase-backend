/**
 * Admin Tags Create
 * Admin/Super Admin이 태그를 생성하는 Edge Function
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate, requireAdmin } from '../_shared/auth/middleware.ts';
import {
  TagService,
  type TagCreateInput,
} from '../_shared/services/tag.service.ts';
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
    requireAdmin(user);

    const input: TagCreateInput = await req.json();

    const service = new TagService(user);
    const tag = await service.createTag(input);

    return createSuccessResponse(tag);
  } catch (error) {
    return createErrorResponse(error);
  }
});
