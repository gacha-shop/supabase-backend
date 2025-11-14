/**
 * User Submission Types
 * 유저 제보 관련 타입 정의
 */

import type { ShopCreateInput } from './shop.types.ts';

export interface UserSubmission {
  id: string;
  shop_id: string;
  submitter_id: string;
  submission_type: 'new' | 'update' | 'correction';
  submission_note: string | null;
  submitted_data: Record<string, any> | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  submitted_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

export interface UserSubmissionCreateInput {
  shop_data: ShopCreateInput;
  submission_note?: string;
  tag_ids?: string[];
}

export interface UserSubmissionReviewInput {
  action: 'approve' | 'reject';
  review_note?: string;
  shop_updates?: Partial<ShopCreateInput>; // 승인 시 추가 수정사항
}

export interface UserSubmissionDetail extends UserSubmission {
  // Shop 정보
  shop?: {
    id: string;
    name: string;
    address_full: string;
    verification_status: string;
  };
  // 제보자 정보
  submitter?: {
    id: string;
    email: string;
    nickname: string | null;
  };
  // 검토자 정보
  reviewer?: {
    id: string;
    email: string;
    full_name: string | null;
  };
}

export interface UserSubmissionListParams {
  page?: number;
  limit?: number;
  status?: 'pending' | 'approved' | 'rejected';
  search?: string;
}

export interface UserSubmissionListResponse {
  data: UserSubmissionDetail[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface UserSubmissionStats {
  status: string;
  count: number;
  unique_submitters: number;
  oldest_submission: string;
  latest_submission: string;
}
