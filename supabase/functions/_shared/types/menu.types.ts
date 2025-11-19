// Menu related types

export interface Menu {
  id: string;
  code: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  path: string | null;
  icon: string | null;
  display_order: number;
  is_active: boolean;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface MenuWithChildren extends Menu {
  children?: MenuWithChildren[];
}

export interface AdminMenuPermission {
  id: string;
  admin_id: string;
  menu_id: string;
  granted_by: string | null;
  granted_at: string;
}

// Request/Response types

export interface GetAdminMenusRequest {
  admin_id?: string; // Optional, if not provided, use JWT user
}

export interface GetAdminMenusResponse {
  menus: MenuWithChildren[];
}

export interface GetAllMenusResponse {
  menus: MenuWithChildren[];
}

export interface CreateMenuRequest {
  code: string;
  name: string;
  description?: string;
  parent_id?: string;
  path?: string;
  icon?: string;
  display_order?: number;
  is_active?: boolean;
  metadata?: Record<string, any>;
}

export interface CreateMenuResponse {
  menu: Menu;
}

export interface UpdateMenuRequest {
  code?: string;
  name?: string;
  description?: string;
  parent_id?: string;
  path?: string;
  icon?: string;
  display_order?: number;
  is_active?: boolean;
  metadata?: Record<string, any>;
}

export interface UpdateMenuResponse {
  menu: Menu;
}

export interface DeleteMenuResponse {
  success: boolean;
}

export interface UpdateAdminMenuPermissionsRequest {
  admin_user_id: string;
  menu_ids: string[];
}

export interface UpdateAdminMenuPermissionsResponse {
  success: boolean;
  permissions: AdminMenuPermission[];
}
