/**
 * User Submission Service
 * 유저 제보 비즈니스 로직 레이어 - 90% 재사용 가능!
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { AuthUser } from '../types/auth.types.ts';
import type {
  UserSubmissionCreateInput,
  UserSubmissionReviewInput,
  UserSubmissionListParams,
  UserSubmissionListResponse,
} from '../types/user-submission.types.ts';
import type { ShopWithTags } from '../types/shop.types.ts';
import { UserSubmissionRepository } from '../repositories/user-submission.repository.ts';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../utils/errors.ts';
import { validateShopInput } from '../utils/validation.ts';

export class UserSubmissionService {
  private supabase: SupabaseClient;
  private submissionRepo: UserSubmissionRepository;

  constructor(private currentUser: AuthUser) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
    this.submissionRepo = new UserSubmissionRepository();
  }

  /**
   * 일반 유저: 샵 제보
   */
  async submitShop(
    input: UserSubmissionCreateInput,
    metadata?: {
      ip_address?: string;
      user_agent?: string;
    }
  ): Promise<{ shop: ShopWithTags; submission: any }> {
    // 권한 체크: general_user만 허용
    if (this.currentUser.user_type !== 'general') {
      throw new ForbiddenError('Only general users can submit shops');
    }

    // 스팸 방지: 1시간에 5개까지
    const recentCount = await this.submissionRepo.getRecentSubmissionCount(
      this.currentUser.id,
      1
    );
    if (recentCount >= 5) {
      throw new ValidationError(
        'Too many submissions. Please wait before submitting again.'
      );
    }

    // 입력 검증
    validateShopInput(input.shop_data);

    const { tag_ids, ...shopData } = input.shop_data;

    // 1. Shop 생성 (pending 상태)
    const { data: shop, error: shopError } = await this.supabase
      .from('shops')
      .insert({
        ...shopData,
        created_by: this.currentUser.id,
        updated_by: this.currentUser.id,
        data_source: 'user_submit',
        verification_status: 'pending',
        submission_note: input.submission_note,
      })
      .select()
      .single();

    if (shopError) {
      console.error('Shop insert error:', shopError);
      throw new Error(`Failed to create shop: ${shopError.message}`);
    }

    // 2. Tags 연결 (있는 경우)
    if (tag_ids && tag_ids.length > 0) {
      await this.attachTags(shop.id, tag_ids);
    }

    // 3. user_submissions 레코드 생성
    const submission = await this.submissionRepo.create({
      shop_id: shop.id,
      submitter_id: this.currentUser.id,
      submission_type: 'new',
      submission_note: input.submission_note,
      submitted_data: input.shop_data,
      ip_address: metadata?.ip_address,
      user_agent: metadata?.user_agent,
    });

    // 4. Shop + Tags 조회
    const shopWithTags = await this.getShopById(shop.id);

    return {
      shop: shopWithTags,
      submission,
    };
  }

  /**
   * 일반 유저: 내 제보 목록 조회
   */
  async getMySubmissions(
    params?: UserSubmissionListParams
  ): Promise<UserSubmissionListResponse> {
    return this.submissionRepo.findBySubmitterId(this.currentUser.id, params);
  }

  /**
   * 어드민: 전체 제보 목록 조회
   */
  async getAllSubmissions(
    params?: UserSubmissionListParams
  ): Promise<UserSubmissionListResponse> {
    // 권한 체크
    this.requireRole(['super_admin', 'admin']);

    return this.submissionRepo.findAll(params);
  }

  /**
   * 어드민: 제보 검토 (승인/반려)
   */
  async reviewSubmission(submissionId: string, input: UserSubmissionReviewInput) {
    // 권한 체크
    this.requireRole(['super_admin', 'admin']);

    // 제보 존재 확인
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new NotFoundError('Submission not found');
    }

    if (submission.status !== 'pending') {
      throw new ValidationError('Submission already reviewed');
    }

    if (input.action === 'approve') {
      // 승인 처리
      await this.supabase
        .from('shops')
        .update({
          verification_status: 'verified',
          verified_at: new Date().toISOString(),
          verified_by: this.currentUser.id,
          updated_by: this.currentUser.id,
          ...(input.shop_updates || {}),
        })
        .eq('id', submission.shop_id);

      await this.submissionRepo.updateStatus(
        submissionId,
        'approved',
        this.currentUser.id,
        input.review_note
      );

      return {
        action: 'approved',
        shop: await this.getShopById(submission.shop_id),
      };
    }

    if (input.action === 'reject') {
      // 반려 처리
      await this.supabase
        .from('shops')
        .update({
          verification_status: 'rejected',
          verified_at: new Date().toISOString(),
          verified_by: this.currentUser.id,
          rejection_reason: input.review_note,
          updated_by: this.currentUser.id,
        })
        .eq('id', submission.shop_id);

      await this.submissionRepo.updateStatus(
        submissionId,
        'rejected',
        this.currentUser.id,
        input.review_note
      );

      return {
        action: 'rejected',
        shop: await this.getShopById(submission.shop_id),
      };
    }

    throw new ValidationError('Invalid action');
  }

  /**
   * Shop별 제보 이력 조회
   */
  async getShopSubmissionHistory(shopId: string) {
    // Admin만 조회 가능
    this.requireRole(['super_admin', 'admin']);

    return this.submissionRepo.findByShopId(shopId);
  }

  // ========== Helper Methods ==========

  private requireRole(allowedRoles: string[]) {
    if (!allowedRoles.includes(this.currentUser.role)) {
      throw new ForbiddenError(
        `Forbidden: Requires one of [${allowedRoles.join(', ')}]`
      );
    }
  }

  private async attachTags(shopId: string, tagIds: string[]) {
    const shopTags = tagIds.map((tagId) => ({
      shop_id: shopId,
      tag_id: tagId,
      created_by: this.currentUser.id,
    }));

    const { error } = await this.supabase
      .from('shop_tags')
      .insert(shopTags);

    if (error) {
      console.error('Shop tags insert error:', error);
      throw new Error(`Failed to attach tags: ${error.message}`);
    }
  }

  private async getShopById(shopId: string): Promise<ShopWithTags> {
    const { data: shop, error } = await this.supabase
      .from('shops')
      .select(`
        *,
        shop_tags(
          tag_id,
          tags(id, name, description)
        )
      `)
      .eq('id', shopId)
      .eq('is_deleted', false)
      .single();

    if (error) {
      throw new NotFoundError('Shop not found');
    }

    return shop;
  }
}
