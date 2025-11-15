import { corsHeaders } from '../_shared/utils/cors.ts';
import { authenticate } from '../_shared/auth/middleware.ts';
import { MenuService } from '../_shared/services/menu.service.ts';
import {
  createErrorResponse,
  createSuccessResponse,
} from '../_shared/utils/errors.ts';

/**
 * Admin Menus Delete - 메뉴 삭제 (super_admin 전용)
 *
 * DELETE /admin-menus-delete/:id
 * Query params:
 *   - hard_delete: boolean (true for hard delete, false for soft delete)
 *
 * Response:
 * {
 *   "success": true
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

    // Check for hard delete flag
    const hardDelete = url.searchParams.get('hard_delete') === 'true';

    // Delete menu using service
    const menuService = new MenuService(user);
    const result = await menuService.deleteMenu(menuId, hardDelete);

    return createSuccessResponse(result, 200);
  } catch (error) {
    console.error('Admin menus delete error:', error);
    return createErrorResponse(error);
  }
});
