# RLS 정책 및 권한 구조 분석

## 현재 상황 요약

### shops 테이블 RLS 정책

| 정책명 | 역할 | 권한 | 조건 | 상태 |
|--------|------|------|------|------|
| Super admins and admins have full access to shops | super_admin, admin | ALL (CRUD) | active + approved | ✅ 정상 |
| Owners can view their own shops | owner | SELECT | shop_owners 테이블 매핑 + verified | ✅ 정상 |
| Owners can update their own shops | owner | UPDATE | shop_owners 테이블 매핑 + verified | ✅ 정상 |
| Public users can view verified shops | anon, authenticated (owner 제외) | SELECT | verification_status = 'verified' | ✅ 정상 |

### 역할별 권한 정리

#### 1. Super Admin (super_admin)
- **shops 테이블:** CRUD 모두 가능 (RLS 정책 통과)
- **edge function:** ❌ 차단됨 (role !== 'admin' 체크)
- **직접 DB 쿼리:** ✅ 가능 (RLS 정책으로 보호됨)

#### 2. Admin (admin)
- **shops 테이블:** CRUD 모두 가능 (RLS 정책 통과)
- **edge function:** ✅ 사용 가능
- **직접 DB 쿼리:** ✅ 가능 (RLS 정책으로 보호됨)

#### 3. Owner (owner)
- **shops 테이블:** 본인 매장만 Read, Update 가능 (RLS 정책 통과)
- **edge function:** ❌ 차단됨 (role !== 'admin' 체크)
- **직접 DB 쿼리:** ✅ 가능 (본인 매장만, RLS 정책으로 제한됨)

## 문제점 분석

### 문제 1: Edge Function의 잘못된 권한 체크

**현재 코드 (admin-create-shop, admin-update-shop 등):**
```typescript
const { data: userData, error: userError } = await supabaseClient
  .from('admin_users')
  .select('role')
  .eq('id', user.id)
  .single();

if (userError || userData?.role !== 'admin') {
  return new Response(JSON.stringify({
    error: 'Forbidden: Admin access required'
  }), { status: 403 });
}
```

**문제:**
- `super_admin`도 거부됨 (role !== 'admin')
- `owner`도 거부됨 (role !== 'admin')

**올바른 체크:**
```typescript
// 방법 1: 허용할 역할 배열로 체크
const ALLOWED_ROLES = ['super_admin', 'admin'];
if (!ALLOWED_ROLES.includes(userData?.role)) {
  return error('Forbidden');
}

// 방법 2: owner 제외
if (userData?.role === 'owner') {
  return error('Forbidden: Shop owners cannot use this endpoint');
}
```

### 문제 2: Edge Function이 필요한 이유

Edge Function에서 Service Role Key를 사용하는 이유:

1. **복잡한 관계 처리**
   - shops 생성 + shop_tags 자동 생성 (원자적 트랜잭션)
   - RLS를 우회하지 않으면 shop_tags 테이블도 RLS 정책 필요

2. **비즈니스 로직 집중화**
   - 유효성 검사 (좌표 범위, 필수 필드 등)
   - 24시간 영업 시 business_hours null 처리
   - 태그 관계 자동 관리

3. **audit 로깅 (미래 구현)**
   - 누가, 언제, 무엇을 수정했는지 기록

### 문제 3: RLS vs Edge Function 혼용으로 인한 혼란

현재 구조:
- **RLS 정책:** shops 테이블에 대한 직접 접근 제어
- **Edge Function:** 복잡한 비즈니스 로직 + Service Role로 RLS 우회

이로 인해:
- Admin이 직접 supabase client로 shops를 CRUD 하면 → RLS 정책 적용
- Admin이 edge function을 호출하면 → Service Role로 RLS 우회
- 두 가지 경로가 공존하여 혼란 발생

## 해결 방안

### 방안 1: Edge Function 권한 체크 수정 (권장)

**장점:**
- 최소한의 변경
- 기존 구조 유지
- Service Role Key 활용으로 복잡한 로직 처리 가능

**단점:**
- Edge Function 호출 필요 (네트워크 지연)
- Cold start 이슈 가능성

**구현:**

#### 1.1 Edge Function 권한 체크 수정

```typescript
// admin-create-shop, admin-update-shop 등 모든 edge function
const { data: userData } = await supabaseClient
  .from('admin_users')
  .select('role, status, approval_status')
  .eq('id', user.id)
  .single();

// super_admin과 admin만 허용
const ALLOWED_ROLES = ['super_admin', 'admin'];
if (!userData || !ALLOWED_ROLES.includes(userData.role)) {
  return new Response(JSON.stringify({
    error: 'Forbidden: Admin or Super Admin access required'
  }), { status: 403 });
}

// 추가 보안 체크
if (userData.status !== 'active' || userData.approval_status !== 'approved') {
  return new Response(JSON.stringify({
    error: 'Forbidden: Account not active or approved'
  }), { status: 403 });
}
```

