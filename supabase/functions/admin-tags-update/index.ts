/**
 * Admin Tags Update
 * Admin/Super Admin이 태그를 수정하는 Edge Function
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate, requireAdmin } from '../_shared/auth/middleware.ts';
import {
  TagService,
  type TagUpdateInput,
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

    const url = new URL(req.url);
    const tagId = url.searchParams.get('id');

    if (!tagId) {
      throw new Error('Tag ID is required');
    }

    const input: TagUpdateInput = await req.json();

    const service = new TagService(user);
    const tag = await service.updateTag(tagId, input);

    return createSuccessResponse(tag);
  } catch (error) {
    return createErrorResponse(error);
  }
});
