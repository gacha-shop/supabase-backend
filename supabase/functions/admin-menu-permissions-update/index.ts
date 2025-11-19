import { corsHeaders } from '../_shared/utils/cors.ts';
import { authenticate } from '../_shared/auth/middleware.ts';
import { MenuService } from '../_shared/services/menu.service.ts';
import type { UpdateAdminMenuPermissionsRequest } from '../_shared/types/menu.types.ts';
import {
  createErrorResponse,
  createSuccessResponse,
} from '../_shared/utils/errors.ts';

/**
 * Admin Menu Permissions Update - 어드민 유저 메뉴 권한 업데이트 (super_admin 전용)
 *
 * POST /admin-menu-permissions-update
 * Body: {
 *   "admin_user_id": "uuid",
 *   "menu_ids": ["uuid1", "uuid2", ...]
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "permissions": AdminMenuPermission[]
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
    const body = (await req.json()) as UpdateAdminMenuPermissionsRequest;

    if (!body.admin_user_id) {
      throw new Error('admin_user_id is required');
    }

    if (!Array.isArray(body.menu_ids)) {
      throw new Error('menu_ids must be an array');
    }

    // Update permissions using service
    const menuService = new MenuService(user);
    const result = await menuService.updateAdminMenuPermissions(
      body.admin_user_id,
      body.menu_ids
    );

    return createSuccessResponse(result, 200);
  } catch (error) {
    console.error('Admin menu permissions update error:', error);
    return createErrorResponse(error);
  }
});
