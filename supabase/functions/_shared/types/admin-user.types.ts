export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type UserStatus = 'active' | 'suspended' | 'deleted';
export type AdminRole = 'super_admin' | 'admin' | 'owner';

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: AdminRole;
  status: UserStatus;
  approval_status: ApprovalStatus;
  approved_at: string | null;
  approved_by: string | null;
  rejection_reason: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  business_license: string | null;
  business_name: string | null;
  notes: string | null;
}

export interface AdminUserFilters {
  approval_status?: ApprovalStatus | 'all';
  status?: UserStatus | 'all';
  role?: AdminRole | 'all';
  search?: string; // Search by email or name
}

export interface AdminUserUpdateData {
  full_name?: string;
  avatar_url?: string;
  status?: UserStatus;
  notes?: string;
}

export interface GetAllAdminUsersRequest {
  filters?: AdminUserFilters;
}

export interface UpdateAdminUserRequest {
  user_id: string;
  updates: AdminUserUpdateData;
}

export interface AdminUserActionRequest {
  user_id: string;
}
