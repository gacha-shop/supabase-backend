import { corsHeaders } from '../_shared/utils/cors.ts';
import { authenticate } from '../_shared/auth/middleware.ts';
import { MenuService } from '../_shared/services/menu.service.ts';
import {
  createErrorResponse,
  createSuccessResponse,
} from '../_shared/utils/errors.ts';

/**
 * Admin Menus Get All - 전체 메뉴 조회 (super_admin 전용)
 *
 * GET /admin-menus-get-all
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

    // Get all menus using service (super_admin only)
    const menuService = new MenuService(user);
    const menus = await menuService.getAllMenus();

    return createSuccessResponse({ menus }, 200);
  } catch (error) {
    console.error('Admin menus get all error:', error);
    return createErrorResponse(error);
  }
});
