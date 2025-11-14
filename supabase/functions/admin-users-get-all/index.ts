import { corsHeaders } from "../_shared/utils/cors.ts";
import { authenticate } from "../_shared/auth/middleware.ts";
import { AdminUserService } from "../_shared/services/admin-user.service.ts";
import type { GetAllAdminUsersRequest } from "../_shared/types/admin-user.types.ts";
import {
  createErrorResponse,
  createSuccessResponse,
} from "../_shared/utils/errors.ts";

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const user = await authenticate(req);

    // Parse request body for filters
    let filters;
    if (req.method === "POST") {
      const body = (await req.json()) as GetAllAdminUsersRequest;
      filters = body.filters;
    }

    // Get admin users using service
    const adminUserService = new AdminUserService(user);
    const { users } = await adminUserService.getAllAdminUsers(filters);

    return createSuccessResponse(users, 200);
  } catch (error) {
    console.error("Admin users get all error:", error);
    return createErrorResponse(error);
  }
});
