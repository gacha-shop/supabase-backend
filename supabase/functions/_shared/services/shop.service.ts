/**
 * Shop Service
 * 비즈니스 로직 레이어 - 90% 재사용 가능!
 */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { AuthUser } from "../types/auth.types.ts";
import type {
  Shop,
  ShopCreateInput,
  ShopUpdateInput,
  ShopWithTags,
  ShopListFilters,
  PaginatedResponse,
} from "../types/shop.types.ts";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.ts";
import { validateShopInput } from "../utils/validation.ts";

export class ShopService {
  private supabase: SupabaseClient;

  constructor(private currentUser: AuthUser) {
    // Service Role Key로 Supabase 클라이언트 생성 (RLS 우회)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
  }

  /**
   * Admin/Super Admin: Shop 생성 (즉시 verified)
   */
  async createShop(input: ShopCreateInput): Promise<ShopWithTags> {
    // 권한 체크
    this.requireRole(["super_admin", "admin"]);

    // 유효성 검사
    validateShopInput(input);

    const { tag_ids, ...shopData } = input;

    // Shop 생성
    const { data: shop, error } = await this.supabase
      .from("shops")
      .insert({
        ...shopData,
        data_source: "admin_input",
        created_by: this.currentUser.id,
        updated_by: this.currentUser.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Shop insert error:", error);
      throw new Error(`Failed to create shop: ${error.message}`);
    }

    // Tags 연결 (있는 경우)
    if (tag_ids && tag_ids.length > 0) {
      await this.attachTags(shop.id, tag_ids);
    }

    // Tags 포함 조회
    return await this.getShopById(shop.id);
  }

  /**
   * General User: Shop 제보 (pending 상태)
   */
  async submitShop(input: ShopCreateInput): Promise<Shop> {
    // 로그인만 확인 (general_user도 가능)
    if (!this.currentUser.id) {
      throw new ForbiddenError("Authentication required");
    }

    // 유효성 검사
    validateShopInput(input);

    const { tag_ids, ...shopData } = input;

    const { data: shop, error } = await this.supabase
      .from("shops")
      .insert({
        ...shopData,
        verification_status: "pending",
        data_source: "user_input",
        created_by: this.currentUser.id,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to submit shop: ${error.message}`);
    }

    return shop;
  }

  /**
   * Admin/Super Admin: Shop 수정
   */
  async updateShop(
    shopId: string,
    input: ShopUpdateInput
  ): Promise<ShopWithTags> {
    this.requireRole(["super_admin", "admin"]);

    // 존재 확인
    await this.getShopById(shopId);

    const { tag_ids, ...updateData } = input;

    const { data: shop, error } = await this.supabase
      .from("shops")
      .update({
        ...updateData,
        updated_by: this.currentUser.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shopId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update shop: ${error.message}`);
    }

    // Tags 업데이트 (있는 경우)
    if (tag_ids !== undefined) {
      await this.replaceTags(shopId, tag_ids);
    }

    return await this.getShopById(shopId);
  }

  /**
   * Owner: 본인 매장 수정 (제한된 필드만)
   */
  async updateMyShop(
    shopId: string,
    input: ShopUpdateInput
  ): Promise<ShopWithTags> {
    this.requireRole(["owner"]);

    // 소유권 검증
    await this.verifyOwnership(shopId);

    // Owner가 수정 가능한 필드만 허용
    const allowedFields = this.filterOwnerEditableFields(input);

    const { data: shop, error } = await this.supabase
      .from("shops")
      .update({
        ...allowedFields,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shopId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update shop: ${error.message}`);
    }

    return await this.getShopById(shopId);
  }

  /**
   * Super Admin Only: Shop 삭제 (soft delete)
   */
  async deleteShop(shopId: string): Promise<void> {
    // Super Admin만 삭제 가능
    this.requireRole(["super_admin"]);

    const { error } = await this.supabase
      .from("shops")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        updated_by: this.currentUser.id,
      })
      .eq("id", shopId);

    if (error) {
      throw new Error(`Failed to delete shop: ${error.message}`);
    }
  }

  /**
   * Shop 조회 (Tags 포함)
   */
  async getShopById(shopId: string): Promise<ShopWithTags> {
    const { data, error } = await this.supabase
      .from("shops")
      .select(
        `
        *,
        shop_tags (
          tag_id,
          tags (id, name, description)
        )
      `
      )
      .eq("id", shopId)
      .eq("is_deleted", false)
      .single();

    if (error || !data) {
      throw new NotFoundError(`Shop not found: ${shopId}`);
    }

    return data as ShopWithTags;
  }

  /**
   * Owner: 본인 매장 조회 (소유권 검증 포함)
   */
  async getMyShop(shopId: string): Promise<ShopWithTags> {
    this.requireRole(["owner"]);

    // 소유권 검증
    await this.verifyOwnership(shopId);

    // 검증 통과 후 조회
    return await this.getShopById(shopId);
  }

  /**
   * Shop 목록 조회 (필터링, 페이징)
   */
  async listShops(
    filters: ShopListFilters
  ): Promise<PaginatedResponse<ShopWithTags>> {
    let query = this.supabase
      .from("shops")
      .select("*, shop_tags(tag_id, tags(*))", { count: "exact" })
      .eq("is_deleted", false);

    // 권한별 필터링
    if (filters.role === "owner" && filters.ownerId) {
      // Owner: 본인 매장만
      const { data: ownerships } = await this.supabase
        .from("shop_owners")
        .select("shop_id")
        .eq("owner_id", filters.ownerId)
        .eq("verified", true);

      const shopIds = ownerships?.map((o) => o.shop_id) || [];
      if (shopIds.length === 0) {
        // 소유한 매장이 없으면 빈 결과 반환
        return {
          data: [],
          total: 0,
          page: filters.page || 1,
          limit: filters.limit || 20,
          totalPages: 0,
        };
      }
      query = query.in("id", shopIds);
    } else if (filters.role === "public") {
      // 일반 사용자: verified만
      query = query.eq("verification_status", "verified");
    }

    // 추가 필터
    if (filters.verificationStatus) {
      query = query.eq("verification_status", filters.verificationStatus);
    }

    // 페이징
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    // 정렬
    query = query.order("created_at", { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to list shops: ${error.message}`);
    }

    return {
      data: (data as ShopWithTags[]) || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };
  }

  // ==================== Private Methods ====================

  private requireRole(allowedRoles: string[]): void {
    if (!allowedRoles.includes(this.currentUser.role)) {
      throw new ForbiddenError(`Requires one of: ${allowedRoles.join(", ")}`);
    }
  }

  private async verifyOwnership(shopId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from("shop_owners")
      .select("id")
      .eq("shop_id", shopId)
      .eq("owner_id", this.currentUser.id)
      .eq("verified", true)
      .maybeSingle();

    if (error || !data) {
      throw new ForbiddenError("You do not own this shop");
    }
  }

  private filterOwnerEditableFields(
    input: ShopUpdateInput
  ): Partial<ShopUpdateInput> {
    const allowedFields = [
      "description",
      "phone",
      "business_hours",
      "is_24_hours",
      "gacha_machine_count",
      "main_series",
      "detail_address",
      "social_urls",
    ];

    return Object.keys(input)
      .filter((key) => allowedFields.includes(key))
      .reduce(
        (obj, key) => ({
          ...obj,
          [key]: input[key as keyof ShopUpdateInput],
        }),
        {}
      );
  }

  private async attachTags(shopId: string, tagIds: string[]): Promise<void> {
    const shopTags = tagIds.map((tagId) => ({
      shop_id: shopId,
      tag_id: tagId,
      created_by: this.currentUser.id,
    }));

    const { error } = await this.supabase.from("shop_tags").insert(shopTags);

    if (error) {
      console.error("Tags insert error:", error);
      // Tags 실패는 Shop 생성을 막지 않음
    }
  }

  private async replaceTags(shopId: string, tagIds: string[]): Promise<void> {
    // 기존 tags 삭제
    await this.supabase.from("shop_tags").delete().eq("shop_id", shopId);

    // 새 tags 추가
    if (tagIds.length > 0) {
      await this.attachTags(shopId, tagIds);
    }
  }
}
