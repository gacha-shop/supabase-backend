import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type {
  AdminUser,
  AdminUserFilters,
  AdminUserUpdateData,
} from "../types/admin-user.types.ts";
import { ForbiddenError } from "../utils/errors.ts";
import { AuthUser } from "../types/auth.types.ts";

export class AdminUserService {
  private supabase: SupabaseClient;
  constructor(private currentUser: AuthUser) {
    // Service Role Key로 Supabase 클라이언트 생성 (RLS 우회)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
  }

  /**
   * Get all admin users with optional filters
   */
  async getAllAdminUsers(
    filters?: AdminUserFilters
  ): Promise<{ users: AdminUser[] }> {
    this.requireRole(["super_admin"]);

    let query = this.supabase
      .from("admin_users")
      .select("*")
      .order("created_at", { ascending: false });

    // Apply filters
    if (filters?.approval_status && filters.approval_status !== "all") {
      query = query.eq("approval_status", filters.approval_status);
    }

    if (filters?.status && filters.status !== "all") {
      query = query.eq("status", filters.status);
    }

    if (filters?.role && filters.role !== "all") {
      query = query.eq("role", filters.role);
    }

    if (filters?.search) {
      query = query.or(
        `email.ilike.%${filters.search}%,full_name.ilike.%${filters.search}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get all admin users: ${error.message}`);
    }

    return { users: data as AdminUser[] };
  }

  /**
   * Get single admin user by ID
   */
  async getAdminUserById(
    userId: string
  ): Promise<{ user: AdminUser | null; error: Error | null }> {
    try {
      const { data, error } = await this.supabase
        .from("admin_users")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) throw error;

      return { user: data as AdminUser, error: null };
    } catch (error) {
      console.error("Get admin user by ID error:", error);
      return { user: null, error: error as Error };
    }
  }

  /**
   * Update admin user details
   */
  async updateAdminUser(
    userId: string,
    updates: AdminUserUpdateData
  ): Promise<{ user: AdminUser | null; error: Error | null }> {
    try {
      const { data, error } = await this.supabase
        .from("admin_users")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single();

      if (error) throw error;

      return { user: data as AdminUser, error: null };
    } catch (error) {
      console.error("Update admin user error:", error);
      return { user: null, error: error as Error };
    }
  }

  /**
   * Suspend an admin user
   */
  async suspendAdminUser(
    userId: string
  ): Promise<{ user: AdminUser | null; error: Error | null }> {
    return this.updateAdminUser(userId, { status: "suspended" });
  }

  /**
   * Activate an admin user
   */
  async activateAdminUser(
    userId: string
  ): Promise<{ user: AdminUser | null; error: Error | null }> {
    return this.updateAdminUser(userId, { status: "active" });
  }

  /**
   * Delete an admin user (soft delete)
   */
  async deleteAdminUser(
    userId: string
  ): Promise<{ user: AdminUser | null; error: Error | null }> {
    return this.updateAdminUser(userId, { status: "deleted" });
  }

  /**
   * Get statistics about admin users
   */
  async getAdminUserStats(): Promise<{
    stats: {
      total: number;
      pending: number;
      approved: number;
      rejected: number;
      active: number;
      suspended: number;
    };
    error: Error | null;
  }> {
    try {
      const { users, error } = await this.getAllAdminUsers();

      if (error) throw error;

      const stats = {
        total: users.length,
        pending: users.filter((u) => u.approval_status === "pending").length,
        approved: users.filter((u) => u.approval_status === "approved").length,
        rejected: users.filter((u) => u.approval_status === "rejected").length,
        active: users.filter((u) => u.status === "active").length,
        suspended: users.filter((u) => u.status === "suspended").length,
      };

      return { stats, error: null };
    } catch (error) {
      console.error("Get admin user stats error:", error);
      return {
        stats: {
          total: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
          active: 0,
          suspended: 0,
        },
        error: error as Error,
      };
    }
  }

  // ========== Helper Methods ==========

  private requireRole(allowedRoles: string[]) {
    if (!allowedRoles.includes(this.currentUser.role)) {
      throw new ForbiddenError(
        `Forbidden: Requires one of [${allowedRoles.join(", ")}]`
      );
    }
  }
}