#### 1.2 Owner용 별도 Edge Function 생성

Owner는 본인 매장만 수정할 수 있으므로, 별도의 edge function 생성:

```typescript
// owner-update-shop
const { data: userData } = await supabaseClient
  .from('admin_users')
  .select('role')
  .eq('id', user.id)
  .single();

if (userData?.role !== 'owner') {
  return error('Forbidden: Owner access required');
}

// shop_owners 테이블로 소유권 검증
const { data: ownership } = await supabaseClient
  .from('shop_owners')
  .select('shop_id')
  .eq('owner_id', user.id)
  .eq('shop_id', shopId)
  .eq('verified', true)
  .single();

if (!ownership) {
  return error('Forbidden: You do not own this shop');
}

// Service Role로 업데이트 (owner가 수정 가능한 필드만)
```

### 방안 2: 어드민에서 직접 DB 접근 + RLS 활용 (추천)

**장점:**
- Edge Function 호출 불필요 (성능 향상)
- RLS 정책만으로 권한 제어 (단순화)
- Cold start 이슈 없음

**단점:**
- shop_tags 관계 테이블도 RLS 정책 추가 필요
- 클라이언트에서 여러 API 호출 필요 (shops + shop_tags)
- 복잡한 비즈니스 로직을 클라이언트에서 처리

**구현:**

#### 2.1 shop_tags 테이블 RLS 정책 추가

```sql
-- Super admin, Admin: 모든 shop_tags CRUD 가능
CREATE POLICY "Super admins and admins have full access to shop_tags"
ON shop_tags FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_users
    WHERE admin_users.id = auth.uid()
    AND admin_users.role IN ('super_admin', 'admin')
    AND admin_users.status = 'active'
    AND admin_users.approval_status = 'approved'
  )
);

-- Owner: 본인 매장의 shop_tags만 조회 가능
CREATE POLICY "Owners can view their shop tags"
ON shop_tags FOR SELECT
TO authenticated
USING (
  shop_id IN (
    SELECT shop_id FROM shop_owners
    WHERE owner_id = auth.uid()
    AND verified = true
  )
);

-- Public: 검증된 매장의 tags 조회 가능
CREATE POLICY "Public can view verified shop tags"
ON shop_tags FOR SELECT
TO anon, authenticated
USING (
  shop_id IN (
    SELECT id FROM shops
    WHERE verification_status = 'verified'
    AND is_deleted = false
  )
);
```

#### 2.2 클라이언트에서 직접 DB 접근

```typescript
// src/services/admin-shop.service.ts (새로 생성)

export class AdminShopService {
  /**
   * Admin/Super Admin이 Shop 생성 (RLS 활용)
   */
  static async createShop(shopData: ShopCreateData, tagIds?: string[]) {
    // 1. Shop 생성 (RLS가 자동으로 권한 체크)
    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .insert({
        ...shopData,
        created_by: (await supabase.auth.getUser()).data.user?.id,
        updated_by: (await supabase.auth.getUser()).data.user?.id,
      })
      .select()
      .single();

    if (shopError) {
      return { shop: null, error: shopError };
    }

    // 2. Tags 생성 (RLS가 자동으로 권한 체크)
    if (tagIds && tagIds.length > 0) {
      const shopTagsData = tagIds.map(tagId => ({
        shop_id: shop.id,
        tag_id: tagId,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      }));

      const { error: tagsError } = await supabase
        .from('shop_tags')
        .insert(shopTagsData);

      if (tagsError) {
        console.error('Tags insert error:', tagsError);
        // Shop은 생성됨, tags만 실패
      }
    }

    // 3. Tags 포함한 Shop 조회
    const { data: shopWithTags } = await supabase
      .from('shops')
      .select(`
        *,
        shop_tags(
          tag_id,
          tags(id, name, description)
        )
      `)
      .eq('id', shop.id)
      .single();

    return { shop: shopWithTags || shop, error: null };
  }

  /**
   * Admin/Super Admin이 Shop 수정
   */
  static async updateShop(
    shopId: string,
    updates: ShopUpdateData,
    tagIds?: string[]
  ) {
    // 1. Shop 수정 (RLS가 자동으로 권한 체크)
    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .update({
        ...updates,
        updated_by: (await supabase.auth.getUser()).data.user?.id,
      })
      .eq('id', shopId)
      .select()
      .single();

    if (shopError) {
      return { shop: null, error: shopError };
    }

    // 2. Tags 업데이트 (있는 경우)
    if (tagIds !== undefined) {
      // 기존 tags 삭제
      await supabase
        .from('shop_tags')
        .delete()
        .eq('shop_id', shopId);

      // 새 tags 추가
      if (tagIds.length > 0) {
        const shopTagsData = tagIds.map(tagId => ({
          shop_id: shopId,
          tag_id: tagId,
          created_by: (await supabase.auth.getUser()).data.user?.id,
        }));

        await supabase
          .from('shop_tags')
          .insert(shopTagsData);
      }
    }

    // 3. Tags 포함한 Shop 조회
    const { data: shopWithTags } = await supabase
      .from('shops')
      .select(`
        *,
        shop_tags(
          tag_id,
          tags(id, name, description)
        )
      `)
      .eq('id', shopId)
      .single();

    return { shop: shopWithTags || shop, error: null };
  }

  /**
   * Admin/Super Admin이 Shop 삭제 (soft delete)
   */
  static async deleteShop(shopId: string) {
    const { data, error } = await supabase
      .from('shops')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        updated_by: (await supabase.auth.getUser()).data.user?.id,
      })
      .eq('id', shopId)
      .select()
      .single();

    return { shop: data, error };
  }
}
```

