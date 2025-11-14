/**
 * Admin Tags Delete
 * Admin/Super Admin이 태그를 삭제하는 Edge Function
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate, requireAdmin } from '../_shared/auth/middleware.ts';
import { TagService } from '../_shared/services/tag.service.ts';
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

    const url = new URL(req.url);
    const tagId = url.searchParams.get('id');

    if (!tagId) {
      throw new Error('Tag ID is required');
    }

    const service = new TagService(user);
    await service.deleteTag(tagId);

    return createSuccessResponse({ message: 'Tag deleted successfully' });
  } catch (error) {
    return createErrorResponse(error);
  }
});
