/**
 * Menu Service
 * 메뉴 및 메뉴 권한 관리 비즈니스 로직
 */

import type {
  MenuWithChildren,
  CreateMenuRequest,
  UpdateMenuRequest,
  AdminMenuPermission,
} from '../types/menu.types.ts';
import type { AuthUser } from '../types/auth.types.ts';
import { MenuRepository } from '../repositories/menu.repository.ts';
import { ForbiddenError, NotFoundError } from '../utils/errors.ts';

export class MenuService {
  private menuRepository: MenuRepository;

  constructor(private currentUser: AuthUser) {
    this.menuRepository = new MenuRepository();
  }

  /**
   * 로그인한 유저가 접근 가능한 메뉴 조회 (계층 구조)
   * - super_admin: 모든 활성 메뉴
   * - 그 외: admin_menu_permissions에 등록된 메뉴만
   */
  async getAdminMenus(adminId?: string): Promise<MenuWithChildren[]> {
    const targetAdminId = adminId || this.currentUser.id;

    // super_admin이면 모든 활성 메뉴 반환
    if (this.currentUser.role === 'super_admin') {
      const menus = await this.menuRepository.findAllActive();
      return this.menuRepository.buildMenuTree(menus);
    }

    // 일반 admin/owner는 권한이 있는 메뉴만 반환
    const menus = await this.menuRepository.findMenusByAdminId(targetAdminId);
    return this.menuRepository.buildMenuTree(menus);
  }

  /**
   * 모든 메뉴 조회 (super_admin 전용)
   * 메뉴 관리 UI에서 사용
   */
  async getAllMenus(): Promise<MenuWithChildren[]> {
    this.requireSuperAdmin();

    const menus = await this.menuRepository.findAll();
    return this.menuRepository.buildMenuTree(menus);
  }

  /**
   * 메뉴 생성 (super_admin 전용)
   */
  async createMenu(input: CreateMenuRequest) {
    this.requireSuperAdmin();

    // Code 중복 체크
    const existingMenu = await this.menuRepository.findByCode(input.code);
    if (existingMenu) {
      throw new Error(`Menu with code "${input.code}" already exists`);
    }

    // parent_id가 제공된 경우, 부모 메뉴 존재 여부 확인
    if (input.parent_id) {
      const parentMenu = await this.menuRepository.findById(input.parent_id);
      if (!parentMenu) {
        throw new NotFoundError('Parent menu not found');
      }
    }

    const menu = await this.menuRepository.create(input, this.currentUser.id);

    return { menu };
  }

  /**
   * 메뉴 수정 (super_admin 전용)
   */
  async updateMenu(menuId: string, input: UpdateMenuRequest) {
    this.requireSuperAdmin();

    // 메뉴 존재 여부 확인
    const existingMenu = await this.menuRepository.findById(menuId);
    if (!existingMenu) {
      throw new NotFoundError('Menu not found');
    }

    // Code 변경 시 중복 체크
    if (input.code && input.code !== existingMenu.code) {
      const duplicateMenu = await this.menuRepository.findByCode(input.code);
      if (duplicateMenu) {
        throw new Error(`Menu with code "${input.code}" already exists`);
      }
    }

    // parent_id 변경 시 부모 메뉴 존재 여부 확인
    if (input.parent_id !== undefined && input.parent_id !== null) {
      const parentMenu = await this.menuRepository.findById(input.parent_id);
      if (!parentMenu) {
        throw new NotFoundError('Parent menu not found');
      }

      // 자기 자신을 부모로 설정하는 것 방지
      if (input.parent_id === menuId) {
        throw new Error('Menu cannot be its own parent');
      }
    }

    const menu = await this.menuRepository.update(
      menuId,
      input,
      this.currentUser.id
    );

    return { menu };
  }

  /**
   * 메뉴 삭제 (super_admin 전용)
   * Soft delete: is_active = false
   */
  async deleteMenu(menuId: string, hardDelete = false) {
    this.requireSuperAdmin();

    // 메뉴 존재 여부 확인
    const existingMenu = await this.menuRepository.findById(menuId);
    if (!existingMenu) {
      throw new NotFoundError('Menu not found');
    }

    // Hard delete 또는 Soft delete
    if (hardDelete) {
      await this.menuRepository.hardDelete(menuId);
    } else {
      await this.menuRepository.softDelete(menuId);
    }

    return { success: true };
  }

  /**
   * Admin User의 메뉴 권한 업데이트 (super_admin 전용)
   */
  async updateAdminMenuPermissions(
    adminUserId: string,
    menuIds: string[]
  ): Promise<{
    success: boolean;
    permissions: AdminMenuPermission[];
  }> {
    this.requireSuperAdmin();

    // 1. 기존 권한 전체 삭제
    await this.menuRepository.deletePermissionsByAdminId(adminUserId);

    // 2. 새로운 권한 일괄 생성
    let permissions: AdminMenuPermission[] = [];

    if (menuIds.length > 0) {
      // 메뉴 ID 유효성 검증
      const validMenuIds = await this.validateMenuIds(menuIds);
      permissions = await this.menuRepository.createPermissions(
        adminUserId,
        validMenuIds,
        this.currentUser.id
      );
    }

    return {
      success: true,
      permissions,
    };
  }

  /**
   * Admin User의 현재 메뉴 권한 조회 (super_admin 전용)
   */
  async getAdminMenuPermissions(
    adminUserId: string
  ): Promise<AdminMenuPermission[]> {
    this.requireSuperAdmin();

    return await this.menuRepository.findPermissionsByAdminId(adminUserId);
  }

  // ========== Helper Methods ==========

  private requireSuperAdmin() {
    if (this.currentUser.role !== 'super_admin') {
      throw new ForbiddenError(
        'Forbidden: Only super_admin can perform this action'
      );
    }
  }

  /**
   * 메뉴 ID 배열 유효성 검증
   */
  private async validateMenuIds(menuIds: string[]): Promise<string[]> {
    const validIds: string[] = [];

    for (const menuId of menuIds) {
      const menu = await this.menuRepository.findById(menuId);
      if (menu) {
        validIds.push(menuId);
      } else {
        console.warn(`Invalid menu ID: ${menuId}`);
      }
    }

    return validIds;
  }
}
