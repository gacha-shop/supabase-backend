/**
 * 인증 관련 타입 정의
 */

export interface AuthUser {
  id: string;
  email: string;
  role: 'super_admin' | 'admin' | 'owner' | 'general_user';
  user_type: 'admin' | 'general'; // 유저 타입 구분
  status: string;
  approvalStatus?: string; // admin_users만 해당
  nickname?: string; // general_users만 해당
  full_name?: string;
}

export interface JWTPayload {
  sub: string;
  email?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

/**
 * 회원가입 요청 데이터
 */
export interface SignUpData {
  email: string;
  password: string;
  full_name: string;
  role?: 'admin' | 'owner';
  // Owner 전용 필드
  phone?: string;
  shop_id?: string;
  business_license?: string;
  business_name?: string;
}

/**
 * 로그인 요청 데이터
 */
export interface SignInData {
  email: string;
  password: string;
}

/**
 * Admin User (DB 모델)
 */
export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: 'super_admin' | 'admin' | 'owner';
  status: 'active' | 'suspended' | 'deleted';
  approval_status: 'pending' | 'approved' | 'rejected';
  approved_at: string | null;
  approved_by: string | null;
  rejection_reason: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 인증 응답
 */
export interface AuthResponse {
  success: boolean;
  user: AdminUser;
  session?: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    expires_at?: number;
    token_type: string;
    user: {
      id: string;
      email?: string;
    };
  };
  message?: string;
}
