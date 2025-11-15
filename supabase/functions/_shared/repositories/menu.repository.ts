/**
 * Menu Repository
 * menus, admin_menu_permissions 테이블 CRUD
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import type {
  Menu,
  MenuWithChildren,
  AdminMenuPermission,
  CreateMenuRequest,
  UpdateMenuRequest,
} from '../types/menu.types.ts';

export class MenuRepository {
  private supabase;

  constructor() {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Service Role Key 사용 (RLS 우회)
    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
  }

  /**
   * 모든 활성 메뉴 조회
   */
  async findAllActive(): Promise<Menu[]> {
    const { data, error } = await this.supabase
      .from('menus')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error finding active menus:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * 모든 메뉴 조회 (관리자용)
   */
  async findAll(): Promise<Menu[]> {
    const { data, error } = await this.supabase
      .from('menus')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error finding all menus:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * ID로 메뉴 조회
   */
  async findById(id: string): Promise<Menu | null> {
    const { data, error } = await this.supabase
      .from('menus')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error finding menu by ID:', error);
      throw error;
    }

    return data;
  }

  /**
   * Code로 메뉴 조회
   */
  async findByCode(code: string): Promise<Menu | null> {
    const { data, error } = await this.supabase
      .from('menus')
      .select('*')
      .eq('code', code)
      .maybeSingle();

    if (error) {
      console.error('Error finding menu by code:', error);
      throw error;
    }

    return data;
  }

  /**
   * 특정 Admin User가 접근 가능한 메뉴 조회
   */
  async findMenusByAdminId(adminId: string): Promise<Menu[]> {
    const { data, error } = await this.supabase
      .from('admin_menu_permissions')
      .select(`
        menu_id,
        menus (*)
      `)
      .eq('admin_id', adminId);

    if (error) {
      console.error('Error finding menus by admin ID:', error);
      throw error;
    }

    // Extract menu objects from the joined data
    const menus = data?.map((item: any) => item.menus).filter(Boolean) || [];

    // Sort by display_order
    return menus.sort((a: Menu, b: Menu) => a.display_order - b.display_order);
  }

  /**
   * Admin User의 메뉴 권한 조회
   */
  async findPermissionsByAdminId(
    adminId: string
  ): Promise<AdminMenuPermission[]> {
    const { data, error } = await this.supabase
      .from('admin_menu_permissions')
      .select('*')
      .eq('admin_id', adminId);

    if (error) {
      console.error('Error finding permissions by admin ID:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * 메뉴 생성
   */
  async create(
    input: CreateMenuRequest,
    createdBy: string
  ): Promise<Menu> {
    const { data, error } = await this.supabase
      .from('menus')
      .insert({
        code: input.code,
        name: input.name,
        description: input.description || null,
        parent_id: input.parent_id || null,
        path: input.path || null,
        icon: input.icon || null,
        display_order: input.display_order || 999,
        is_active: input.is_active !== undefined ? input.is_active : true,
        metadata: input.metadata || {},
        created_by: createdBy,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating menu:', error);
      throw error;
    }

    return data;
  }

  /**
   * 메뉴 업데이트
   */
  async update(
    id: string,
    input: UpdateMenuRequest,
    updatedBy: string
  ): Promise<Menu> {
    const updateData: Record<string, any> = {
      updated_by: updatedBy,
    };

    if (input.code !== undefined) updateData.code = input.code;
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined)
      updateData.description = input.description;
    if (input.parent_id !== undefined) updateData.parent_id = input.parent_id;
    if (input.path !== undefined) updateData.path = input.path;
    if (input.icon !== undefined) updateData.icon = input.icon;
    if (input.display_order !== undefined)
      updateData.display_order = input.display_order;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;
    if (input.metadata !== undefined) updateData.metadata = input.metadata;

    const { data, error } = await this.supabase
      .from('menus')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating menu:', error);
      throw error;
    }

    return data;
  }

  /**
   * 메뉴 삭제 (soft delete - is_active = false)
   */
  async softDelete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('menus')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('Error soft deleting menu:', error);
      throw error;
    }
  }

  /**
   * 메뉴 완전 삭제 (hard delete)
   */
  async hardDelete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('menus')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error hard deleting menu:', error);
      throw error;
    }
  }

  /**
   * Admin User의 메뉴 권한 전체 삭제 (트랜잭션용)
   */
  async deletePermissionsByAdminId(adminId: string): Promise<void> {
    const { error } = await this.supabase
      .from('admin_menu_permissions')
      .delete()
      .eq('admin_id', adminId);

    if (error) {
      console.error('Error deleting permissions by admin ID:', error);
      throw error;
    }
  }

  /**
   * Admin User의 메뉴 권한 일괄 생성
   */
  async createPermissions(
    adminId: string,
    menuIds: string[],
    grantedBy: string
  ): Promise<AdminMenuPermission[]> {
    const permissions = menuIds.map((menuId) => ({
      admin_id: adminId,
      menu_id: menuId,
      granted_by: grantedBy,
    }));

    const { data, error } = await this.supabase
      .from('admin_menu_permissions')
      .insert(permissions)
      .select();

    if (error) {
      console.error('Error creating permissions:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * 계층 구조로 메뉴 변환
   */
  buildMenuTree(menus: Menu[]): MenuWithChildren[] {
    const menuMap = new Map<string, MenuWithChildren>();
    const rootMenus: MenuWithChildren[] = [];

    // 먼저 모든 메뉴를 Map에 저장
    menus.forEach((menu) => {
      menuMap.set(menu.id, { ...menu, children: [] });
    });

    // 부모-자식 관계 설정
    menus.forEach((menu) => {
      const menuWithChildren = menuMap.get(menu.id)!;

      if (menu.parent_id) {
        const parent = menuMap.get(menu.parent_id);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(menuWithChildren);
        }
      } else {
        rootMenus.push(menuWithChildren);
      }
    });

    // 각 레벨에서 display_order로 정렬
    const sortChildren = (menu: MenuWithChildren) => {
      if (menu.children && menu.children.length > 0) {
        menu.children.sort((a, b) => a.display_order - b.display_order);
        menu.children.forEach(sortChildren);
      }
    };

    rootMenus.forEach(sortChildren);
    rootMenus.sort((a, b) => a.display_order - b.display_order);

    return rootMenus;
  }
}