### 방안 3: 하이브리드 접근 (중간 절충안)

**구조:**
- **간단한 CRUD:** RLS로 직접 DB 접근 (Owner의 본인 매장 수정)
- **복잡한 로직:** Edge Function 사용 (Admin의 Shop 생성 + Tags)

**장점:**
- 각 상황에 맞는 최적의 방법 사용
- Owner는 간단한 수정만 가능 (RLS)
- Admin은 복잡한 생성/수정 가능 (Edge Function)

**단점:**
- 구조가 복잡해짐
- 관리 포인트 증가

## 권장 방안

### 단기 (즉시 적용):
**방안 1: Edge Function 권한 체크 수정**
- admin-create-shop, admin-update-shop, admin-delete-shop 등의 edge function에서 `super_admin`도 허용하도록 수정
- Owner용 별도 edge function 생성 (필요 시)

### 중장기 (리팩토링):
**방안 2: RLS 기반 직접 DB 접근**
- shop_tags 테이블 RLS 정책 추가
- Edge Function 제거 또는 최소화
- 클라이언트에서 직접 DB 접근 (AdminShopService)

이유:
1. **성능:** Edge Function cold start 이슈 제거
2. **단순성:** RLS 정책만으로 권한 제어
3. **유지보수:** 클라이언트 코드로 통일
4. **확장성:** 새로운 기능 추가 시 RLS 정책만 추가

## 다음 단계

1. **즉시:** Edge Function 권한 체크 버그 수정
2. **검토:** shop_tags, shop_images 등 관련 테이블 RLS 정책 확인
3. **결정:** 방안 2 (RLS 기반)로 마이그레이션할지 결정
4. **문서화:** 최종 결정 사항을 팀과 공유

## 참고: 현재 Edge Functions

| Function | 역할 | 사용 여부 |
|----------|------|-----------|
| admin-create-shop | Shop 생성 + Tags | 🟡 버그 (super_admin 차단) |
| admin-update-shop | Shop 수정 + Tags | 🟡 버그 (super_admin 차단) |
| admin-delete-shop | Shop 삭제 (soft) | 🟡 버그 (super_admin 차단) |
| admin-list-shops | Shop 목록 조회 | ❓ 필요성 검토 (RLS로 가능) |
| admin-get-shop | Shop 상세 조회 | ❓ 필요성 검토 (RLS로 가능) |
| admin-tags | Tags CRUD | 🟡 버그 (super_admin 차단) |
| upload-shop-images | 이미지 업로드 | ✅ 필요 (Storage 처리) |
| delete-shop-image | 이미지 삭제 | ✅ 필요 (Storage 처리) |
| update-shop-image-order | 이미지 순서 변경 | ❓ RLS로 가능할 수도 |

**조회(GET) 관련 Edge Functions는 제거 가능:**
- RLS 정책만으로 충분히 제어 가능
- 클라이언트에서 직접 supabase.from('shops').select() 호출

**생성/수정/삭제(CUD) 관련 Edge Functions:**
- 복잡한 로직이 없다면 RLS로 대체 가능
- 단, 이미지 업로드는 Storage 처리 필요
