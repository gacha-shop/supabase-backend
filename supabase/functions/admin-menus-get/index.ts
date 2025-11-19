import { corsHeaders } from '../_shared/utils/cors.ts';
import { authenticate } from '../_shared/auth/middleware.ts';
import { MenuService } from '../_shared/services/menu.service.ts';
import type { GetAdminMenusRequest } from '../_shared/types/menu.types.ts';
import {
  createErrorResponse,
  createSuccessResponse,
} from '../_shared/utils/errors.ts';

/**
 * Admin Menus Get - 로그인한 유저가 접근 가능한 메뉴 조회
 *
 * GET /admin-menus-get
 * POST /admin-menus-get (optional admin_id in body)
 *
 * Response:
 * {
 *   "menus": MenuWithChildren[]
 * }
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const user = await authenticate(req);

    // Parse request body if POST
    let adminId: string | undefined;
    if (req.method === 'POST') {
      const body = (await req.json()) as GetAdminMenusRequest;
      adminId = body.admin_id;
    }

    // Get menus using service
    const menuService = new MenuService(user);
    const menus = await menuService.getAdminMenus(adminId);

    return createSuccessResponse({ menus }, 200);
  } catch (error) {
    console.error('Admin menus get error:', error);
    return createErrorResponse(error);
  }
});
