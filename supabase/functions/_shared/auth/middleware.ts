/**
 * 인증 미들웨어
 * Edge Function에서 JWT 검증 및 사용자 정보 조회
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { AuthUser } from "../types/auth.types.ts";
import { UnauthorizedError, ForbiddenError } from "../utils/errors.ts";

/**
 * Request에서 JWT 토큰을 추출하고 검증하여 AuthUser 반환
 */
export async function authenticate(req: Request): Promise<AuthUser> {
  // 1. Authorization 헤더에서 토큰 추출
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or invalid authorization header");
  }

  const token = authHeader.replace("Bearer ", "");

  // 2. Supabase 클라이언트 생성 (user token으로)
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase configuration");
  }

  // User token을 사용하는 Supabase client 생성 (RLS 정책 통과)
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  // 3. 토큰으로 사용자 조회
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    throw new UnauthorizedError("Invalid or expired token");
  }

  // 4. admin_users 테이블에서 사용자 정보 조회 (RLS로 본인 정보만 조회)
  const { data: adminUser, error: adminError } = await supabase
    .from("admin_users")
    .select("role, status, approval_status, full_name")
    .eq("id", user.id)
    .maybeSingle();

  // admin_users에 있으면 admin/super_admin/owner
  if (adminUser) {
    // 상태 체크
    if (adminUser.status !== "active") {
      throw new ForbiddenError("Account is not active");
    }

    if (adminUser.approval_status !== "approved") {
      throw new ForbiddenError("Account is not approved");
    }

    return {
      id: user.id,
      email: user.email!,
      role: adminUser.role as "super_admin" | "admin" | "owner",
      user_type: "admin",
      status: adminUser.status,
      approvalStatus: adminUser.approval_status,
      full_name: adminUser.full_name,
    };
  }

  // 5. general_users 테이블 확인
  const { data: generalUser } = await supabase
    .from("general_users")
    .select("nickname, full_name, status")
    .eq("id", user.id)
    .maybeSingle();

  if (generalUser) {
    // 상태 체크
    if (generalUser.status !== "active") {
      throw new ForbiddenError("Account is suspended or deleted");
    }

    return {
      id: user.id,
      email: user.email!,
      role: "general_user",
      user_type: "general",
      status: generalUser.status,
      nickname: generalUser.nickname,
      full_name: generalUser.full_name,
    };
  }

  // 6. 어디에도 없으면 에러
  throw new UnauthorizedError("User not found in system");
}

/**
 * 역할 기반 권한 체크
 */
export function requireRole(user: AuthUser, allowedRoles: string[]): void {
  if (!allowedRoles.includes(user.role)) {
    throw new ForbiddenError(
      `Requires one of the following roles: ${allowedRoles.join(", ")}`
    );
  }
}

/**
 * Super Admin 또는 Admin 권한 체크
 */
export function requireAdmin(user: AuthUser): void {
  requireRole(user, ["super_admin", "admin"]);
}

/**
 * Owner 권한 체크
 */
export function requireOwner(user: AuthUser): void {
  requireRole(user, ["owner"]);
}

/**
 * 인증된 사용자 (로그인만 필요)
 */
export function requireAuthenticated(user: AuthUser): void {
  // authenticate 함수를 통과했다면 이미 인증됨
  if (!user || !user.id) {
    throw new UnauthorizedError("Authentication required");
  }
}
