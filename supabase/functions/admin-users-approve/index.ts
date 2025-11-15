import { corsHeaders } from "../_shared/utils/cors.ts";
import { authenticate } from "../_shared/auth/middleware.ts";
import { AdminUserRepository } from "../_shared/repositories/admin-user.repository.ts";
import {
  createErrorResponse,
  createSuccessResponse,
  ForbiddenError,
} from "../_shared/utils/errors.ts";

interface ApproveUserRequest {
  user_id: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const user = await authenticate(req);

    // Only super_admin can approve users
    if (user.role !== "super_admin") {
      throw new ForbiddenError("Only super admins can approve users");
    }

    // Parse request body
    const body = (await req.json()) as ApproveUserRequest;
    const { user_id } = body;

    if (!user_id) {
      throw new Error("user_id is required");
    }

    // Approve user using repository
    const adminUserRepository = new AdminUserRepository();
    const approvedUser = await adminUserRepository.updateApprovalStatus(
      user_id,
      "approved",
      user.id
    );

    return createSuccessResponse(approvedUser, 200);
  } catch (error) {
    console.error("Admin users approve error:", error);
    return createErrorResponse(error);
  }
});
