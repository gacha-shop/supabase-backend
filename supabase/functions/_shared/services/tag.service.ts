/**
 * Tag Service
 * 비즈니스 로직 레이어
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { AuthUser } from '../types/auth.types.ts';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../utils/errors.ts';

export interface Tag {
  id: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  deleted_at: string | null;
  name: string;
  description: string | null;
  created_by: string | null;
  updated_by: string | null;
}

export interface TagWithCount extends Tag {
  shop_count: number;
}

export interface TagCreateInput {
  name: string;
  description?: string;
}

export interface TagUpdateInput {
  name?: string;
  description?: string;
}

export class TagService {
  private supabase: SupabaseClient;

  constructor(private currentUser: AuthUser) {
    // Service Role Key로 Supabase 클라이언트 생성 (RLS 우회)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
  }

  /**
   * Admin/Super Admin: Tag 생성
   */
  async createTag(input: TagCreateInput): Promise<Tag> {
    // 권한 체크
    this.requireRole(['super_admin', 'admin']);

    // 유효성 검사
    if (!input.name || input.name.trim().length === 0) {
      throw new ValidationError('Tag name is required');
    }

    // 중복 체크
    const { data: existing } = await this.supabase
      .from('tags')
      .select('id')
      .eq('name', input.name.trim())
      .eq('is_deleted', false)
      .maybeSingle();

    if (existing) {
      throw new ValidationError(`Tag with name "${input.name}" already exists`);
    }

    // Tag 생성
    const { data: tag, error } = await this.supabase
      .from('tags')
      .insert({
        name: input.name.trim(),
        description: input.description?.trim() || null,
        created_by: this.currentUser.id,
        updated_by: this.currentUser.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Tag insert error:', error);
      throw new Error(`Failed to create tag: ${error.message}`);
    }

    return tag;
  }

  /**
   * Admin/Super Admin: Tag 수정
   */
  async updateTag(tagId: string, input: TagUpdateInput): Promise<Tag> {
    this.requireRole(['super_admin', 'admin']);

    // 존재 확인
    await this.getTagById(tagId);

    // 이름 중복 체크 (변경하는 경우)
    if (input.name) {
      const { data: existing } = await this.supabase
        .from('tags')
        .select('id')
        .eq('name', input.name.trim())
        .eq('is_deleted', false)
        .neq('id', tagId)
        .maybeSingle();

      if (existing) {
        throw new ValidationError(
          `Tag with name "${input.name}" already exists`
        );
      }
    }

    const updateData: Partial<Tag> = {
      updated_by: this.currentUser.id,
      updated_at: new Date().toISOString(),
    };

    if (input.name !== undefined) {
      updateData.name = input.name.trim();
    }

    if (input.description !== undefined) {
      updateData.description = input.description?.trim() || null;
    }

    const { data: tag, error } = await this.supabase
      .from('tags')
      .update(updateData)
      .eq('id', tagId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update tag: ${error.message}`);
    }

    return tag;
  }

  /**
   * Admin/Super Admin: Tag 삭제 (soft delete)
   */
  async deleteTag(tagId: string): Promise<void> {
    this.requireRole(['super_admin', 'admin']);

    // 존재 확인
    await this.getTagById(tagId);

    // 사용 중인 태그 체크
    const { count } = await this.supabase
      .from('shop_tags')
      .select('*', { count: 'exact', head: true })
      .eq('tag_id', tagId);

    if (count && count > 0) {
      throw new ValidationError(
        `Cannot delete tag: ${count} shop(s) are using this tag`
      );
    }

    const { error } = await this.supabase
      .from('tags')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        updated_by: this.currentUser.id,
      })
      .eq('id', tagId);

    if (error) {
      throw new Error(`Failed to delete tag: ${error.message}`);
    }
  }

  /**
   * Tag 조회 (ID)
   */
  async getTagById(tagId: string): Promise<Tag> {
    const { data, error } = await this.supabase
      .from('tags')
      .select('*')
      .eq('id', tagId)
      .eq('is_deleted', false)
      .single();

    if (error || !data) {
      throw new NotFoundError(`Tag not found: ${tagId}`);
    }

    return data;
  }

  /**
   * Tag 목록 조회 (shop_count 포함)
   */
  async listTags(): Promise<TagWithCount[]> {
    // Tags와 shop_count 조회
    const { data: tags, error } = await this.supabase
      .from('tags')
      .select(
        `
        *,
        shop_tags(count)
      `
      )
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list tags: ${error.message}`);
    }

    // shop_count 계산
    return (
      tags?.map((tag: any) => ({
        ...tag,
        shop_count: tag.shop_tags?.[0]?.count || 0,
        shop_tags: undefined, // 제거
      })) || []
    );
  }

  // ==================== Private Methods ====================

  private requireRole(allowedRoles: string[]): void {
    if (!allowedRoles.includes(this.currentUser.role)) {
      throw new ForbiddenError(
        `Requires one of: ${allowedRoles.join(', ')}`
      );
    }
  }
}
