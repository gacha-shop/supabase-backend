/**
 * General User Types
 * 일반 유저 관련 타입 정의
 */

export interface GeneralUser {
  id: string;
  email: string;
  nickname: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  provider: 'kakao' | 'google' | 'apple' | null;
  provider_id: string | null;
  status: 'active' | 'suspended' | 'deleted';
  is_verified: boolean;
  created_at: string;
  updated_at: string;
  last_active_at: string | null;
}

export interface GeneralUserCreateInput {
  id: string; // auth.users.id
  email: string;
  nickname?: string;
  full_name?: string;
  avatar_url?: string;
  provider: 'kakao' | 'google' | 'apple';
  provider_id: string;
}

export interface GeneralUserUpdateInput {
  nickname?: string;
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  last_active_at?: string;
}

export interface GeneralUserProfile extends GeneralUser {
  // 추가 통계 정보 (필요 시)
  submission_count?: number;
  approved_submission_count?: number;
}
