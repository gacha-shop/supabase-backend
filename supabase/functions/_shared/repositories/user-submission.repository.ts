/**
 * User Submission Repository
 * 유저 제보 DB 접근 레이어
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  UserSubmission,
  UserSubmissionDetail,
  UserSubmissionListParams,
  UserSubmissionListResponse,
} from '../types/user-submission.types.ts';

export class UserSubmissionRepository {
  private supabase;

  constructor() {
    // Service Role Key 사용
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
  }

  /**
   * 제보 생성
   */
  async create(data: {
    shop_id: string;
    submitter_id: string;
    submission_type: 'new' | 'update' | 'correction';
    submission_note?: string;
    submitted_data: Record<string, any>;
    ip_address?: string;
    user_agent?: string;
  }): Promise<UserSubmission> {
    const { data: submission, error } = await this.supabase
      .from('user_submissions')
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return submission;
  }

  /**
   * ID로 제보 조회 (상세 정보 포함)
   */
  async findById(id: string): Promise<UserSubmissionDetail | null> {
    const { data, error } = await this.supabase
      .from('user_submissions')
      .select(`
        *,
        shop:shops(id, name, address_full, verification_status),
        submitter:general_users(id, email, nickname),
        reviewer:admin_users(id, email, full_name)
      `)
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  /**
   * 유저별 제보 목록 조회
   */
  async findBySubmitterId(
    submitterId: string,
    params?: UserSubmissionListParams
  ): Promise<UserSubmissionListResponse> {
    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const offset = (page - 1) * limit;

    let query = this.supabase
      .from('user_submissions')
      .select(
        `
        *,
        shop:shops(id, name, address_full, verification_status)
      `,
        { count: 'exact' }
      )
      .eq('submitter_id', submitterId)
      .order('submitted_at', { ascending: false });

    // 상태 필터
    if (params?.status) {
      query = query.eq('status', params.status);
    }

    // 페이지네이션
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      data: data || [],
      meta: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * 전체 제보 목록 조회 (어드민용)
   */
  async findAll(
    params?: UserSubmissionListParams
  ): Promise<UserSubmissionListResponse> {
    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const offset = (page - 1) * limit;

    let query = this.supabase
      .from('user_submissions')
      .select(
        `
        *,
        shop:shops(id, name, address_full, verification_status),
        submitter:general_users(id, email, nickname),
        reviewer:admin_users(id, email, full_name)
      `,
        { count: 'exact' }
      )
      .order('submitted_at', { ascending: false });

    // 상태 필터
    if (params?.status) {
      query = query.eq('status', params.status);
    }

    // 검색 (shop name or submitter nickname)
    if (params?.search) {
      // Note: 복잡한 OR 검색은 View 사용 권장
      query = query.or(
        `shop.name.ilike.%${params.search}%,submitter.nickname.ilike.%${params.search}%`
      );
    }

    // 페이지네이션
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      data: data || [],
      meta: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Shop별 제보 이력 조회
   */
  async findByShopId(shopId: string): Promise<UserSubmissionDetail[]> {
    const { data, error } = await this.supabase
      .from('user_submissions')
      .select(`
        *,
        submitter:general_users(id, email, nickname),
        reviewer:admin_users(id, email, full_name)
      `)
      .eq('shop_id', shopId)
      .order('submitted_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * 제보 상태 업데이트 (승인/반려)
   */
  async updateStatus(
    submissionId: string,
    status: 'approved' | 'rejected',
    reviewedBy: string,
    reviewNote?: string
  ): Promise<UserSubmission> {
    const { data, error } = await this.supabase
      .from('user_submissions')
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewedBy,
        review_note: reviewNote,
      })
      .eq('id', submissionId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * 유저의 최근 제보 횟수 조회 (스팸 방지)
   */
  async getRecentSubmissionCount(
    submitterId: string,
    withinHours: number = 1
  ): Promise<number> {
    const { count, error } = await this.supabase
      .from('user_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('submitter_id', submitterId)
      .gte('submitted_at', new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString());

    if (error) throw error;
    return count || 0;
  }

  /**
   * 제보 통계 조회
   */
  async getStats() {
    const { data, error } = await this.supabase
      .from('user_submissions_stats')
      .select('*');

    if (error) throw error;
    return data;
  }
}
