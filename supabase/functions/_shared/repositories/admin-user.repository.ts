/**
 * Admin User Repository
 * admin_users 테이블 CRUD
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import type { AdminUser } from '../types/auth.types.ts';

export class AdminUserRepository {
  private supabase;

  constructor() {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Service Role Key 사용 (RLS 우회)
    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
  }

  /**
   * ID로 Admin User 조회
   */
  async findById(id: string): Promise<AdminUser | null> {
    const { data, error } = await this.supabase
      .from('admin_users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error finding admin user by ID:', error);
      throw error;
    }

    return data;
  }

  /**
   * Email로 Admin User 조회
   */
  async findByEmail(email: string): Promise<AdminUser | null> {
    const { data, error } = await this.supabase
      .from('admin_users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      console.error('Error finding admin user by email:', error);
      throw error;
    }

    return data;
  }

  /**
   * Admin User 생성 (RPC 사용)
   */
  async create(input: {
    id: string;
    email: string;
    full_name: string;
    role: 'admin' | 'owner';
    status: 'active' | 'suspended' | 'deleted';
    approval_status: 'pending' | 'approved' | 'rejected';
  }): Promise<AdminUser> {
    const { data, error } = await this.supabase.rpc('create_admin_user', {
      user_id: input.id,
      user_email: input.email,
      user_full_name: input.full_name,
      user_role: input.role,
    });

    if (error) {
      console.error('Error creating admin user:', error);
      throw error;
    }

    return data as AdminUser;
  }

  /**
   * Owner 유저 생성 (shop_owners 테이블에 생성)
   */
  async createOwner(input: {
    user_id: string;
    email: string;
    full_name: string;
    phone: string;
    shop_id: string;
    business_license?: string | null;
    business_name?: string | null;
  }): Promise<AdminUser> {
    const { data, error } = await this.supabase.rpc('create_shop_owner', {
      p_user_id: input.user_id,
      p_email: input.email,
      p_full_name: input.full_name,
      p_phone: input.phone,
      p_shop_id: input.shop_id,
      p_business_license: input.business_license || null,
      p_business_name: input.business_name || null,
    });

    if (error) {
      console.error('Error creating shop owner:', error);
      throw error;
    }

    return data as AdminUser;
  }

  /**
   * last_login_at 업데이트
   */
  async updateLastLogin(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('admin_users')
      .update({
        last_login_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Error updating last login:', error);
      throw error;
    }
  }

  /**
   * Admin User 상태 업데이트
   */
  async updateStatus(
    id: string,
    status: 'active' | 'suspended' | 'deleted'
  ): Promise<AdminUser> {
    const { data, error } = await this.supabase
      .from('admin_users')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating admin user status:', error);
      throw error;
    }

    return data;
  }

  /**
   * 승인 상태 업데이트
   */
  async updateApprovalStatus(
    id: string,
    approvalStatus: 'pending' | 'approved' | 'rejected',
    approvedBy: string | null = null,
    rejectionReason: string | null = null
  ): Promise<AdminUser> {
    const updateData: Record<string, unknown> = {
      approval_status: approvalStatus,
    };

    if (approvalStatus === 'approved') {
      updateData.approved_at = new Date().toISOString();
      updateData.approved_by = approvedBy;
      updateData.rejection_reason = null;
    } else if (approvalStatus === 'rejected') {
      updateData.rejection_reason = rejectionReason;
      updateData.approved_by = approvedBy;
    }

    const { data, error } = await this.supabase
      .from('admin_users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating approval status:', error);
      throw error;
    }

    return data;
  }
}
