import { corsHeaders } from "../_shared/utils/cors.ts";
import { authenticate } from "../_shared/auth/middleware.ts";
import { AdminUserRepository } from "../_shared/repositories/admin-user.repository.ts";
import {
  createErrorResponse,
  createSuccessResponse,
  ForbiddenError,
} from "../_shared/utils/errors.ts";

interface RejectUserRequest {
  user_id: string;
  rejection_reason?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const user = await authenticate(req);

    // Only super_admin can reject users
    if (user.role !== "super_admin") {
      throw new ForbiddenError("Only super admins can reject users");
    }

    // Parse request body
    const body = (await req.json()) as RejectUserRequest;
    const { user_id, rejection_reason } = body;

    if (!user_id) {
      throw new Error("user_id is required");
    }

    // Reject user using repository
    const adminUserRepository = new AdminUserRepository();
    const rejectedUser = await adminUserRepository.updateApprovalStatus(
      user_id,
      "rejected",
      user.id,
      rejection_reason || null
    );

    return createSuccessResponse(rejectedUser, 200);
  } catch (error) {
    console.error("Admin users reject error:", error);
    return createErrorResponse(error);
  }
});
