import { corsHeaders } from '../_shared/utils/cors.ts';
import { authenticate } from '../_shared/auth/middleware.ts';
import { MenuService } from '../_shared/services/menu.service.ts';
import type { CreateMenuRequest } from '../_shared/types/menu.types.ts';
import {
  createErrorResponse,
  createSuccessResponse,
} from '../_shared/utils/errors.ts';

/**
 * Admin Menus Create - 메뉴 생성 (super_admin 전용)
 *
 * POST /admin-menus-create
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

    // Parse request body
    const body = (await req.json()) as CreateMenuRequest;

    if (!body.code || !body.name) {
      throw new Error('code and name are required');
    }

    // Create menu using service
    const menuService = new MenuService(user);
    const result = await menuService.createMenu(body);

    return createSuccessResponse(result, 201);
  } catch (error) {
    console.error('Admin menus create error:', error);
    return createErrorResponse(error);
  }
});
