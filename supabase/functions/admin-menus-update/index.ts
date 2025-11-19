import { corsHeaders } from '../_shared/utils/cors.ts';
import { authenticate } from '../_shared/auth/middleware.ts';
import { MenuService } from '../_shared/services/menu.service.ts';
import type { UpdateMenuRequest } from '../_shared/types/menu.types.ts';
import {
  createErrorResponse,
  createSuccessResponse,
} from '../_shared/utils/errors.ts';

/**
 * Admin Menus Update - 메뉴 수정 (super_admin 전용)
 *
 * PUT /admin-menus-update/:id
 * Body: {
 *   "code": "string",
 *   "name": "string",
 *   "description": "string",
 *   "parent_id": "uuid",
 *   "path": "string",
 *   "icon": "string",
 *   "display_order": number,
 *   "is_active": boolean,
 *   "metadata": {}
 * }
 *
 * Response:
 * {
 *   "menu": Menu
 * }
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const user = await authenticate(req);

    // Extract menu ID from URL
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const menuId = pathParts[pathParts.length - 1];

    if (!menuId) {
      throw new Error('Menu ID is required');
    }

    // Parse request body
    const body = (await req.json()) as UpdateMenuRequest;

    // Update menu using service
    const menuService = new MenuService(user);
    const result = await menuService.updateMenu(menuId, body);

    return createSuccessResponse(result, 200);
  } catch (error) {
    console.error('Admin menus update error:', error);
    return createErrorResponse(error);
  }
});
