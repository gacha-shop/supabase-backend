/**
 * General User Repository
 * 일반 유저 DB 접근 레이어
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  GeneralUser,
  GeneralUserCreateInput,
  GeneralUserUpdateInput,
} from '../types/general-user.types.ts';

export class GeneralUserRepository {
  private supabase;

  constructor() {
    // Service Role Key 사용 (RLS 우회)
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
  }

  /**
   * 일반 유저 생성 (소셜 로그인 후 첫 가입)
   */
  async create(data: GeneralUserCreateInput): Promise<GeneralUser> {
    const { data: user, error } = await this.supabase
      .from('general_users')
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return user;
  }

  /**
   * ID로 유저 조회
   */
  async findById(id: string): Promise<GeneralUser | null> {
    const { data, error } = await this.supabase
      .from('general_users')
      .select('*')
      .eq('id', id)
      .eq('status', 'active')
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
    return data;
  }

  /**
   * Email로 유저 조회
   */
  async findByEmail(email: string): Promise<GeneralUser | null> {
    const { data, error } = await this.supabase
      .from('general_users')
      .select('*')
      .eq('email', email)
      .eq('status', 'active')
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  /**
   * Provider로 유저 조회 (소셜 로그인 연동 확인)
   */
  async findByProvider(
    provider: string,
    providerId: string
  ): Promise<GeneralUser | null> {
    const { data, error } = await this.supabase
      .from('general_users')
      .select('*')
      .eq('provider', provider)
      .eq('provider_id', providerId)
      .eq('status', 'active')
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  /**
   * 유저 정보 업데이트
   */
  async update(id: string, data: GeneralUserUpdateInput): Promise<GeneralUser> {
    const { data: user, error } = await this.supabase
      .from('general_users')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return user;
  }

  /**
   * 마지막 활동 시각 업데이트
   */
  async updateLastActive(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('general_users')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * 유저 정지 (soft delete)
   */
  async suspend(id: string): Promise<GeneralUser> {
    const { data, error } = await this.supabase
      .from('general_users')
      .update({ status: 'suspended' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * 유저 삭제 (soft delete)
   */
  async softDelete(id: string): Promise<GeneralUser> {
    const { data, error } = await this.supabase
      .from('general_users')
      .update({ status: 'deleted' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * 닉네임 중복 체크
   */
  async isNicknameAvailable(nickname: string, excludeUserId?: string): Promise<boolean> {
    let query = this.supabase
      .from('general_users')
      .select('id')
      .eq('nickname', nickname)
      .eq('status', 'active');

    if (excludeUserId) {
      query = query.neq('id', excludeUserId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data.length === 0;
  }
}
